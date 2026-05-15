/**
 * buildDetailQuery — 把"用户查看明细"翻译成 DetailQuery(P3+)
 *
 * 设计(2026-05-06 用户实测确认):
 *   - 复用 Query schema,只是 queryType='DetailQuery'(后端按 detail 模式跑,无聚合)
 *   - rows:
 *     - 当前 viewConfig.rows + viewConfig.columns 字段(展开 hierarchy levels,跳 MeasureGroupName)
 *     - **加上 viewConfig.values 的普通 Measure**(明细每行一个数值)
 *     - **跳过 CalcMeasure**(后端聚合表达式,无单行明细概念)/ 跳过 UserCalcMeasure(canViewDetail 已挡)
 *   — 用户语义:看当前透视表对应的明细记录(不是聚合后的数字,是记录本身)
 *   - columns: []
 *   - fields: []
 *   - **dimensionFilter**: 当前 viewConfig.filters 维度过滤(用户在 FilterPanel 设的条件 全部带过去)
 *   - **filters**: 单元格定位 FieldFilter[](rowMember + colMember 每个非度量、非总计的 member)
 *     - Toolbar"明细"按钮:rowMember/colMember=[],filters=[](只走 dimensionFilter)
 *     - 单元格右键"查看明细":行列成员路径转 FieldFilter,**跟 dimensionFilter AND**(后端两路同时生效)
 *   - measureFilters: []  (DetailQuery 无聚合,度量过滤无意义)
 *   - pageSettings: rowPageSize=10000(PRD §3.3 明细上限)
 *
 * **不支持自建字段(calc_measure/enum_group/range_group)**:
 *   后端 DetailQuery 不解析 customElements,前端 UI 层判断 viewConfig.customFields 非空时
 *   禁用"查看明细"入口(canViewDetail 函数)
 *
 * 不变量:
 *   - 度量 member(dimension='Measures')跳过 filter(那是当前在看哪个度量,不是限定条件)
 *   - 总计 member(level='(All)')跳过 filter(没限定意义,会过滤掉所有数据)
 *   - 同 fieldName 多 member 时,每个独立 FieldFilter(语义 AND,顶层 filters[] 隐式 AND)
 */

import type { Member } from '../../types/cellSet.js';
import type { Metadata, ViewConfig } from '../../types/index.js';
import type { Query, FieldFilter } from '../../types/query.js';
import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { buildPageSettings } from '../queryBuilder/translators/pageSettings.js';
import { translateRows, translateColumns } from '../queryBuilder/translators/rows.js';
import { translateDimensionFilter } from '../queryBuilder/translators/dimensionFilter.js';
import { splitMeasureFieldName } from '../viewConfig/quickCalcs.js';

/** PRD §3.3:明细行数上限,超过提示用户加筛选 */
export const DRILL_THROUGH_MAX_ROWS = 10000;

/** 总计行的 level 标识(后端约定,跟 parseCellSet 一致) */
const ALL_LEVEL = '(All)';

/** 度量轴的 dimension 标识 */
const MEASURES_DIMENSION = 'Measures';

/**
 * 把单个 member 转为 FieldFilter(等值定位)。
 * 度量 / 总计 member 返回 null(由调用方过滤掉)。
 */
function memberToFieldFilter(member: Member): FieldFilter | null {
  if (member.dimension === MEASURES_DIMENSION) return null;
  if (member.level === ALL_LEVEL) return null;
  return {
    _enum: 'FieldFilter',
    field: member.fieldName,
    filter: {
      _enum: 'ByValue',
      operator: 'Equals',
      // 用 member.name(level 内的 caption / unique 局部名)— 后端用它定位
      value: member.name,
    },
  };
}

export interface BuildDetailQueryInput {
  viewConfig: ViewConfig;
  metadata: Metadata;
  /** 用户点击的单元格的 row tuple(cellSet.rows[rowIndex]) */
  rowMember: Member[];
  /** 用户点击的单元格的 col tuple(cellSet.columns[colIndex]) */
  colMember: Member[];
  /** 可选:覆盖默认 pageSize 上限 */
  maxRows?: number;
}

export function buildDetailQuery(input: BuildDetailQueryInput): Query {
  const { viewConfig, metadata, rowMember, colMember } = input;
  const maxRows = input.maxRows ?? DRILL_THROUGH_MAX_ROWS;
  const index = buildMetadataIndex(metadata);

  // rows: 当前 viewConfig.rows + columns 字段(展开 hierarchy levels;MeasureGroupName 跳)
  // — 用户语义"看明细"= 看当前透视表那些字段的原始记录(同字段集,只是不聚合)
  const dimRows = viewConfig.rows.filter((r) => r.type !== 'MeasureGroupName');
  const dimCols = viewConfig.columns.filter((c) => c.type !== 'MeasureGroupName');

  // 度量字段:只带普通 Measure(每行一个数值),跳过 CalcMeasure(聚合表达式无明细概念)
  // UserCalcMeasure(自建)已被 canViewDetail 整体挡住,不会到这里
  //
  // P5+ 单 cell drill-through 时只带该 cell 对应的 measure:
  //   - 用户语义:"我点的这个销售额=2,454,777 怎么来的" — 带 销售成本 这些无关 measure 没意义
  //   - 而且如果两个 measure 来自不同 view,后端 DetailQuery 还会报错
  //   - cell 的 colMember/rowMember 里如果有 dimension='Measures' member,则其 fieldName(去掉
  //     @AGG@/@QC@ 后缀)就是该 cell 对应的 measure
  //   - Toolbar"明细"按钮(无 cell context)→ rowMember/colMember=[] → 没 Measure member
  //     → 退化为"带所有 measures"(向后兼容)
  let cellMeasureBaseName: string | null = null;
  for (const m of [...rowMember, ...colMember]) {
    if (m.dimension === MEASURES_DIMENSION) {
      cellMeasureBaseName = splitMeasureFieldName(m.fieldName).measureName;
      break; // 一个 cell tuple 只对应一个 measure,首个即可
    }
  }
  const measureFieldNames: string[] = [];
  const seenMeasures = new Set<string>();
  for (const v of viewConfig.values) {
    const node = index.findByName(v.measureName);
    if (node?.type !== 'MEASURE') continue;
    // CalcMeasure / 自建字段 跳过
    if (cellMeasureBaseName !== null && v.measureName !== cellMeasureBaseName) continue;
    // 同 measureName 不同 agg/qc 可能在 values 出现多次 — DetailQuery 不关心聚合,dedup
    if (seenMeasures.has(v.measureName)) continue;
    seenMeasures.add(v.measureName);
    measureFieldNames.push(v.measureName);
  }

  const detailRows = [
    ...translateRows(dimRows, index),
    ...translateColumns(dimCols, index),
    ...measureFieldNames,
  ];

  // 单元格定位 filter:rowMember + colMember 每个非度量、非总计 member 一个 FieldFilter
  //   - Toolbar"明细"场景:rowMember/colMember=[],无 cell 定位
  //   - 单元格右键场景:这些 FieldFilter 跟 dimensionFilter 同时发,后端隐式 AND
  const cellFilters: FieldFilter[] = [];
  for (const m of rowMember) {
    const f = memberToFieldFilter(m);
    if (f) cellFilters.push(f);
  }
  for (const m of colMember) {
    const f = memberToFieldFilter(m);
    if (f) cellFilters.push(f);
  }

  // 维度过滤:viewConfig.filters → query.dimensionFilter(嵌套 And/Or 树)
  // 跟 cellFilters 顶层 AND(后端两路同时生效)
  const dimFilter = translateDimensionFilter(viewConfig.filters);

  return {
    modelId: metadata.id,
    queryType: 'DetailQuery',

    rows: detailRows,
    columns: [],
    fields: [],

    filters: cellFilters,
    dimensionFilter: dimFilter === null ? null : { filter: dimFilter },
    measureFilters: [], // DetailQuery 无聚合,度量过滤无意义

    rowSorts: [],
    columnSorts: [],

    pageSettings: buildPageSettings({
      ...viewConfig.pageState,
      rowPageNo: 1,
      rowPageSize: maxRows,
      columnPageNo: 1,
      columnPageSize: maxRows,
    }),
    customElements: [],
  };
}

/**
 * 检查当前 viewConfig 是否能"查看明细"。
 *   - 包含自建字段(calc_measure / enum_group / range_group)→ false
 *     (后端 DetailQuery 不解析 customElements;前端禁用入口避免发废 query)
 *   - 否则 true
 *
 * UI 用此函数控制 toolbar"明细"按钮 / 单元格右键"查看明细"项的 disabled 状态。
 */
export function canViewDetail(viewConfig: ViewConfig): boolean {
  return viewConfig.customFields.length === 0;
}
