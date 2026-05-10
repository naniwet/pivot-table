/**
 * useRowFieldLabels — 行表头 corner 显示的字段 alias 数组
 *
 * 顺序对齐 PivotRenderer/TreeRenderer 的 rowHeader.fullPath:
 *   - Hierarchy with drillDepth=N → 取 hierarchy.children[0..N-1].alias
 *   - 其他 RowField(Dimension/CalcGroup/EnumGroup/RangeGroup/...)→ 取自身 alias
 *   - MeasureGroupName(度量轴)→ "Σ 度量名称"
 *
 * customField id(EnumGroup/RangeGroup)在 metadata 找不到 → 从 viewConfig.customFields 反查 name。
 *
 * 纯计算 hook,只 useMemo;无 side effect。
 */

import { useMemo } from 'react';

import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import { getAlias } from '../types/metadata.js';
import type { ViewConfig } from '../types/viewConfig.js';

export function useRowFieldLabels(
  viewConfig: ViewConfig,
  metaIndex: MetadataIndex,
): string[] {
  return useMemo<string[]>(() => {
    const labels: string[] = [];
    for (const r of viewConfig.rows) {
      if (r.type === 'MeasureGroupName') {
        labels.push('Σ 度量名称');
        continue;
      }
      if (r.type === 'Hierarchy') {
        const node = metaIndex.findByName(r.fieldName);
        const depth = Math.max(1, r.drillDepth ?? 1);
        if (node && node.children.length > 0) {
          for (let i = 0; i < depth; i++) {
            const lvl = node.children[i];
            if (lvl) labels.push(getAlias(lvl));
          }
          continue;
        }
        labels.push(node ? getAlias(node) : r.fieldName);
        continue;
      }
      // 普通 1 层字段
      const node = metaIndex.findByName(r.fieldName);
      if (node) {
        labels.push(getAlias(node));
        continue;
      }
      // 没在 metadata → 试 customFields
      const cf = viewConfig.customFields.find((c) => c.id === r.fieldName);
      labels.push(cf?.name ?? r.fieldName);
    }
    return labels;
  }, [viewConfig.rows, viewConfig.customFields, metaIndex]);
}
