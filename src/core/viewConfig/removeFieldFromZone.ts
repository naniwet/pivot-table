/**
 * removeFieldFromZone — 从指定 zone 移除某字段
 *
 * 不变量:移除 value 区中的 measure 时,需同步清掉 rowSorts/columnSorts 中指向该 measure
 * 的 entry —— 否则下次 query 会带着 orphan sort,后端可能报错或行为奇怪。
 *
 * P3+ value zone 多 ValueField 同 measureName 处理:
 *   - chip 的唯一标识是 `getMeasureFieldName(v)`(可能含 @AGG@ / @QC@ 后缀)
 *   - 删除时优先按 encoded 名精确匹配单个 chip;退化按 measureName(兼容老调用方)
 *   - sort orphan 清理时按 measureName(因为 Sort.measureName 当前还是基础名)
 *
 * P5: filter zone 实现(用户反馈"筛选区的删除不生效"修复):
 *   - 维度筛选(filters):递归扫描树,删掉所有 leaf.field === fieldName 的节点;
 *     被删后空 group 也清掉(避免遗留空容器)
 *   - 度量筛选(measureFilters):同 filters 处理,leaf.measureName === fieldName
 */
import type { ClientFilter, ClientMeasureFilter } from '../../types/viewConfig.js';
import { getMeasureFieldName } from '../viewConfig/quickCalcs.js';
import type { DropZone } from '../dropRules/dropRules.js';
import type { Sort, ValueField, ViewConfig } from '../../types/viewConfig.js';

/** 从 filter 树里删掉所有引用 targetField 的 leaf;空 group 一并清理 */
function pruneFilterTree(node: ClientFilter, targetField: string): ClientFilter | null {
  if (node.kind === 'leaf') {
    return node.field === targetField ? null : node;
  }
  // group:递归裁子节点
  const kept = node.children
    .map((c) => pruneFilterTree(c, targetField))
    .filter((c): c is ClientFilter => c !== null);
  if (kept.length === 0) return null; // 空 group → 删
  return { ...node, children: kept };
}

/** 从 measureFilter 树里删掉所有引用 targetMeasure 的 leaf;空 group 一并清理 */
function pruneMeasureFilterTree(
  node: ClientMeasureFilter,
  targetMeasure: string,
): ClientMeasureFilter | null {
  // group:kind === 'group'(显式)
  if ('kind' in node && node.kind === 'group') {
    const kept = node.children
      .map((c) => pruneMeasureFilterTree(c, targetMeasure))
      .filter((c): c is ClientMeasureFilter => c !== null);
    if (kept.length === 0) return null;
    return { ...node, children: kept };
  }
  // leaf:kind === 'leaf' / undefined(老序列化)/ 缺省
  return node.measureName === targetMeasure ? null : node;
}

function dropOrphanMeasureSort(sorts: Sort[], removedMeasureName: string): Sort[] {
  return sorts.filter(
    (s) => !(s.type === 'ByMeasure' && s.measureName === removedMeasureName),
  );
}

export function removeFieldFromZone(
  viewConfig: ViewConfig,
  zone: DropZone,
  fieldName: string,
  /**
   * P5+ duplicate chip 精确定位 — value zone 用:同 encoded name 多 chip 时按 idx 删,
   * 不传则按 encoded name 删所有 match(老语义,向后兼容)。
   */
  chipIdx?: number,
): ViewConfig {
  switch (zone) {
    case 'row':
      return { ...viewConfig, rows: viewConfig.rows.filter((r) => r.fieldName !== fieldName) };
    case 'column':
      return {
        ...viewConfig,
        columns: viewConfig.columns.filter((c) => c.fieldName !== fieldName),
      };
    case 'value': {
      const matchEncoded = (v: ValueField): boolean => getMeasureFieldName(v) === fieldName;

      // P5+ 优先按 chipIdx 精确删一个 chip(duplicate chip 不一次全删)
      // 防御:idx 处 chip 必须真的对应 fieldName,否则 chipIdx 跟 state 不同步,fallback 老逻辑
      let nextValues: ValueField[];
      let removedMeasureName: string;
      if (
        chipIdx !== undefined &&
        chipIdx >= 0 &&
        chipIdx < viewConfig.values.length &&
        (matchEncoded(viewConfig.values[chipIdx]!) ||
          viewConfig.values[chipIdx]!.measureName === fieldName)
      ) {
        removedMeasureName = viewConfig.values[chipIdx]!.measureName;
        nextValues = viewConfig.values.filter((_, i) => i !== chipIdx);
      } else {
        // 老逻辑:按 encoded name 整批删;退化按 measureName 整批清
        const exactHit = viewConfig.values.some(matchEncoded);
        nextValues = exactHit
          ? viewConfig.values.filter((v) => !matchEncoded(v))
          : viewConfig.values.filter((v) => v.measureName !== fieldName);
        removedMeasureName = exactHit
          ? viewConfig.values.find(matchEncoded)?.measureName ?? fieldName
          : fieldName;
      }

      // 没有同名 measure 残留 → 清掉 orphan sort
      const stillHasMeasure = nextValues.some((v) => v.measureName === removedMeasureName);
      return {
        ...viewConfig,
        values: nextValues,
        rowSorts: stillHasMeasure
          ? viewConfig.rowSorts
          : dropOrphanMeasureSort(viewConfig.rowSorts, removedMeasureName),
        columnSorts: stillHasMeasure
          ? viewConfig.columnSorts
          : dropOrphanMeasureSort(viewConfig.columnSorts, removedMeasureName),
      };
    }
    case 'filter': {
      // 维度过滤树裁掉 fieldName,度量过滤树裁掉同名 measure;
      // 顶层 filters 数组的某棵树整树都被裁掉(返回 null)→ 从数组里去掉
      const nextFilters = viewConfig.filters
        .map((f) => pruneFilterTree(f, fieldName))
        .filter((f): f is ClientFilter => f !== null);
      const nextMeasureFilters = viewConfig.measureFilters
        .map((mf) => pruneMeasureFilterTree(mf, fieldName))
        .filter((mf): mf is ClientMeasureFilter => mf !== null);
      return {
        ...viewConfig,
        filters: nextFilters,
        measureFilters: nextMeasureFilters,
      };
    }
  }
}
