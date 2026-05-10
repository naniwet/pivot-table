/**
 * buildAdhocQuery — 即席查询(明细)模式的 Query 构造(P5+)
 *
 * 跟 buildQuery(透视模式)的差异:
 *   - queryType: 'DetailQuery'(后端走 SQL 直连,不聚合)
 *   - rows: viewConfig.rows[].fieldName(展开 Hierarchy levels;measure 由后端自动转 baseField)
 *   - columns: []
 *   - fields: []
 *   - customElements: [](adhoc 不支持自建字段)
 *   - measureFilters: [](无聚合 → 度量过滤无意义)
 *   - dimensionFilter: 透传 viewConfig.filters(adhoc 仍支持维度过滤)
 *   - rowSorts: BASC/BDESC 自动降级到 ASC/DESC(adhoc 没有"分组内排序"语义)
 *   - pageSettings:
 *     - 不开 isCrossTable
 *     - 不发 compressEmpty / showGrandTotal / subTotalAtEnd(adhoc 没合计概念)
 *     - rowPageSize 仍生效(用户翻页);columnPageSize 设 1(无列分页)
 *
 * 不变量:
 *   I1. queryType === 'DetailQuery'
 *   I2. rows 顺序 = viewConfig.rows 顺序(保留用户拖入顺序,Hierarchy 展开多 level)
 *   I3. dimensionFilter 透传(viewConfig.filters 树形 → ByValue / And / Or / Not)
 *   I4. measureFilters / customElements / fields 全空
 *   I5. rowSorts 不含 BASC/BDESC(自动转 ASC/DESC)
 */

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { translateRows } from './translators/rows.js';
import { translateDimensionFilter } from './translators/dimensionFilter.js';
import type { Metadata } from '../../types/metadata.js';
import type { CustomElement, Filter, Query } from '../../types/query.js';
import type { ClientFilter, PageState, ViewConfig } from '../../types/viewConfig.js';

/** PRD §3.3 / buildDetailQuery 共识:明细行数上限 */
const ADHOC_MAX_ROWS = 10000;

/** BASC/BDESC → ASC/DESC(adhoc 无分组排序语义) */
function downgradeDir(d: 'ASC' | 'DESC' | 'BASC' | 'BDESC'): 'ASC' | 'DESC' {
  return d === 'BASC' ? 'ASC' : d === 'BDESC' ? 'DESC' : d;
}

// ============================================================
// adhoc 下 Measure 当原始列过滤(场景 1 — 销售额>500)的预处理
// ============================================================
//
// 问题: 用户在 adhoc 模式下把 measure(如"销售额")拖入"筛选"区,期望得到
//       SQL `WHERE 销售额 > 500` 的效果。但 query.dimensionFilter 内部用 ByLevel,
//       而 Measure 在 metadata 里不是 level — 直接 ByLevel{level: measureName} 后端
//       会报 "xxx not exists"(probe 实证)。
//
// 设计(2 步 fallback):
//   1) 优先**找已有 level**:metadata.levels 里如果有 level.refDataSetFieldId === measure.refDataSetFieldId
//      (即两者指向同一物理字段),直接用 level.name 走 ByLevel — 不污染 customElements,
//      payload 更短,level 名是真实业务名(更可读)
//   2) 找不到才 declare CustomDimension:走 path E(probe 实证),
//      在 query.customElements push 一个 synth dim 包装物理 view + column,
//      ByLevel 引用 synth name
//
// 不变量:
//   - viewConfig.filters 里 leaf.field 仍存原 measureName(给 chip 显示原 alias 用)
//   - build 时由 preprocess 替换 leaf.field
//   - 同一 measure 多次拖入只 declare 一次 customElement(deterministic name 去重)
//   - 非 measure 的 leaf 不动(普通维度过滤照常 ByLevel{measureName 是 level})

const MEASURE_FILTER_DIM_PREFIX = '__measure_filter_';

/**
 * 给一个 measureName 生成 synth dim/level 的 name(deterministic,同 measure 多次调用复用)。
 */
function synthDimNameFor(measureName: string): string {
  return `${MEASURE_FILTER_DIM_PREFIX}${measureName}`;
}

/**
 * 在 metadata.levels 中找跟 measure 指向同一物理字段的 level。
 * 匹配条件:level.refDataSetFieldId === measure.refDataSetFieldId(都非空,且相等)。
 *
 * 找到 → 用它的 name 直接走 ByLevel,免得 declare CustomDimension。
 * 找不到 → 返 null,调用方 fallback 到 declare CustomDimension。
 *
 * 为什么用 refDataSetFieldId 而不是 sqlColumnName:
 *   - refDataSetFieldId 是 metadata 内部稳定 id,匹配可靠
 *   - sqlColumnName 跨 view 不一定唯一,view 不同但同名可能误匹配
 */
function findMatchingLevel(
  measureName: string,
  metadata: Metadata,
): string | null {
  const m = metadata.measures.find((mm) => mm.name === measureName);
  if (!m || !m.refDataSetFieldId) return null;
  const lv = metadata.levels.find(
    (l) => l.refDataSetFieldId !== null && l.refDataSetFieldId === m.refDataSetFieldId,
  );
  return lv?.name ?? null;
}

/**
 * 为一个 measure 构造 CustomDimension declaration(包装它指向的物理 view + column)。
 * 返 null 表示物理 view/column 解析失败(metadata 不全),调用方应跳过该 measure。
 */
function buildSynthDimForMeasure(
  measureName: string,
  metadata: Metadata,
): CustomElement | null {
  const idx = buildMetadataIndex(metadata);
  const m = metadata.measures.find((mm) => mm.name === measureName);
  if (!m) return null;

  // 解析底层物理 column 名
  let columnName: string | null = null;
  if (m.refDataSetFieldId) {
    const f = metadata.fields.find((ff) => ff.id === m.refDataSetFieldId);
    if (f) columnName = f.name;
  }
  // fallback:简单 measure 直接绑 viewId,用 aliasFromDb 或 name
  if (!columnName) columnName = m.aliasFromDb || m.name;

  // 解析 view name(从 viewId → metadata.views)
  const viewName = idx.getViewName(measureName);
  if (!viewName) return null;

  const synthName = synthDimNameFor(measureName);
  const displayAlias = m.alias || m.aliasFromDb || m.name;

  // 跟 customElements.ts calc_column 段同构(已 probe 实证 — scripts/probe-adhoc-customdim-filter.ts E)
  return {
    _enum: 'CustomDimension',
    dimension: {
      name: synthName,
      alias: displayAlias,
      desc: '',
      hasAll: true,
      levels: [
        {
          name: synthName,
          alias: displayAlias,
          desc: '',
          levelType: { _enum: 'GENERIC' },
          dataFormat: m.dataFormat ?? '',
          valueType: m.valueType ?? 'DOUBLE',
          maskRule: '',
        },
      ],
    },
    levelBindings: [
      {
        dimension: synthName,
        level: synthName,
        view: viewName,
        column: columnName,
        isCalc: false,
      },
    ],
  } as unknown as CustomElement;
}

/**
 * 走 dim filter 树:
 *   - leaf.field 指向 measure → 2 步 fallback:
 *       a) 找到 metadata.levels 中匹配的 level(refDataSetFieldId 相同)→ 替换 leaf.field 成 level.name(免 declare)
 *       b) 找不到 → 替换成 synth name + 记下要 declare 的 customDim
 *   - leaf.field 是普通维度 → 保持
 *   - group 节点 → 递归
 *
 * 返:
 *   - filters: 替换后的树(leaf.field 已是真 level 名 或 synth name,适合直接喂 translateDimensionFilter)
 *   - customDimensions: 需要 push 到 query.customElements 的 declarations(已去重;命中真 level 时为空)
 */
function preprocessAdhocFilters(
  filters: ClientFilter[],
  metadata: Metadata,
): { filters: ClientFilter[]; customDimensions: CustomElement[] } {
  const declared = new Map<string, CustomElement>(); // measureName → CustomDimension(去重)

  function isMeasureName(name: string): boolean {
    return metadata.measures.some((m) => m.name === name);
  }

  function walk(node: ClientFilter): ClientFilter {
    if (node.kind === 'leaf') {
      if (isMeasureName(node.field)) {
        const measureName = node.field;
        // 优化:先找 metadata.levels 里有没有同 refDataSetFieldId 的 level → 直接用它
        const realLevel = findMatchingLevel(measureName, metadata);
        if (realLevel) {
          return { ...node, field: realLevel };
        }
        // 没匹配 level → fallback declare CustomDimension
        if (!declared.has(measureName)) {
          const dim = buildSynthDimForMeasure(measureName, metadata);
          if (dim) declared.set(measureName, dim);
          // 解析失败时不替换 field — 让翻译走 ByLevel{level: measureName},后端报错时用户能看到原 measure 名
          else return node;
        }
        return { ...node, field: synthDimNameFor(measureName) };
      }
      return node;
    }
    return { ...node, children: node.children.map(walk) };
  }

  return {
    filters: filters.map(walk),
    customDimensions: [...declared.values()],
  };
}

export function buildAdhocQuery(
  viewConfig: ViewConfig,
  metadata: Metadata,
  pageState: PageState,
): Query {
  const index = buildMetadataIndex(metadata);

  // rows 翻译:复用 translateRows(展开 Hierarchy levels,处理 NamedSet 等)
  // measure 拖到 row 时,viewConfig.rows[].type 通常被 dropRules 拒绝;
  // 但 adhoc 模式我们放宽(允许任意类型当 row),后端会自动转。
  const rows = translateRows(viewConfig.rows, index);

  // 维度过滤:adhoc 唯一支持的过滤通道。
  // 预处理:把 dim filter 树里指向 measure 的 leaf 替换成 synth dim(见 preprocessAdhocFilters)
  const { filters: resolvedFilters, customDimensions } = preprocessAdhocFilters(
    viewConfig.filters,
    metadata,
  );
  const dimensionFilter = ((): { filter: Filter } | null => {
    const f = translateDimensionFilter(resolvedFilters);
    return f === null ? null : { filter: f };
  })();

  // rowSorts:BASC/BDESC 自动降级
  const rowSorts = viewConfig.rowSorts
    .filter((s) => s.type === 'ByDimension') // adhoc 没度量,只有按维度排序
    .map((s) => ({
      _enum: 'DimensionSort' as const,
      dimension: (s as { fieldName: string }).fieldName,
      direction: downgradeDir(s.direction),
    }));

  return {
    modelId: metadata.id,
    queryType: 'DetailQuery',
    rows,
    columns: [],
    fields: [], // adhoc 不发 DimensionField/MeasureField — 让后端自动按 metadata 解析
    filters: [],
    dimensionFilter,
    measureFilters: [], // adhoc 不支持
    rowSorts,
    columnSorts: [], // adhoc 没列轴排序
    pageSettings: {
      compressEmptyRows: false,
      compressEmptyColumns: false,
      rowPageNo: pageState.rowPageNo ?? 1,
      rowPageSize: Math.min(pageState.rowPageSize ?? ADHOC_MAX_ROWS, ADHOC_MAX_ROWS),
      columnPageNo: 1,
      columnPageSize: 1, // adhoc 无列分页
      showGrandTotal: false,
      // 2026-05-07 验证:DetailQuery 也开 isCrossTable=true,后端 cellSet 才把
      // query.rows 里所有字段都作为 row members(否则只返回前 2 个 dim 字段,
      // 用户实测多字段在 row 区时只看到前 2 列)
      isCrossTable: true,
      useFormat: true,
      useDataType: true,
      useTransform: true,
      handleSpecial: true,
    },
    // adhoc 不支持自建字段(customField)— 但允许 push synth CustomDimension 用于 measure 当原始列过滤
    customElements: customDimensions,
  };
}
