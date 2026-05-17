/**
 * useColumnHeaderMenu — 字段级表头右键菜单 ContextMenuItem[]
 *
 * 2026-05-17:菜单决策树 + sort 替换计算 全部下沉到 core/menuBuilder/buildColumnHeaderMenu.ts
 *   (I1-I7 不变量)。本 hook 退化为:
 *   - useMemo 包装 + 稳定引用
 *   - dispatch 适配:onSetSortDirection → SET 全量替换 rowSorts
 *   - onCopyFieldName 适配:调 navigator.clipboard.writeText
 */
import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import {
  type ColumnHeaderMenuTarget,
  buildColumnHeaderMenuItems,
} from '../core/menuBuilder/buildColumnHeaderMenu.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { Sort, ViewConfig } from '../types/viewConfig.js';
import type { ViewConfigAction } from './useViewConfig.js';

export type { ColumnHeaderMenuTarget };

export interface UseColumnHeaderMenuOptions {
  columnHeaderMenu: ColumnHeaderMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
  dispatch: Dispatch<ViewConfigAction>;
  onOpenConditionalFormat?: (fieldName: string) => void;
  onOpenCustomSort?: (fieldName: string) => void;
}

export function useColumnHeaderMenu(opts: UseColumnHeaderMenuOptions): ContextMenuItem[] {
  const {
    columnHeaderMenu,
    viewConfig,
    metaIndex,
    dispatch,
    onOpenConditionalFormat,
    onOpenCustomSort,
  } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    // sort 替换闭包(SET 全量替换;清掉同字段 ByCustomCaption + 方向 sort)
    const onSetSortDirection = (direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC' | null) => {
      if (!columnHeaderMenu) return;
      const { fieldName, sortKind } = columnHeaderMenu;
      const sameFieldSort = (s: Sort) =>
        sortKind === 'ByMeasure'
          ? s.type === 'ByMeasure' && s.measureName === fieldName
          : (s.type === 'ByDimension' || s.type === 'ByCustomCaption') && s.fieldName === fieldName;
      const without = viewConfig.rowSorts.filter((s) => !sameFieldSort(s));
      const next: Sort[] = direction
        ? [
            ...without,
            sortKind === 'ByMeasure'
              ? { type: 'ByMeasure' as const, measureName: fieldName, direction }
              : { type: 'ByDimension' as const, fieldName, direction },
          ]
        : without;
      dispatch({ type: 'SET', viewConfig: { ...viewConfig, rowSorts: next } });
    };

    return buildColumnHeaderMenuItems(
      { columnHeaderMenu, viewConfig, metaIndex },
      {
        onSetSortDirection,
        onOpenCustomSort,
        onOpenConditionalFormat,
        onCopyFieldName: (alias) => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(alias).catch(() => {});
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnHeaderMenu, viewConfig.rowSorts, viewConfig.queryMode, metaIndex]);
}
