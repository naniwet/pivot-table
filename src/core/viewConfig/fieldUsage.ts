/**
 * fieldUsage — 计算 ViewConfig 中每个字段的"在用 zone 计数"。
 *
 * 用途:
 *   - FieldTree 的 checkbox 状态指示(0=不勾,1=勾,>=1=勾且不可点击)
 *   - 也可以扩展给"在用字段高亮" / "未使用字段灰显" 等 UI
 *
 * 计数维度(每个 zone 出现 1 次记 1):
 *   - rows[]              — 每个 RowField.fieldName
 *   - columns[]           — 每个 ColumnField.fieldName
 *   - values[]            — 每个 ValueField.measureName(同 measureName 多 aggregator 算 1)
 *   - filters             — 树形 ClientFilter,递归收集 leaf.field
 *   - measureFilters      — 树形 ClientMeasureFilter,递归收集 leaf.measureName
 *   - customFields[]      — 不计入(自建字段不属于 metadata 树,checkbox 不渲染在它们上)
 *
 * 同字段在同 zone 多次出现(如 values 区同 measure 配 SUM 又配 AVG)只算 1
 * (用户语义:"这个字段在用",不关心用了几次)。
 */
import type { ClientFilter, ClientMeasureFilter, ViewConfig } from '../../types/viewConfig.js';

function collectFilterLeaves(node: ClientFilter, out: Set<string>): void {
  if (node.kind === 'leaf') {
    out.add(node.field);
    return;
  }
  for (const c of node.children) collectFilterLeaves(c, out);
}

function collectMeasureFilterLeaves(node: ClientMeasureFilter, out: Set<string>): void {
  // group:kind === 'group'(显式)
  if ('kind' in node && node.kind === 'group') {
    for (const c of node.children) collectMeasureFilterLeaves(c, out);
    return;
  }
  // leaf:kind === 'leaf' / undefined(老序列化兼容)/ 缺省
  out.add(node.measureName);
}

/**
 * 返回 fieldName → 在用 zone 数 的 Map。同 zone 内多次出现去重(算 1 个 zone)。
 *
 * @example
 *   rows=[{fieldName:'A'}], filters=[{kind:'leaf', field:'A'}]
 *   → Map { 'A' => 2 }(行 + 过滤,2 个 zone)
 */
export function computeFieldUsage(viewConfig: ViewConfig): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (name: string) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };

  // rows / columns:同 zone 内去重(同字段在 row 区出现 2 次还算 1)
  const rowFields = new Set(viewConfig.rows.map((r) => r.fieldName));
  rowFields.forEach(bump);
  const columnFields = new Set(viewConfig.columns.map((c) => c.fieldName));
  columnFields.forEach(bump);

  // values:按 measureName 去重(同 measure 多 aggregator 算 1)
  const valueFields = new Set(viewConfig.values.map((v) => v.measureName));
  valueFields.forEach(bump);

  // filters / measureFilters:树形递归 leaf
  const filterFields = new Set<string>();
  for (const f of viewConfig.filters) collectFilterLeaves(f, filterFields);
  filterFields.forEach(bump);

  const mfFields = new Set<string>();
  for (const mf of viewConfig.measureFilters) collectMeasureFilterLeaves(mf, mfFields);
  mfFields.forEach(bump);

  return counts;
}
