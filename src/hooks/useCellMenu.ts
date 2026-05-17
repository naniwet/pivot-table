/**
 * useCellMenu — 单元格右键菜单 ContextMenuItem[]
 *
 * 2026-05-17:菜单决策 + chips 构造 + custom-field 判断 全部下沉到
 *   core/menuBuilder/buildCellMenu.ts(I1-I6 不变量)。
 *   本 hook 退化为 useMemo 包装,只负责传 props + 稳定引用。
 */

import { useMemo } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import {
  type CellMenuTarget,
  buildCellMenuItems,
} from '../core/menuBuilder/buildCellMenu.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { CellSet } from '../types/cellSet.js';
import type { Metadata } from '../types/metadata.js';
import type { Query } from '../types/query.js';
import type { ViewConfig } from '../types/viewConfig.js';

export type { CellMenuTarget };

export interface UseCellMenuOptions {
  cellMenu: CellMenuTarget | null;
  drillThroughEnabled: boolean;
  cellSet: CellSet | null;
  viewConfig: ViewConfig;
  metadata: Metadata;
  metaIndex: MetadataIndex;
  /** 宿主自定 — 接管 query 不弹内置 modal */
  onDrillThrough?: (query: Query) => void;
  /** 弹内置 DetailModal 的回调 */
  onSetDetailContext: (ctx: { query: Query; chips: string[] }) => void;
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

  return useMemo<ContextMenuItem[]>(
    () =>
      buildCellMenuItems(
        { cellMenu, drillThroughEnabled, cellSet, viewConfig, metadata, metaIndex },
        { onDrillThrough, onSetDetailContext },
      ),
    // 闭包依赖 cellMenu/cellSet/viewConfig — 都改了 menu 应该重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellMenu, drillThroughEnabled, cellSet, viewConfig, metadata],
  );
}
