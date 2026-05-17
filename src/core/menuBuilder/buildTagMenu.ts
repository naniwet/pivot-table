/**
 * buildTagMenuItems — DropZone chip 右键菜单 ContextMenuItem[] 构造器(纯函数)
 *
 * 收益(Unix):原 useTagMenu hook 的 ~280 行决策树(排序 / 位置 / 汇总依据 / 快速计算 /
 *   显示合计 / 条件格式化 / 移除)整段下沉到 core。dispatch / open-modal callback 留 hook 层。
 *   - hook 缩到 ~80 行的"context + callbacks 编排"
 *   - 决策树跑 node,12+ 个 it 案例
 *
 * 子菜单组成:
 *   - 排序 ▶(ASC/DESC + adhoc 之外的 BASC/BDESC + 取消 + 自定义排序…)
 *   - 位置 ▶(上移 / 下移)
 *   - 汇总依据 ▶(value zone)
 *   - 快速计算 ▶(value zone + Measure + 时间智能 + axis 选)
 *   - 显示合计 / 小计(row/column 维度 chip,matrix view)
 *   - 条件格式化…(value zone pivot / adhoc 数值 row)
 *   - 从此区域移除
 */
import {
  applicableAggregators,
  getAggregatorLabel,
  normalizeMetadataAggregator,
} from '../viewConfig/aggregators.js';
import { isNumericValueType } from '../metadata/fieldDisplayType.js';
import type { MetadataIndex } from '../metadata/fieldIndex.js';
import {
  ALL_QUICK_CALCS,
  getMeasureFieldName,
  quickCalcKey,
  splitMeasureFieldName,
} from '../viewConfig/quickCalcs.js';
import type { TimeAxisInfo } from '../timeAxis/detectTimeAxis.js';
import type { ViewMode } from '../viewMode/viewMode.js';
import type { Aggregator, QuickCalculation } from '../../types/query.js';
import type { ViewConfig } from '../../types/viewConfig.js';
import type { DropZone, FieldType } from '../dropRules/dropRules.js';

import type { ContextMenuItem } from './menuItem.js';

export interface TagMenuTarget {
  zone: DropZone;
  fieldName: string;
  fieldType: FieldType;
  chipIdx?: number;
  x: number;
  y: number;
  chipIndex?: number;
}

export interface TagMenuContext {
  tagMenu: TagMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
  timeAxis: TimeAxisInfo | null;
  allTimeAxes: TimeAxisInfo[];
  viewMode: ViewMode;
}

export interface TagMenuCallbacks {
  /** 替换 rowSorts(SET 全量) */
  onSetSortDirection: (direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC') => void;
  /** 取消排序(清掉同字段的方向 sort + ByCustomCaption) */
  onClearSort: () => void;
  /** 上下移(MOVE_FIELD) */
  onMoveField: (direction: 'up' | 'down') => void;
  /** 改 chip 的 aggregator(SET_VALUE_AGGREGATOR;hook 层传 chipIdx) */
  onSetAggregator: (aggregator: Aggregator | null) => void;
  /** 改 chip 的 quickCalc(SET_VALUE_QUICK_CALC;hook 层传 chipIdx)*/
  onSetQuickCalc: (quickCalc: QuickCalculation | null) => void;
  /** 切显示合计 / 小计(SET_FIELD_SUB_TOTAL) */
  onToggleSubTotal: (subTotalOn: boolean) => void;
  /** 从该 zone 移除 chip(REMOVE_FIELD;hook 层传 chipIdx) */
  onRemove: () => void;
  /** 条件格式化…(打开 modal,传 measureName 或 fieldName)*/
  onOpenConditionalFormat?: (target: string) => void;
  /** 自定义排序…(打开 modal,传 fieldName)*/
  onOpenCustomSort?: (fieldName: string) => void;
}

function isNumericFieldByName(metaIndex: MetadataIndex, fieldName: string): boolean {
  return isNumericValueType(metaIndex.findByName(fieldName)?.valueType ?? null);
}

export function buildTagMenuItems(
  ctx: TagMenuContext,
  callbacks: TagMenuCallbacks,
): ContextMenuItem[] {
  const { tagMenu, viewConfig, metaIndex, timeAxis, allTimeAxes, viewMode } = ctx;
  const { isAdhoc, isTree } = viewMode;

  if (!tagMenu) return [];
  const { zone, fieldName, fieldType, chipIndex } = tagMenu;
  const isMeasure = fieldType === 'Measure' || fieldType === 'CalcMeasure';
  const sortKind: 'ByMeasure' | 'ByDimension' = isMeasure ? 'ByMeasure' : 'ByDimension';

  // 当前排序方向(用于 ✓ / disabled)
  const currentSort = viewConfig.rowSorts.find(
    (s) =>
      (s.type === 'ByMeasure' && s.measureName === fieldName) ||
      (s.type === 'ByDimension' && s.fieldName === fieldName),
  );
  const currentDir = currentSort?.direction;

  const sortItem = (label: string, direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC'): ContextMenuItem => ({
    key: `sort-${direction}`,
    label: currentDir === direction ? `✓ ${label}` : label,
    onClick: () => callbacks.onSetSortDirection(direction),
  });

  // zone 内字段索引(用于 move 启用判断)
  const zoneArr =
    zone === 'row'
      ? viewConfig.rows
      : zone === 'column'
        ? viewConfig.columns
        : zone === 'value'
          ? viewConfig.values.map((v) => ({ fieldName: getMeasureFieldName(v) }))
          : [];
  const idxInZone =
    zone === 'value' && chipIndex !== undefined && chipIndex < zoneArr.length
      ? chipIndex
      : zoneArr.findIndex((f) => (f as { fieldName: string }).fieldName === fieldName);
  const canUp = idxInZone > 0;
  const canDown = idxInZone >= 0 && idxInZone < zoneArr.length - 1;

  // P5+ 自定义排序入口判定
  const supportsCustomSort =
    !isMeasure &&
    fieldType !== 'MeasureGroupName' &&
    (zone === 'row' || zone === 'column') &&
    !!callbacks.onOpenCustomSort;
  const currentCustomSort = viewConfig.rowSorts.find(
    (s): s is Extract<typeof s, { type: 'ByCustomCaption' }> =>
      s.type === 'ByCustomCaption' && s.fieldName === fieldName,
  );
  void sortKind; // sortKind 决定排序类型选择,在 callback 中由 hook 处理

  // 排序方向语义(2026-05-16 真实接口验证):
  //   ASC/DESC = 分组内(保 hierarchy);BASC/BDESC = 全局(打破 hierarchy)
  const sortChildren: ContextMenuItem[] = [
    ...(isTree ? [] : [sortItem('升序', 'ASC'), sortItem('降序', 'DESC')]),
    ...(isAdhoc ? [] : [sortItem('全局升序', 'BASC'), sortItem('全局降序', 'BDESC')]),
    {
      key: 'sort-clear',
      label: '取消排序',
      disabled: !currentSort && !currentCustomSort,
      onClick: () => callbacks.onClearSort(),
    },
    ...(supportsCustomSort
      ? [
          { key: 'sort-sep-custom', separator: true as const },
          {
            key: 'sort-custom',
            label: currentCustomSort
              ? `✓ 自定义排序…(${currentCustomSort.customCaption.length} 项)`
              : '自定义排序…',
            onClick: () => callbacks.onOpenCustomSort!(fieldName),
          },
        ]
      : []),
  ];

  const moveChildren: ContextMenuItem[] = [
    {
      key: 'move-up',
      label: '上移(更接近顶层)',
      disabled: !canUp,
      onClick: () => callbacks.onMoveField('up'),
    },
    {
      key: 'move-down',
      label: '下移(更接近最深层)',
      disabled: !canDown,
      onClick: () => callbacks.onMoveField('down'),
    },
  ];

  const items: ContextMenuItem[] = [
    { key: 'sort', label: '排序', children: sortChildren },
    { key: 'move', label: '位置', children: moveChildren },
  ];

  // P3+ 汇总依据 — value zone chip 右键
  if (zone === 'value') {
    const chipKey = fieldName;
    const targetChip =
      chipIndex !== undefined && chipIndex < viewConfig.values.length
        ? viewConfig.values[chipIndex]
        : viewConfig.values.find((v) => getMeasureFieldName(v) === chipKey);
    const { measureName: baseMeasureName } = splitMeasureFieldName(fieldName);
    const node = metaIndex.findByName(baseMeasureName);
    const valueType = node?.valueType ?? null;
    const metadataDefault = node?.aggregator
      ? normalizeMetadataAggregator(node.aggregator)
      : null;
    const aggs = applicableAggregators(valueType);
    const currentAgg = targetChip?.aggregator ?? null;
    const aggChildren: ContextMenuItem[] = aggs.map((a) => {
      const isCurrent = currentAgg === a || (currentAgg === null && a === metadataDefault);
      const isMetaDefault = a === metadataDefault;
      const baseLabel = `${getAggregatorLabel(a)}${isMetaDefault ? '(默认)' : ''}`;
      return {
        key: `agg-${a}`,
        label: isCurrent ? `✓ ${baseLabel}` : baseLabel,
        onClick: () => {
          if (isCurrent) return;
          const next = a === metadataDefault ? null : a;
          callbacks.onSetAggregator(next);
        },
      };
    });
    items.push({ key: 'agg', label: '汇总依据', children: aggChildren });
  }

  // 度量字段 + value zone:快速计算子菜单
  if (isMeasure && zone === 'value') {
    const measureField =
      chipIndex !== undefined && chipIndex < viewConfig.values.length
        ? viewConfig.values[chipIndex]
        : viewConfig.values.find((v) => getMeasureFieldName(v) === fieldName);
    const currentQc = measureField?.quickCalc;
    const currentQcEnum = quickCalcKey(currentQc);
    const currentQcDateLevel =
      currentQc && typeof currentQc === 'object' && 'dateLevel' in currentQc
        ? ((currentQc as { dateLevel?: string }).dateLevel ?? null)
        : null;

    const qcChildren: ContextMenuItem[] = [];
    for (const q of ALL_QUICK_CALCS) {
      const requiresTime = !!q.requiresTimeAxis;
      if (!requiresTime) {
        qcChildren.push({
          key: `qc-${q.enumName}`,
          label: currentQcEnum === q.enumName ? `✓ ${q.label}` : q.label,
          onClick: () => {
            const payload = q.buildPayload ? q.buildPayload({ timeAxis: timeAxis ?? null }) : q.defaultPayload;
            if (payload) callbacks.onSetQuickCalc(payload);
          },
        });
        continue;
      }

      // 时间智能
      const isCurrentEnum = currentQcEnum === q.enumName;
      if (allTimeAxes.length === 0) {
        qcChildren.push({ key: `qc-${q.enumName}`, label: q.label, disabled: true });
      } else if (allTimeAxes.length === 1) {
        const axis = allTimeAxes[0]!;
        qcChildren.push({
          key: `qc-${q.enumName}`,
          label: isCurrentEnum ? `✓ ${q.label}` : q.label,
          onClick: () => {
            const payload = q.buildPayload?.({ timeAxis: axis }) ?? q.defaultPayload;
            if (payload) callbacks.onSetQuickCalc(payload);
          },
        });
      } else {
        qcChildren.push({
          key: `qc-${q.enumName}`,
          label: isCurrentEnum ? `✓ ${q.label}` : q.label,
          children: allTimeAxes.map((axis) => {
            const levelAlias = metaIndex.findByName(axis.dateLevel)?.alias ?? axis.dateLevel;
            const checked = isCurrentEnum && currentQcDateLevel === axis.dateLevel;
            return {
              key: `qc-${q.enumName}-${axis.dateDimension}-${axis.dateLevel}`,
              label: checked ? `✓ 按 ${levelAlias}` : `按 ${levelAlias}`,
              onClick: () => {
                const payload = q.buildPayload?.({ timeAxis: axis });
                if (payload) callbacks.onSetQuickCalc(payload);
              },
            };
          }),
        });
      }
    }
    if (currentQc) {
      qcChildren.push({ key: 'qc-sep', separator: true });
      qcChildren.push({
        key: 'qc-clear',
        label: '取消快速计算',
        onClick: () => callbacks.onSetQuickCalc(null),
      });
    }
    items.push({ key: 'qc', label: '快速计算', children: qcChildren });
  }

  // P3 显示设置 — 维度类 chip 才暴露"显示合计 / 小计"
  const isMeasureAxisChip = fieldType === 'MeasureGroupName';
  if (
    !isMeasure &&
    !isMeasureAxisChip &&
    viewMode.isMatrixView &&
    (zone === 'row' || zone === 'column')
  ) {
    const fieldArr = zone === 'row' ? viewConfig.rows : viewConfig.columns;
    const idxInAxis = fieldArr.findIndex((f) => f.fieldName === fieldName);
    if (idxInAxis >= 0) {
      const targetField = fieldArr[idxInAxis];
      const subTotalOn = !!targetField?.subTotal && targetField.subTotal !== 'HIDDEN';
      const isFirstInAxis = idxInAxis === 0;
      const labelText = isFirstInAxis ? '显示合计' : '显示小计';
      items.push({ key: 'sep-totals', separator: true });
      items.push({
        key: 'toggle-subtotal',
        label: subTotalOn ? `✓ ${labelText}` : labelText,
        onClick: () => callbacks.onToggleSubTotal(subTotalOn),
      });
    }
  }

  // P5+ 条件格式化
  const isPivotValueChip = zone === 'value' && viewMode.isMatrixView;
  const isAdhocNumericRowChip =
    zone === 'row' && viewMode.isAdhoc && isNumericFieldByName(metaIndex, fieldName);
  if (callbacks.onOpenConditionalFormat && (isPivotValueChip || isAdhocNumericRowChip)) {
    const target = isPivotValueChip ? splitMeasureFieldName(fieldName).measureName : fieldName;
    items.push({ key: 'sep-cond-fmt', separator: true });
    items.push({
      key: 'cond-fmt',
      label: '条件格式化…',
      onClick: () => callbacks.onOpenConditionalFormat!(target),
    });
  }

  items.push({ key: 'sep-end', separator: true });
  items.push({
    key: 'remove',
    label: '从此区域移除',
    onClick: () => callbacks.onRemove(),
  });

  return items;
}
