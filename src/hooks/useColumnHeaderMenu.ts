/**
 * useColumnHeaderMenu — 字段级表头右键菜单 ContextMenuItem[]
 *
 * 适用元素:
 *   - 即席模式:列头(每个列 = 一个字段)
 *   - 透视模式 corner:行头维度名 cell(左上角"省份"等,sortKind='ByDimension')
 *   - 透视模式 列头度量 cell(底层"销售额"等,sortKind='ByMeasure')
 *
 * 菜单项(跟 useTagMenu 字段 chip 菜单的"排序"子菜单等价 — 表头跟 chip 操作一致):
 *   - ✓ 升序 / 升序                    (ASC,分组内 — 保留 hierarchy)
 *   - ✓ 降序 / 降序                    (DESC,分组内)
 *   - ✓ 全局升序 / 全局升序             (BASC,pivot 模式才显示;打散分组,全表按值排)
 *   - ✓ 全局降序 / 全局降序             (BDESC)
 *   - 取消排序                          (仅在该字段当前有 sort 时显示)
 *   - 自定义排序…                       (ByDimension + onOpenCustomSort 传入时)
 *   - separator
 *   - 条件格式化…                       (adhoc 数值列 + onOpenConditionalFormat)
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
import type { Sort, ViewConfig } from '../types/viewConfig.js';
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
  /**
   * P5+ 维度字段开放"自定义排序…"(同 useTagMenu 的同名项):
   *   - 仅 ByDimension(adhoc 列头 / pivot corner)+ 传 callback 时显示
   *   - 父组件用 callback 打开 CustomSortOrderModal
   */
  onOpenCustomSort?: (fieldName: string) => void;
}

/* 数值类 valueType 判定下沉到 core/metadata/fieldDisplayType.isNumericValueType */

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
    if (!columnHeaderMenu) return [];
    const { fieldName, sortKind } = columnHeaderMenu;
    // adhoc 模式无 hierarchy → 不显示"全局排序"那两项(BASC/BDESC 后端会降级,UI 也别误导)
    const isAdhoc = viewConfig.queryMode === 'adhoc';

    // 当前该字段的 sort(若有)— 按 sortKind 区分查找逻辑;也匹配 ByCustomCaption(✓ 显示)
    const sameFieldSort = (s: Sort) =>
      sortKind === 'ByMeasure'
        ? s.type === 'ByMeasure' && s.measureName === fieldName
        : (s.type === 'ByDimension' || s.type === 'ByCustomCaption') && s.fieldName === fieldName;
    const sort = viewConfig.rowSorts.find(sameFieldSort);
    const dir = sort && sort.type !== 'ByCustomCaption' ? sort.direction : undefined;
    const currentCustomSort = viewConfig.rowSorts.find(
      (s): s is Extract<Sort, { type: 'ByCustomCaption' }> =>
        s.type === 'ByCustomCaption' && s.fieldName === fieldName,
    );

    // 直接覆盖该字段的 sort(替换或清除),用 SET 一次到位 — 避免 CYCLE_ROW_SORT 多次 dispatch race
    // 同时清掉同字段的 ByCustomCaption(跟方向排序互斥)
    const setSortDirection = (direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC' | null) => {
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
    // 自定义排序仅维度字段开放(pivot corner)+ callback 传入时
    const showCustomSort = !!onOpenCustomSort && sortKind === 'ByDimension';

    const sortItem = (
      label: string,
      direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC',
    ): ContextMenuItem => ({
      key: `sort-${direction}`,
      label: dir === direction ? `✓ ${label}` : label,
      onClick: () => setSortDirection(direction),
    });

    return [
      sortItem('升序', 'ASC'),
      sortItem('降序', 'DESC'),
      ...(isAdhoc ? [] : [sortItem('全局升序', 'BASC'), sortItem('全局降序', 'BDESC')]),
      ...(sort || currentCustomSort
        ? [
            {
              key: 'sort-clear',
              label: '取消排序',
              onClick: () => setSortDirection(null),
            },
          ]
        : []),
      ...(showCustomSort
        ? [
            { key: 'sep-custom', separator: true as const },
            {
              key: 'sort-custom',
              label: currentCustomSort
                ? `✓ 自定义排序…(${currentCustomSort.customCaption.length} 项)`
                : '自定义排序…',
              onClick: () => onOpenCustomSort!(fieldName),
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
  }, [columnHeaderMenu, viewConfig.rowSorts, viewConfig.queryMode, metaIndex]);
}
