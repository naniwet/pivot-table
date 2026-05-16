/**
 * drillDownHierarchy / drillUpHierarchy — Hierarchy 轴深度的两个变更
 *
 * 取代旧 toggleHierarchyExpansion（基于 expandedMembers 的 per-member 展开），
 * 配合 [docs/adr-004-hierarchy-drill.md](../../../docs/adr-004-hierarchy-drill.md) C2 策略：drill = 改字段集 + 重发 query
 *
 * 单一职责：只调一个 hierarchy RowField 的 drillDepth；其他原样
 */
import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import type { Metadata } from '../../types/metadata.js';
import type { RowField, ViewConfig } from '../../types/viewConfig.js';

function findHierarchyIdx(rows: RowField[], fieldName: string): number {
  const idx = rows.findIndex((r) => r.fieldName === fieldName);
  if (idx < 0) throw new Error(`[drill] hierarchy "${fieldName}" not in rows`);
  if (rows[idx]!.type !== 'Hierarchy') {
    throw new Error(
      `[drill] field "${fieldName}" is not a Hierarchy (got ${rows[idx]!.type})`,
    );
  }
  return idx;
}

function currentDepth(row: RowField): number {
  return row.drillDepth ?? 1;
}

export function drillDownHierarchy(
  viewConfig: ViewConfig,
  fieldName: string,
  metadata: Metadata,
): ViewConfig {
  const idx = findHierarchyIdx(viewConfig.rows, fieldName);
  const target = viewConfig.rows[idx]!;
  const maxDepth = buildMetadataIndex(metadata).getHierarchyLevels(fieldName).length;
  const next = Math.min(currentDepth(target) + 1, Math.max(1, maxDepth));

  const nextRows = viewConfig.rows.slice();
  nextRows[idx] = { ...target, drillDepth: next };
  return { ...viewConfig, rows: nextRows };
}

export function drillUpHierarchy(viewConfig: ViewConfig, fieldName: string): ViewConfig {
  const idx = findHierarchyIdx(viewConfig.rows, fieldName);
  const target = viewConfig.rows[idx]!;
  const next = Math.max(1, currentDepth(target) - 1);

  const nextRows = viewConfig.rows.slice();
  nextRows[idx] = { ...target, drillDepth: next };
  return { ...viewConfig, rows: nextRows };
}
