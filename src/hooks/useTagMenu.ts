/**
 * useTagMenu — DropZone chip 右键菜单 ContextMenuItem[]
 *
 * 多级菜单组成(按是否适用动态显示):
 *   - 排序 ▶(ASC/DESC + adhoc 之外加 BASC/BDESC + 取消)
 *   - 位置 ▶(上移/下移)
 *   - 汇总依据 ▶(value zone)
 *   - 快速计算 ▶(value zone + Measure 类型 + 时间智能 + axis 选)
 *   - 显示小计 / 总计(row/column 维度 chip)
 *   - 从此区域移除
 *
 * 抽出来主要原因:逻辑 ~280 行,过去内嵌 PivotTable 时占 god component 接近 1/6 体积。
 */

import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import type { DropZone, FieldType } from '../core/dropRules/dropRules.js';
import { isNumericValueType } from '../core/metadata/fieldDisplayType.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { TimeAxisInfo } from '../core/timeAxis/detectTimeAxis.js';
import {
  applicableAggregators,
  getAggregatorLabel,
  normalizeMetadataAggregator,
} from '../core/viewConfig/aggregators.js';
import {
  ALL_QUICK_CALCS,
  getMeasureFieldName,
  splitMeasureFieldName,
} from '../core/viewConfig/quickCalcs.js';
import type { ViewMode } from '../core/viewMode/viewMode.js';
import type { QuickCalculation } from '../types/query.js';
import type { ViewConfig } from '../types/viewConfig.js';
import type { ViewConfigAction } from './useViewConfig.js';

export interface TagMenuTarget {
  zone: DropZone;
  fieldName: string;
  fieldType: FieldType;
  /**
   * P5+ duplicate chip 精确定位 — chip 在 zone 数组中的 idx。
   * value zone 多 chip 共享 encoded name 时,reducer 优先按 idx 改,避免 findIndex 撞首。
   * 老 caller 不传 → reducer fallback 按 chipKey 找第一个 match。
   */
  chipIdx?: number;
  x: number;
  y: number;
  /** value zone 同 measure 完全重复 chip 的数组索引 */
  chipIndex?: number;
}

function isNumericFieldByName(metaIndex: MetadataIndex, fieldName: string): boolean {
  return isNumericValueType(metaIndex.findByName(fieldName)?.valueType ?? null);
}

export interface UseTagMenuOptions {
  tagMenu: TagMenuTarget | null;
  viewConfig: ViewConfig;
  metaIndex: MetadataIndex;
  /** 当前查询里的时间轴(单 / 多 — quickCalc 时间智能用) */
  timeAxis: TimeAxisInfo | null;
  allTimeAxes: TimeAxisInfo[];
  /** 派生 mode flag — 来自 computeViewMode(viewConfig);取代散在各处的 isAdhoc/displayMode 直读 */
  viewMode: ViewMode;
  dispatch: Dispatch<ViewConfigAction>;
  /**
   * P5+ 数值区 chip 右键 "条件格式化…" — 父组件打开 ConditionalFormatModal。
   * 不传则不渲染该菜单项。
   */
  onOpenConditionalFormat?: (measure: string) => void;
  /**
   * P5+ 维度区 chip 右键 "自定义排序…" — 父组件打开 CustomSortOrderModal。
   * 仅在 zone='row'/'column' + Dimension/Level 字段时生效。
   * 不传则不渲染该菜单项。
   */
  onOpenCustomSort?: (fieldName: string) => void;
}

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
  const { isAdhoc } = viewMode;

  return useMemo<ContextMenuItem[]>(() => {
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

    const sortItem = (
      label: string,
      direction: 'ASC' | 'DESC' | 'BASC' | 'BDESC',
    ): ContextMenuItem => ({
      key: `sort-${direction}`,
      label: currentDir === direction ? `✓ ${label}` : label,
      onClick: () => {
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
    });

    // zone 内字段索引(用于 move 启用判断)
    // value zone 用 encoded fieldName 匹配单 chip(同 measure 多聚合时各占一行)
    const zoneArr =
      zone === 'row'
        ? viewConfig.rows
        : zone === 'column'
          ? viewConfig.columns
          : zone === 'value'
            ? viewConfig.values.map((v) => ({ fieldName: getMeasureFieldName(v) }))
            : [];
    // value zone + chipIndex 提供 → 直接用 index 定位(同 measure 重复 chip 时 findIndex 只命第 1 个)
    const idxInZone =
      zone === 'value' && chipIndex !== undefined && chipIndex < zoneArr.length
        ? chipIndex
        : zoneArr.findIndex(
            (f) => (f as { fieldName: string }).fieldName === fieldName,
          );
    const canUp = idxInZone > 0;
    const canDown = idxInZone >= 0 && idxInZone < zoneArr.length - 1;

    // 子菜单 1:排序 — adhoc 模式不支持分组内排序(无聚合分组)
    // P5+ 自定义排序 — 仅 row/column zone 的非 Measure 字段(Dimension/Level 等)
    // pivot/adhoc 都可用(后端 DimensionSort + ByCustomCaption 都支持)
    const supportsCustomSort =
      !isMeasure &&
      fieldType !== 'MeasureGroupName' &&
      (zone === 'row' || zone === 'column') &&
      !!onOpenCustomSort;
    // 当前已配的 ByCustomCaption(用于在菜单项加 ✓ + 检测要不要禁用其他 sort 路径)
    const currentCustomSort = viewConfig.rowSorts.find(
      (s): s is Extract<typeof s, { type: 'ByCustomCaption' }> =>
        s.type === 'ByCustomCaption' && s.fieldName === fieldName,
    );

    const sortChildren: ContextMenuItem[] = [
      sortItem('升序', 'ASC'),
      sortItem('降序', 'DESC'),
      ...(isAdhoc
        ? []
        : [sortItem('分组内升序', 'BASC'), sortItem('分组内降序', 'BDESC')]),
      {
        key: 'sort-clear',
        label: '取消排序',
        disabled: !currentSort && !currentCustomSort,
        onClick: () => {
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
      },
      ...(supportsCustomSort
        ? [
            { key: 'sort-sep-custom', separator: true as const },
            {
              key: 'sort-custom',
              label: currentCustomSort
                ? `✓ 自定义排序…(${currentCustomSort.customCaption.length} 项)`
                : '自定义排序…',
              onClick: () => onOpenCustomSort!(fieldName),
            },
          ]
        : []),
    ];

    // 子菜单 2:位置(上下移)
    const moveChildren: ContextMenuItem[] = [
      {
        key: 'move-up',
        label: '上移(更接近顶层)',
        disabled: !canUp,
        onClick: () => dispatch({ type: 'MOVE_FIELD', zone, fieldName, direction: 'up' }),
      },
      {
        key: 'move-down',
        label: '下移(更接近最深层)',
        disabled: !canDown,
        onClick: () => dispatch({ type: 'MOVE_FIELD', zone, fieldName, direction: 'down' }),
      },
    ];

    const items: ContextMenuItem[] = [
      { key: 'sort', label: '排序', children: sortChildren },
      { key: 'move', label: '位置', children: moveChildren },
    ];

    // P3+ 汇总依据 — value zone chip 右键(替换该 chip 自身的 aggregator)
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
        const isCurrent =
          currentAgg === a || (currentAgg === null && a === metadataDefault);
        const isMetaDefault = a === metadataDefault;
        const baseLabel = `${getAggregatorLabel(a)}${isMetaDefault ? '(默认)' : ''}`;
        return {
          key: `agg-${a}`,
          label: isCurrent ? `✓ ${baseLabel}` : baseLabel,
          onClick: () => {
            if (isCurrent) return;
            const next = a === metadataDefault ? null : a;
            // P5+ duplicate chip:传 chipIdx 让 reducer 精确改用户点的 chip,
            // 避免 findIndex 撞首改成别人(chip 1 显示成 AVG、用户点的 chip 2 没动)
            dispatch({
              type: 'SET_VALUE_AGGREGATOR',
              chipKey,
              chipIdx: tagMenu.chipIdx,
              aggregator: next,
            });
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
          : viewConfig.values.find(
              (v) => getMeasureFieldName(v) === fieldName,
            );
      const currentQc = measureField?.quickCalc;
      const currentQcEnum =
        currentQc && typeof currentQc === 'object' && '_enum' in currentQc
          ? (currentQc as { _enum: string })._enum
          : null;
      const currentQcDateLevel =
        currentQc && typeof currentQc === 'object' && 'dateLevel' in currentQc
          ? ((currentQc as { dateLevel?: string }).dateLevel ?? null)
          : null;

      const setQc = (payload: QuickCalculation | null) => {
        // P5+ duplicate chip:传 chipIdx 让 reducer 精确改用户点的 chip
        dispatch({
          type: 'SET_VALUE_QUICK_CALC',
          measureName: fieldName,
          quickCalc: payload,
          chipIdx: tagMenu.chipIdx,
        });
      };

      const qcChildren: ContextMenuItem[] = [];
      for (const q of ALL_QUICK_CALCS) {
        const requiresTime = !!q.requiresTimeAxis;
        if (!requiresTime) {
          qcChildren.push({
            key: `qc-${q.enumName}`,
            label: currentQcEnum === q.enumName ? `✓ ${q.label}` : q.label,
            onClick: () => {
              const payload = q.buildPayload
                ? q.buildPayload({ timeAxis: timeAxis ?? null })
                : q.defaultPayload;
              if (payload) setQc(payload);
            },
          });
          continue;
        }

        // 时间智能:根据 axes 数量决定 leaf vs submenu
        const isCurrentEnum = currentQcEnum === q.enumName;
        if (allTimeAxes.length === 0) {
          qcChildren.push({
            key: `qc-${q.enumName}`,
            label: q.label,
            disabled: true,
          });
        } else if (allTimeAxes.length === 1) {
          const axis = allTimeAxes[0]!;
          qcChildren.push({
            key: `qc-${q.enumName}`,
            label: isCurrentEnum ? `✓ ${q.label}` : q.label,
            onClick: () => {
              const payload = q.buildPayload?.({ timeAxis: axis }) ?? q.defaultPayload;
              if (payload) setQc(payload);
            },
          });
        } else {
          qcChildren.push({
            key: `qc-${q.enumName}`,
            label: isCurrentEnum ? `✓ ${q.label}` : q.label,
            children: allTimeAxes.map((axis) => {
              const levelAlias =
                metaIndex.findByName(axis.dateLevel)?.alias ?? axis.dateLevel;
              const checked = isCurrentEnum && currentQcDateLevel === axis.dateLevel;
              return {
                key: `qc-${q.enumName}-${axis.dateDimension}-${axis.dateLevel}`,
                label: checked ? `✓ 按 ${levelAlias}` : `按 ${levelAlias}`,
                onClick: () => {
                  const payload = q.buildPayload?.({ timeAxis: axis });
                  if (payload) setQc(payload);
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
          onClick: () =>
            dispatch({
              type: 'SET_VALUE_QUICK_CALC',
              measureName: fieldName,
              quickCalc: null,
              chipIdx: tagMenu.chipIdx,
            }),
        });
      }
      items.push({ key: 'qc', label: '快速计算', children: qcChildren });
    }

    // P3 显示设置 — 维度类 chip 才暴露"显示合计 / 小计"
    // 排除:
    //   - Measure / CalcMeasure(值字段,没有合计/小计概念)
    //   - MeasureGroupName(Σ 度量名称 sentinel chip — 是隐式度量轴占位,
    //     非真维度,后端不接受按其建合计/小计)
    // 仅 isMatrixView(pivot + table)下渲染 — adhoc 无合计概念,chart 不渲染合计行
    //
    // 关键约定:**两个按钮产生一致的后端 query**(都改 field-level subTotal),
    //          仅前端 label 按"在轴内是否首位"区分文案:
    //   - 第 1 个字段 → label "合计"(用户语义:整列/整行的汇总)
    //   - 第 ≥2 个字段 → label "小计"(用户语义:上层维度组内的汇总)
    //   两者互斥:一个 chip 只出现一个按钮,不会同时给两个。
    //
    // 全表总计开关 `pageState.showGrandTotal` **不在这里 toggle** —
    // 它是 axis-wide 概念,跟 per-field subTotal 不同语义,UI 入口在 SettingsModal。
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
        const subTotalOn =
          !!targetField?.subTotal && targetField.subTotal !== 'HIDDEN';
        const isFirstInAxis = idxInAxis === 0;
        const labelText = isFirstInAxis ? '显示合计' : '显示小计';
        items.push({ key: 'sep-totals', separator: true });
        items.push({
          key: 'toggle-subtotal',
          label: subTotalOn ? `✓ ${labelText}` : labelText,
          // 不管 label 是"合计"还是"小计",dispatch 都一样:改这个字段的 subTotal
          // → buildQuery 翻译成同一个 DimensionField.subTotal='SHOW',后端 query 一致
          onClick: () =>
            dispatch({
              type: 'SET_FIELD_SUB_TOTAL',
              zone,
              fieldName,
              subTotal: subTotalOn ? undefined : 'SHOW',
            }),
        });
      }
    }

    // P5+ 条件格式化 — 两条路径:
    //   (a) 透视的数值区 chip(per-measure scope)— 仅 isMatrixView
    //   (b) 明细的行区 chip(per-field scope)— 仅 isAdhoc + 数值列(valueType 是数值类)
    // chart 模式都不出(不走 cell 渲染)
    const isPivotValueChip = zone === 'value' && viewMode.isMatrixView;
    const isAdhocNumericRowChip =
      zone === 'row' && viewMode.isAdhoc && isNumericFieldByName(metaIndex, fieldName);
    if (onOpenConditionalFormat && (isPivotValueChip || isAdhocNumericRowChip)) {
      // value zone chip 的 fieldName 是 encoded full name(可能含 @AGG@/@QC@ 后缀),
      // 拆出原 measureName;adhoc row 直接用 fieldName(没有编码)
      const target = isPivotValueChip
        ? splitMeasureFieldName(fieldName).measureName
        : fieldName;
      items.push({ key: 'sep-cond-fmt', separator: true });
      items.push({
        key: 'cond-fmt',
        label: '条件格式化…',
        onClick: () => onOpenConditionalFormat(target),
      });
    }

    items.push({ key: 'sep-end', separator: true });
    items.push({
      key: 'remove',
      label: '从此区域移除',
      onClick: () => dispatch({ type: 'REMOVE_FIELD', zone, fieldName, chipIndex }),
    });

    return items;
    // 闭包依赖 tagMenu / viewConfig / viewMode — ContextMenu 只在点击时调 onClick,
    // 不必为 metaIndex/timeAxis/dispatch 变化重算(visual 上 menu 已弹出,内容不变)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagMenu, viewConfig, viewMode]);
}
