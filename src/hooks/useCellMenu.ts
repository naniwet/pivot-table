/**
 * useCellMenu — 单元格右键菜单 ContextMenuItem[]
 *
 * 当前唯一项:**查看明细**(drill-through),通过 buildDetailQuery 构造定位 query。
 *
 * 路由:
 *   - 宿主传 onDrillThrough → 把 query 交给宿主(高级路径,自渲染明细 list)
 *   - 否则 → setDetailContext 弹内置 DetailModal(开箱即用)
 *
 * 不持有 cellMenu state — caller 控制 setCellMenu(null)。
 */

import { useMemo } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import { buildDetailQuery } from '../core/drillThrough/buildDetailQuery.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { CellSet, Member } from '../types/cellSet.js';
import type { Metadata } from '../types/metadata.js';
import type { Query } from '../types/query.js';
import type { ViewConfig } from '../types/viewConfig.js';

// 注:useCellMenu 已经接 drillThroughEnabled boolean(由 caller 用 viewMode 算出来),
// API 已经 mode-agnostic 不需要再迁;保留这个注释提醒未来不要回头加 viewMode 字段

export interface CellMenuTarget {
  rowIndex: number;
  colIndex: number;
  x: number;
  y: number;
}

export interface UseCellMenuOptions {
  cellMenu: CellMenuTarget | null;
  drillThroughEnabled: boolean;
  cellSet: CellSet | null;
  viewConfig: ViewConfig;
  metadata: Metadata;
  metaIndex: MetadataIndex;
  /** 宿主自定 — 接管 query 不弹内置 modal */
  onDrillThrough?: (query: Query) => void;
  /** 弹内置 DetailModal 的回调(setDetailContext) */
  onSetDetailContext: (ctx: { query: Query; chips: string[] }) => void;
}

/** 单元格 row/col tuple → 上下文 chip 摘要(度量 / 总计 member 跳过) */
function buildDetailContextChips(
  rowMember: Member[],
  colMember: Member[],
  viewConfig: ViewConfig,
  metaIndex: MetadataIndex,
): string[] {
  const chips: string[] = [];
  const memberToChip = (m: Member): string | null => {
    if (m.dimension === 'Measures') return null;
    if (m.level === '(All)') return null;
    const alias = metaIndex.findByName(m.fieldName)?.alias ?? m.fieldName;
    return `${alias}: ${m.name}`;
  };
  for (const m of rowMember) {
    const c = memberToChip(m);
    if (c) chips.push(c);
  }
  for (const m of colMember) {
    const c = memberToChip(m);
    if (c) chips.push(c);
  }
  if (viewConfig.filters.length > 0) {
    chips.push(`维度过滤(${viewConfig.filters.length} 条)`);
  }
  return chips;
}

export function useCellMenu(opts: UseCellMenuOptions): ContextMenuItem[] {
  const {
    cellMenu,
    drillThroughEnabled,
    cellSet,
    viewConfig,
    metadata,
    metaIndex,
    onDrillThrough,
    onSetDetailContext,
  } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!cellMenu || !drillThroughEnabled || !cellSet) return [];
    return [
      {
        key: 'drill-through',
        label: '查看明细',
        onClick: () => {
          if (!cellSet) return;
          const rowMember = cellSet.rows[cellMenu.rowIndex] ?? [];
          const colMember = cellSet.columns[cellMenu.colIndex] ?? [];
          const q = buildDetailQuery({
            viewConfig,
            metadata,
            rowMember,
            colMember,
          });
          const chips = buildDetailContextChips(rowMember, colMember, viewConfig, metaIndex);
          if (onDrillThrough) {
            onDrillThrough(q);
          } else {
            onSetDetailContext({ query: q, chips });
          }
        },
      },
    ];
    // 闭包依赖 cellMenu / cellSet / viewConfig — 都改了 menu 应该重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellMenu, drillThroughEnabled, cellSet, viewConfig, metadata]);
}
