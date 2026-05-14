/**
 * findDuplicates — 检测 row/column/value zone 内重复的 chip,返回其 index 集合
 *
 * 设计:
 *   - 拖拽不 dedup(用户拖了立刻看到 chip 出现,体验流畅)
 *   - 重复 chip 在 viewConfig 里保留,UI 标红 + ⚠ + tooltip
 *   - buildQuery 翻译前用同一份逻辑 dedup,避免后端拒收重复字段
 *
 * Dedup key:
 *   - Row / Column:fieldName
 *   - Value:(measureName, aggregator, quickCalcEnum, dateLevel) 四元组
 *     - aggregator null → 视为 "default" empty string(同 metadata 默认 SUM 等冲突)
 *     - quickCalc 含 dateLevel 时把 level 也算进 key(时间智能"按月 vs 按年"是不同 chip)
 *
 * 语义:
 *   "first wins" — 数组中 index 越小越"正",第二次出现的 → duplicate
 *   index=0 永远不会进结果 Set
 *
 * 不变量:
 *   I1. 空数组 → 空 Set
 *   I2. 全 unique → 空 Set
 *   I3. 同 key 第 N 次出现(N >= 2)→ 该 index 进结果 Set
 *   I4. 改 chip 的 agg/qc 让 key 不再撞 → 该 chip 不再算 duplicate(动态响应,在 selector 层重算)
 */
import type { QuickCalculation } from '../../types/query.js';
import type {
  ColumnField,
  RowField,
  ValueField,
} from '../../types/viewConfig.js';

/** quickCalc → 稳定 key 串(序列化 enum + dateLevel) */
function qcKey(qc: QuickCalculation | null | undefined): string {
  if (!qc || typeof qc !== 'object') return '';
  if ('_enum' in qc) {
    const obj = qc as { _enum: string; dateLevel?: string };
    return obj.dateLevel ? `${obj._enum}:${obj.dateLevel}` : obj._enum;
  }
  return '';
}

/** ValueField → dedup key */
export function valueDedupKey(v: ValueField): string {
  return `${v.measureName}|${v.aggregator ?? ''}|${qcKey(v.quickCalc)}`;
}

/** 通用:从数组 + key extractor 算 duplicate indices */
function duplicateIndicesBy<T>(arr: T[], keyOf: (t: T) => string): Set<number> {
  const seen = new Set<string>();
  const dup = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    const k = keyOf(arr[i]!);
    if (seen.has(k)) {
      dup.add(i);
    } else {
      seen.add(k);
    }
  }
  return dup;
}

/** Row zone:同 fieldName 第 2 次起 → duplicate */
export function findDuplicateRowIndices(rows: RowField[]): Set<number> {
  return duplicateIndicesBy(rows, (r) => r.fieldName);
}

/** Column zone:同 row 逻辑(ColumnField = RowField alias) */
export function findDuplicateColumnIndices(columns: ColumnField[]): Set<number> {
  return duplicateIndicesBy(columns, (c) => c.fieldName);
}

/** Value zone:(measureName, agg, qc) 三元组 dedup */
export function findDuplicateValueIndices(values: ValueField[]): Set<number> {
  return duplicateIndicesBy(values, valueDedupKey);
}

/**
 * "first wins" 去重 — 返回新数组,index >= 1 但 key 撞前面的 item 被过滤掉
 * buildQuery 翻译前调一次,确保发给后端的字段无重复
 */
export function dedupRowFields(rows: RowField[]): RowField[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.fieldName)) return false;
    seen.add(r.fieldName);
    return true;
  });
}

export function dedupColumnFields(columns: ColumnField[]): ColumnField[] {
  const seen = new Set<string>();
  return columns.filter((c) => {
    if (seen.has(c.fieldName)) return false;
    seen.add(c.fieldName);
    return true;
  });
}

export function dedupValueFields(values: ValueField[]): ValueField[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = valueDedupKey(v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
