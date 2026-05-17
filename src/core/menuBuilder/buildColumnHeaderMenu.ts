/**
 * buildColumnHeaderMenuItems — 字段级表头右键菜单 ContextMenuItem[] 构造器
 *
 * 收益:原 useColumnHeaderMenu hook ~115 行决策树下沉到 core(I1-I7 不变量)。
 *
 * 适用元素:
 *   - 即席模式:列头(每列 = 一字段)
 *   - 透视模式 corner:行头维度名 cell(sortKind='ByDimension')
 *   - 透视模式 列头度量 cell(sortKind='ByMeasure')
 *
 * 不变量:
 *   I1. columnHeaderMenu=null → 空 items
 *   I2. 升序 / 降序 永远显示;✓ 标记当前 direction
 *   I3. pivot 模式额外显示 全局升序 / 全局降序(BASC/BDESC);adhoc 隐藏(无 hierarchy)
 *   I4. 该字段当前有 sort(包括 ByCustomCaption)→ 显示"取消排序"
 *   I5. ByDimension + onOpenCustomSort 传 → 显示"自定义排序…";含 ✓ count 提示
 *   I6. adhoc + ByDimension + 数值列 + onOpenConditionalFormat 传 → "条件格式化…"
 *   I7. 末尾固定"复制字段名"(navigator.clipboard 在 caller 实现 — 这里只给 callback 入口)
 */
import { isNumericValueType } from '../metadata/fieldDisplayType.js';
import type { MetadataIndex } from '../metadata/fieldIndex.js';
import type { Sort, ViewConfig } from '../../types/viewConfig.js';

import type { ContextMenuItem } from './menuItem.js';

export interface ColumnHeaderMenuTarget {
  fieldName: string;
  /** 'ByDimension' = 维度字段(adhoc 列头 / pivot corner);'ByMeasure' = 度量(pivot 度量列头) */
  sortKind: 'ByDimension' | 'ByMeasure';
  x: number;
  y: number;
}

export interface ColumnHeaderMenuContext {
  columnHeaderMenu: ColumnHeaderMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
}

export interface ColumnHeaderMenuCallbacks {
  /**
   * 应用新 sort direction(实现里 dispatch SET 全量替换 rowSorts);
   * direction=null 表示清掉该字段的方向 sort(可能保留 ByCustomCaption)
   */
  onSetSortDirection: (direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC' | null) => void;
  /** P5+ 维度字段 自定义排序…(打开 CustomSortOrderModal) */
  onOpenCustomSort?: (fieldName: string) => void;
  /** P5+ adhoc 数值列 条件格式化…(打开 ConditionalFormatModal,adhoc 模式)*/
  onOpenConditionalFormat?: (fieldName: string) => void;
  /** 复制字段名(caller 实现 clipboard 写入,这里只暴露入口让单测可 spy) */
  onCopyFieldName: (alias: string) => void;
}

export function buildColumnHeaderMenuItems(
  ctx: ColumnHeaderMenuContext,
  callbacks: ColumnHeaderMenuCallbacks,
): ContextMenuItem[] {
  const { columnHeaderMenu, viewConfig, metaIndex } = ctx;
  if (!columnHeaderMenu) return []; // I1
  const { fieldName, sortKind } = columnHeaderMenu;
  const isAdhoc = viewConfig.queryMode === 'adhoc';

  // 当前该字段的 sort(若有)
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

  const field = metaIndex.findByName(fieldName);
  const alias = field?.alias ?? fieldName;
  // I6: 条件格式化入口判定
  const showCondFmt =
    !!callbacks.onOpenConditionalFormat &&
    sortKind === 'ByDimension' &&
    isNumericValueType(field?.valueType ?? null);
  // I5: 自定义排序入口判定
  const showCustomSort = !!callbacks.onOpenCustomSort && sortKind === 'ByDimension';

  const sortItem = (
    label: string,
    direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC',
  ): ContextMenuItem => ({
    key: `sort-${direction}`,
    label: dir === direction ? `✓ ${label}` : label, // I2 ✓ 标记
    onClick: () => callbacks.onSetSortDirection(direction),
  });

  return [
    sortItem('升序', 'ASC'),
    sortItem('降序', 'DESC'),
    // I3
    ...(isAdhoc ? [] : [sortItem('全局升序', 'BASC'), sortItem('全局降序', 'BDESC')]),
    // I4
    ...(sort || currentCustomSort
      ? [{ key: 'sort-clear', label: '取消排序', onClick: () => callbacks.onSetSortDirection(null) }]
      : []),
    // I5
    ...(showCustomSort
      ? [
          { key: 'sep-custom', separator: true as const },
          {
            key: 'sort-custom',
            label: currentCustomSort
              ? `✓ 自定义排序…(${currentCustomSort.customCaption.length} 项)`
              : '自定义排序…',
            onClick: () => callbacks.onOpenCustomSort!(fieldName),
          },
        ]
      : []),
    // I6
    ...(showCondFmt
      ? [
          { key: 'sep-cond', separator: true as const },
          { key: 'cond-fmt', label: '条件格式化…', onClick: () => callbacks.onOpenConditionalFormat!(fieldName) },
        ]
      : []),
    // I7
    { key: 'sep', separator: true as const },
    { key: 'copy-name', label: '复制字段名', onClick: () => callbacks.onCopyFieldName(alias) },
  ];
}
