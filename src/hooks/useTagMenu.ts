/**
 * useTagMenu — DropZone chip 右键菜单 ContextMenuItem[]
 *
 * 2026-05-17:整个 ~280 行决策树下沉到 core/menuBuilder/buildTagMenu.ts。
 *   本 hook 退化为:
 *   - useMemo 包装 + 稳定引用
 *   - 一组 callbacks 把 core 的"语义动作"转译成 ViewConfigAction dispatch
 *
 * 子菜单组成详见 buildTagMenu.ts 注释。
 */

import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import type { DropZone, FieldType } from '../core/dropRules/dropRules.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import {
  type TagMenuTarget,
  buildTagMenuItems,
} from '../core/menuBuilder/buildTagMenu.js';
import type { TimeAxisInfo } from '../core/timeAxis/detectTimeAxis.js';
import type { ViewMode } from '../core/viewMode/viewMode.js';
import type { ViewConfig } from '../types/viewConfig.js';
import type { ViewConfigAction } from './useViewConfig.js';

export type { TagMenuTarget };

export interface UseTagMenuOptions {
  tagMenu: TagMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
  timeAxis: TimeAxisInfo | null;
  allTimeAxes: TimeAxisInfo[];
  viewMode: ViewMode;
  dispatch: Dispatch<ViewConfigAction>;
  onOpenConditionalFormat?: (measure: string) => void;
  onOpenCustomSort?: (fieldName: string) => void;
}

// 防御:UseTagMenuOptions 仍然 export DropZone/FieldType 兼容老 import,但 hook 自己不直接用
void (null as unknown as DropZone | FieldType);

export function useTagMenu(opts: UseTagMenuOptions): ContextMenuItem[] {
  const {
    tagMenu,
    viewConfig,
    metaIndex,
    timeAxis,
    allTimeAxes,
    viewMode,
    dispatch,
    onOpenConditionalFormat,
    onOpenCustomSort,
  } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!tagMenu) return [];
    const { zone, fieldName, chipIndex } = tagMenu;
    const isMeasure = tagMenu.fieldType === 'Measure' || tagMenu.fieldType === 'CalcMeasure';
    const sortKind: 'ByMeasure' | 'ByDimension' = isMeasure ? 'ByMeasure' : 'ByDimension';

    return buildTagMenuItems(
      { tagMenu, viewConfig, metaIndex, timeAxis, allTimeAxes, viewMode },
      {
        onSetSortDirection: (direction) => {
          const next = viewConfig.rowSorts.filter(
            (s) =>
              !(
                (s.type === 'ByMeasure' && s.measureName === fieldName) ||
                (s.type === 'ByDimension' && s.fieldName === fieldName)
              ),
          );
          next.push(
            sortKind === 'ByMeasure'
              ? { type: 'ByMeasure', measureName: fieldName, direction }
              : { type: 'ByDimension', fieldName, direction },
          );
          dispatch({ type: 'SET', viewConfig: { ...viewConfig, rowSorts: next } });
        },
        onClearSort: () => {
          const next = viewConfig.rowSorts.filter(
            (s) =>
              !(
                (s.type === 'ByMeasure' && s.measureName === fieldName) ||
                (s.type === 'ByDimension' && s.fieldName === fieldName) ||
                (s.type === 'ByCustomCaption' && s.fieldName === fieldName)
              ),
          );
          dispatch({ type: 'SET', viewConfig: { ...viewConfig, rowSorts: next } });
        },
        onMoveField: (direction) =>
          dispatch({ type: 'MOVE_FIELD', zone, fieldName, direction }),
        onSetAggregator: (aggregator) =>
          dispatch({
            type: 'SET_VALUE_AGGREGATOR',
            chipKey: fieldName,
            chipIdx: tagMenu.chipIdx,
            aggregator,
          }),
        onSetQuickCalc: (quickCalc) =>
          dispatch({
            type: 'SET_VALUE_QUICK_CALC',
            measureName: fieldName,
            quickCalc,
            chipIdx: tagMenu.chipIdx,
          }),
        onToggleSubTotal: (subTotalOn) =>
          dispatch({
            type: 'SET_FIELD_SUB_TOTAL',
            zone: zone as 'row' | 'column',
            fieldName,
            subTotal: subTotalOn ? undefined : 'SHOW',
          }),
        onRemove: () =>
          dispatch({ type: 'REMOVE_FIELD', zone, fieldName, chipIdx: chipIndex }),
        onOpenConditionalFormat,
        onOpenCustomSort,
      },
    );
    // 闭包依赖 tagMenu / viewConfig / viewMode — 仅这些变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagMenu, viewConfig, viewMode]);
}
