/**
 * buildQuery — QueryBuilder 主入口
 *
 * 纯函数。无副作用。无外部依赖（time/random/IO）。
 *
 * 架构：纯组合（ADR-002）—— 每个子 translator 独立纯函数，主入口只做拼装。
 *
 * **度量字段语义**（与真实后端一致，参见 probe 中的 curl 示例）：
 *   viewConfig.values 是前端的 UI 占位（"数值"区）。后端 query 不需要 `values` 字段，
 *   而是把度量名直接列在 `query.columns` 数组里（默认度量沿列轴展开）。
 *   P1+ 若引入 MeasureGroupName 占位字段决定度量轴方位，再让 values 改追加 query.rows。
 *
 * **Hierarchy drill**（[docs/adr-004-hierarchy-drill.md](../../../docs/adr-004-hierarchy-drill.md) C2）：
 *   一个 Hierarchy with drillDepth=N → query.rows 含 N 个 level fieldName。
 *
 * **fields 数组**（用户 2026-05-05 联调指出）：P0 输出 `[]`。
 *   后端从 metadata 自动解析 row/column 字段；不需要前端发 DimensionField/MeasureField。
 *   P1+ 当需要 aggregator 覆盖 / quickCalc / 字段级 dataFormat 等高级设置时再添加输出。
 *   注：若一定要发 DimensionField，必须包含 `level` 属性，否则后端会报错。
 *
 * P0 实现状态：
 *   - rows/columns/sorts/pageSettings：实做
 *   - fields：[]（按上述说明）
 *   - filters[user filter]/measureFilters/customElements：stub 返回 []
 *   - engineType / cacheType：不传，由后端默认决定
 */

import type { Metadata, PageState, RowField, ViewConfig } from '../../types/index.js';
import type { QueryField, Query } from '../../types/query.js';
import { buildMetadataIndex, type MetadataIndex } from '../metadata/fieldIndex.js';
import type { FieldNode } from '../../types/metadata.js';
import {
  dedupColumnFields,
  dedupRowFields,
  dedupValueFields,
} from '../viewConfig/findDuplicates.js';
import { getMeasureFieldName } from '../viewConfig/quickCalcs.js';

import { placeMeasureAxis } from './measureAxis.js';
import { translateDimensionFilter } from './translators/dimensionFilter.js';
import { translateMeasureFilters } from './translators/measureFilter.js';
import { buildPageSettings } from './translators/pageSettings.js';
import { translateColumns, translateRows } from './translators/rows.js';
import { translateSorts } from './translators/sorts.js';
import { translateCustomElements } from './translators/stubs.js';
import { validateViewConfig } from './validators.js';

/**
 * 上溯找 hierarchy 父节点(HIERARCHY 或 HIERARCHY_TIME)— 用于普通 LEVEL_* 字段
 * 反查 dimension name(metadata.hierarchy 字段是类型枚举,不可用,见 detectTimeAxis 同样问题)
 */
function findHierarchyAncestor(
  node: FieldNode,
  index: MetadataIndex,
): FieldNode | null {
  let cur: FieldNode | null = index.findParentByName(node.name);
  while (cur) {
    if (cur.type === 'HIERARCHY' || cur.type === 'HIERARCHY_TIME') return cur;
    cur = index.findParentByName(cur.name);
  }
  return null;
}

/**
 * 把行/列字段中**有 subTotal 设置**的部分翻成 DimensionField,发给后端控制小计显示。
 *
 * 不变量:
 *   - 没设 subTotal 的字段不发(后端默认 HIDDEN,fields=[] 时自动按 metadata 解析)
 *   - Hierarchy:展开 drillDepth 个 levels,只在**最浅层(top level)** 放 subTotal=SHOW,
 *     其他层 HIDDEN — 用户语义"这个维度的小计"通常指最外层(年小计 vs 季度小计)
 *   - 普通 LEVEL 字段:1 个 DimensionField,带原 subTotal
 *   - dimension 字段:hierarchy 自身 name / 上溯找 HIERARCHY 父的 name / 字段自身 name(降级)
 */
function buildDimensionFields(
  fields: RowField[],
  index: MetadataIndex,
): QueryField[] {
  const out: QueryField[] = [];
  for (const f of fields) {
    if (f.type === 'MeasureGroupName') continue;
    const subTotal = f.subTotal;
    if (!subTotal || subTotal === 'HIDDEN') continue;
    const node = index.findByName(f.fieldName);
    if (!node) continue; // customField id 不在 metadata,P3 联调时再扩

    if (node.type === 'HIERARCHY' || node.type === 'HIERARCHY_TIME') {
      const depth = Math.max(1, f.drillDepth ?? 1);
      const levels = node.children.slice(0, depth);
      levels.forEach((level, i) => {
        out.push({
          _enum: 'DimensionField',
          name: level.name,
          dimension: node.name,
          level: level.name,
          subTotal: i === 0 ? subTotal : 'HIDDEN',
        });
      });
      continue;
    }

    // 普通 LEVEL_* / FIELD / 其他 — 上溯找 hierarchy 父
    const hier = findHierarchyAncestor(node, index);
    out.push({
      _enum: 'DimensionField',
      name: node.name,
      dimension: hier?.name ?? node.name,
      level: node.name,
      subTotal,
    });
  }
  return out;
}

export function buildQuery(rawViewConfig: ViewConfig, metadata: Metadata, pageState: PageState): Query {
  // P5+ 翻译前 first-wins dedup — 拖拽不限制重复(UI 红边框已示警),query 层去重避免后端 406
  // 见 docs/conditional-format-design.md 邻近 design pattern 与 findDuplicates.ts 不变量
  const viewConfig: ViewConfig = {
    ...rawViewConfig,
    rows: dedupRowFields(rawViewConfig.rows),
    columns: dedupColumnFields(rawViewConfig.columns),
    values: dedupValueFields(rawViewConfig.values),
  };
  const index = buildMetadataIndex(metadata);

  validateViewConfig(viewConfig, index);

  // 度量名沿列轴展开（默认），或按 MEASURE_GROUP_NAME 占位字段位置决定（P3）
  // 关键:沿轴展开的 name 跟 query.fields[].name 必须一致 — quickCalc 列要带后缀,
  // 否则后端列定义和列轴 reference 对不上。
  const measureFieldNames = viewConfig.values.map((v) => getMeasureFieldName(v));
  const placed = placeMeasureAxis(
    {
      rows: translateRows(viewConfig.rows, index),
      columns: translateColumns(viewConfig.columns, index),
    },
    measureFieldNames,
    viewConfig.rows,
    viewConfig.columns,
  );

  // sort 端要把 ByMeasure 的 name 替换成同样的新 name(否则 sort 引用不到列)
  // 只对 quickCalc'd measure 生效,普通 measure 仍用 measureName 不变
  const measureNameToFieldName = new Map<string, string>();
  for (const v of viewConfig.values) {
    if (v.quickCalc != null || v.aggregator != null) {
      measureNameToFieldName.set(v.measureName, getMeasureFieldName(v));
    }
  }

  return {
    modelId: metadata.id,
    queryType: 'PivotQuery',
    // engineType 由后端默认决定（不传）

    rows: placed.rows,
    columns: placed.columns,

    // P1.0：仅当 measure 设置了 quickCalc 时才发 MeasureField；否则 fields=[]，
    // 后端从 metadata 自动解析（用户 2026-05-05 联调指出）
    // ⚠ name 必须带 quickCalc 后缀 — 同一 measure 原值 + quickCalc 同时使用时,
    //   两列 name 重复会让后端 cellSet 列冲突报错
    // P3 (2026-05-06):row/column 字段中有 subTotal 设置的也发 DimensionField,
    // 后端默认 subTotal=HIDDEN,前端不发就看不到小计行
    fields: [
      ...buildDimensionFields(viewConfig.rows, index),
      ...buildDimensionFields(viewConfig.columns, index),
      ...viewConfig.values
        // 任一 override 就发 MeasureField:quickCalc 或 aggregator(P3+)
        .filter((v) => v.quickCalc != null || v.aggregator != null)
        .map((v): QueryField => {
          const f: QueryField = {
            _enum: 'MeasureField' as const,
            name: getMeasureFieldName(v),
            measure: v.measureName,
          };
          if (v.aggregator != null) f.aggregator = v.aggregator;
          if (v.quickCalc != null) f.quickCalc = v.quickCalc;
          return f;
        }),
    ],

    // 维度过滤:用 query.dimensionFilter (Filter 树,支持嵌套 And/Or/Not)
    // query.filters 是兼容层,保持空数组(后端真正读 dimensionFilter)
    filters: [],
    dimensionFilter: ((): { filter: import('../../types/query.js').Filter } | null => {
      const f = translateDimensionFilter(viewConfig.filters);
      return f === null ? null : { filter: f };
    })(),
    measureFilters: translateMeasureFilters(viewConfig.measureFilters),

    rowSorts: translateSorts(viewConfig.rowSorts, measureNameToFieldName),
    columnSorts: translateSorts(viewConfig.columnSorts, measureNameToFieldName),

    pageSettings: buildPageSettings(pageState),
    customElements: translateCustomElements(viewConfig.customFields, metadata),
  };
}
