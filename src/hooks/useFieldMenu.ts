/**
 * useFieldMenu — 字段树右键菜单 ContextMenuItem[](field tree 上的字段)
 *
 * 2026-05-17:菜单结构 + 决策树全部下沉到 core/menuBuilder/buildFieldMenu.ts
 *   (I1-I5 不变量 + callback wiring)。本 hook 只剩 dispatch ↔ callbacks 适配
 *   + useMemo 稳定引用。
 */

import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import type { FieldContextMenuEvent } from '../components/FieldTree/FieldTree.js';
import { buildFieldMenuItems } from '../core/menuBuilder/buildFieldMenu.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { ViewConfigAction } from './useViewConfig.js';

export interface UseFieldMenuOptions {
  fieldMenu: FieldContextMenuEvent | null;
  isAdhoc: boolean;
  metaIndex: MetadataIndex;
  dispatch: Dispatch<ViewConfigAction>;
}

export function useFieldMenu(opts: UseFieldMenuOptions): ContextMenuItem[] {
  const { fieldMenu, isAdhoc, metaIndex, dispatch } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!fieldMenu) return [];
    const { fieldName, fieldType } = fieldMenu;
    return buildFieldMenuItems(
      { fieldName, fieldType, isAdhoc, metaIndex },
      {
        onAddToZone: (zone) =>
          dispatch({ type: 'DROP_FIELD', zone, fieldName, fieldType }),
        onAddAsMeasure: (aggregator) =>
          dispatch({ type: 'ADD_DIMENSION_AS_VALUE', fieldName, aggregator }),
      },
    );
    // 闭包依赖 fieldMenu;ContextMenu 只在 click 时调 onClick,所以不必每次
    // viewConfig 变化都重算 items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldMenu, metaIndex, isAdhoc]);
}
