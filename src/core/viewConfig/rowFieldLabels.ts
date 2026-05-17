/**
 * computeRowFieldLabels — 行表头 corner 显示的字段 alias 数组
 *
 * 收益(Unix):原本写在 useRowFieldLabels hook 内的纯计算抽出来 — 100% 无 React 依赖,
 *   node 单测覆盖 I1-I5 不变量 + 边界。hook 退化为 useMemo 一行包装。
 *
 * 顺序对齐 PivotRenderer/TreeRenderer 的 rowHeader.fullPath:
 *   - Hierarchy with drillDepth=N → 取 hierarchy.children[0..N-1].alias
 *   - 其他 RowField(Dimension/CalcGroup/EnumGroup/RangeGroup/...)→ 取自身 alias
 *   - MeasureGroupName(度量轴)→ "Σ 度量名称"
 *
 * 不变量:
 *   I1. type='MeasureGroupName' → label = 'Σ 度量名称'
 *   I2. type='Hierarchy':drillDepth=N → 输出 hierarchy.children[0..N-1].alias;
 *       drillDepth 缺省 → 当作 1;hierarchy 无 children → label = hierarchy 自身 alias
 *   I3. 其他类型 + 在 metadata → label = metadata node alias
 *   I4. 不在 metadata → 从 viewConfig.customFields 反查 name
 *   I5. metadata + customFields 都找不到 → fallback 用 fieldName 字符串
 */
import type { MetadataIndex } from '../metadata/fieldIndex.js';
import { getAlias } from '../../types/metadata.js';
import type { ViewConfig } from '../../types/viewConfig.js';

export function computeRowFieldLabels(
  viewConfig: ViewConfig,
  metaIndex: MetadataIndex,
): string[] {
  const labels: string[] = [];
  for (const r of viewConfig.rows) {
    if (r.type === 'MeasureGroupName') {
      labels.push('Σ 度量名称'); // I1
      continue;
    }
    if (r.type === 'Hierarchy') {
      const node = metaIndex.findByName(r.fieldName);
      const depth = Math.max(1, r.drillDepth ?? 1);
      if (node && node.children.length > 0) {
        for (let i = 0; i < depth; i++) {
          const lvl = node.children[i];
          if (lvl) labels.push(getAlias(lvl)); // I2
        }
        continue;
      }
      labels.push(node ? getAlias(node) : r.fieldName); // I2 退化
      continue;
    }
    // 1 层字段:I3 → I4 → I5
    const node = metaIndex.findByName(r.fieldName);
    if (node) {
      labels.push(getAlias(node));
      continue;
    }
    const cf = viewConfig.customFields.find((c) => c.id === r.fieldName);
    labels.push(cf?.name ?? r.fieldName);
  }
  return labels;
}
