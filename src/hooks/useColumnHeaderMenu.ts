/**
 * useColumnHeaderMenu — 字段级表头右键菜单 ContextMenuItem[]
 *
 * 适用元素:
 *   - 即席模式:列头(每个列 = 一个字段)
 *   - 透视模式 corner:行头维度名 cell(左上角"省份"等,sortKind='ByDimension')
 *   - 透视模式 列头度量 cell(底层"销售额"等,sortKind='ByMeasure')
 *
 * 菜单项(都不带 prompt;复杂条件让用户去 FilterPanel 树编辑):
 *   - ✓ 升序 / 升序                    (✓ 表示当前是 ASC)
 *   - ✓ 降序 / 降序
 *   - 取消排序                          (仅在该字段当前有 sort 时显示)
 *   - separator
 *   - 复制字段名
 *
 * 不持有 menu state — caller 控制 setColumnHeaderMenu(null)。
 * 跟 useMemberContextMenu(行/列头成员级)互补。
 */
import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import { isNumericValueType } from '../core/metadata/fieldDisplayType.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { ViewConfig } from '../types/viewConfig.js';
import type { ViewConfigAction } from './useViewConfig.js';

export interface ColumnHeaderMenuTarget {
  fieldName: string;
  /** 'ByDimension' = 维度字段(adhoc 列头 / pivot corner);'ByMeasure' = 度量(pivot 列头度量) */
  sortKind: 'ByDimension' | 'ByMeasure';
  x: number;
  y: number;
}

export interface UseColumnHeaderMenuOptions {
  columnHeaderMenu: ColumnHeaderMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
  dispatch: Dispatch<ViewConfigAction>;
  /**
   * P5+ 明细数值列开放"条件格式化…":
   *   - 仅 adhoc 模式 + valueType 是数值类(INT/BIGINT/FLOAT/DOUBLE/DECIMAL...)时菜单项出现
   *   - 字符串/日期/布尔列 — 不渲染该项(阈值/排名语义不适用)
   * 传了 callback 才显示,父组件用 callback 打开 ConditionalFormatModal(mode='adhoc')。
   */
  onOpenConditionalFormat?: (fieldName: string) => void;
}

/* 数值类 valueType 判定下沉到 core/metadata/fieldDisplayType.isNumericValueType */

export function useColumnHeaderMenu(opts: UseColumnHeaderMenuOptions): ContextMenuItem[] {
  const { columnHeaderMenu, viewConfig, metaIndex, dispatch, onOpenConditionalFormat } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!columnHeaderMenu) return [];
    const { fieldName, sortKind } = columnHeaderMenu;

    // 当前该字段的 sort(若有)— 按 sortKind 区分查找逻辑
    const sort = viewConfig.rowSorts.find((s) =>
      sortKind === 'ByMeasure'
        ? s.type === 'ByMeasure' && (s as { measureName: string }).measureName === fieldName
        : s.type === 'ByDimension' && (s as { fieldName: string }).fieldName === fieldName,
    );
    const dir = sort?.direction;

    // 直接覆盖该字段的 sort(替换或清除),用 SET 一次到位 — 避免 CYCLE_ROW_SORT 多次 dispatch race
    const setSortDirection = (direction: 'ASC' | 'DESC' | null) => {
      const sameField = (s: (typeof viewConfig.rowSorts)[number]) =>
        sortKind === 'ByMeasure'
          ? s.type === 'ByMeasure' &&
            (s as { measureName: string }).measureName === fieldName
          : s.type === 'ByDimension' &&
            (s as { fieldName: string }).fieldName === fieldName;
      const without = viewConfig.rowSorts.filter((s) => !sameField(s));
      const next = direction
        ? [
            ...without,
            sortKind === 'ByMeasure'
              ? { type: 'ByMeasure' as const, measureName: fieldName, direction }
              : { type: 'ByDimension' as const, fieldName, direction },
          ]
        : without;
      dispatch({ type: 'SET', viewConfig: { ...viewConfig, rowSorts: next } });
    };

    const field = metaIndex.findByName(fieldName);
    const alias = field?.alias ?? fieldName;
    // P5+ adhoc 数值列才出 "条件格式化…":
    //   - 必须显式传 callback(pivot/transition 不需要这入口 — 走 chip 菜单)
    //   - 必须 sortKind='ByDimension'(adhoc 列头 / pivot corner)— pivot 度量列头本身就是 ByMeasure
    //     而那走 chip 菜单的条件格式化路径,不在这里
    //   - 必须 valueType 是数值类
    const showCondFmt =
      !!onOpenConditionalFormat &&
      sortKind === 'ByDimension' &&
      isNumericValueType(field?.valueType ?? null);

    return [
      {
        key: 'sort-asc',
        label: dir === 'ASC' ? '✓ 升序' : '升序',
        onClick: () => setSortDirection('ASC'),
      },
      {
        key: 'sort-desc',
        label: dir === 'DESC' ? '✓ 降序' : '降序',
        onClick: () => setSortDirection('DESC'),
      },
      ...(sort
        ? [
            {
              key: 'sort-clear',
              label: '取消排序',
              onClick: () => setSortDirection(null),
            },
          ]
        : []),
      ...(showCondFmt
        ? [
            { key: 'sep-cond', separator: true as const },
            {
              key: 'cond-fmt',
              label: '条件格式化…',
              onClick: () => onOpenConditionalFormat?.(fieldName),
            },
          ]
        : []),
      { key: 'sep', separator: true as const },
      {
        key: 'copy-name',
        label: '复制字段名',
        onClick: () => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(alias).catch(() => {});
          }
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnHeaderMenu, viewConfig.rowSorts, metaIndex]);
}
