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
  x: number;
  y: number;
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
}

export function useTagMenu(opts: UseTagMenuOptions): ContextMenuItem[] {
  const { tagMenu, viewConfig, metaIndex, timeAxis, allTimeAxes, viewMode, dispatch, onOpenConditionalFormat } = opts;
  const { isAdhoc } = viewMode;

  return useMemo<ContextMenuItem[]>(() => {
    if (!tagMenu) return [];
    const { zone, fieldName, fieldType } = tagMenu;
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
    const idxInZone = zoneArr.findIndex(
      (f) => (f as { fieldName: string }).fieldName === fieldName,
    );
    const canUp = idxInZone > 0;
    const canDown = idxInZone >= 0 && idxInZone < zoneArr.length - 1;

    // 子菜单 1:排序 — adhoc 模式不支持分组内排序(无聚合分组)
    const sortChildren: ContextMenuItem[] = [
      sortItem('升序', 'ASC'),
      sortItem('降序', 'DESC'),
      ...(isAdhoc
        ? []
        : [sortItem('分组内升序', 'BASC'), sortItem('分组内降序', 'BDESC')]),
      {
        key: 'sort-clear',
        label: '取消排序',
        disabled: !currentSort,
        onClick: () => {
          const next = viewConfig.rowSorts.filter(
            (s) =>
              !(
                (s.type === 'ByMeasure' && s.measureName === fieldName) ||
                (s.type === 'ByDimension' && s.fieldName === fieldName)
              ),
          );
          dispatch({ type: 'SET', viewConfig: { ...viewConfig, rowSorts: next } });
        },
      },
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
      const targetChip = viewConfig.values.find((v) => getMeasureFieldName(v) === chipKey);
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
            dispatch({ type: 'SET_VALUE_AGGREGATOR', chipKey, aggregator: next });
          },
        };
      });
      items.push({ key: 'agg', label: '汇总依据', children: aggChildren });
    }

    // 度量字段 + value zone:快速计算子菜单
    if (isMeasure && zone === 'value') {
      const measureField = viewConfig.values.find(
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
        dispatch({ type: 'SET_VALUE_QUICK_CALC', measureName: fieldName, quickCalc: payload });
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
            }),
        });
      }
      items.push({ key: 'qc', label: '快速计算', children: qcChildren });
    }

    // P3 显示设置 — 维度类 chip 才暴露"显示小计 / 总计"
    // 仅 isMatrixView (pivot + table) 下渲染 — adhoc 没合计概念,chart 不渲染合计行
    if (!isMeasure && viewMode.isMatrixView && (zone === 'row' || zone === 'column')) {
      items.push({ key: 'sep-totals', separator: true });

      const fieldArr = zone === 'row' ? viewConfig.rows : viewConfig.columns;
      const targetField = fieldArr.find((f) => f.fieldName === fieldName);
      const subTotalOn = !!targetField?.subTotal && targetField.subTotal !== 'HIDDEN';
      items.push({
        key: 'toggle-subtotal',
        label: subTotalOn ? '✓ 显示小计' : '显示小计',
        onClick: () =>
          dispatch({
            type: 'SET_FIELD_SUB_TOTAL',
            zone,
            fieldName,
            subTotal: subTotalOn ? undefined : 'SHOW',
          }),
      });

      const grandOn = viewConfig.pageState.showGrandTotal !== false;
      items.push({
        key: 'toggle-grandtotal',
        label: grandOn ? '✓ 显示总计' : '显示总计',
        onClick: () => dispatch({ type: 'SET_TOTALS', showGrandTotal: !grandOn }),
      });
    }

    // P5+ 条件格式化 — 数值区 chip 才出现(per-measure scope)
    // 仅 isMatrixView 下有意义(adhoc 没数据矩阵;chart 不走 cell 渲染)
    if (zone === 'value' && viewMode.isMatrixView && onOpenConditionalFormat) {
      // value zone chip 的 fieldName 是 encoded full name(可能含 @AGG@/@QC@ 后缀),
      // 条件格式化按 measureName 走 — 拆出原 measureName
      const decoded = splitMeasureFieldName(fieldName);
      items.push({ key: 'sep-cond-fmt', separator: true });
      items.push({
        key: 'cond-fmt',
        label: '条件格式化…',
        onClick: () => onOpenConditionalFormat(decoded.measureName),
      });
    }

    items.push({ key: 'sep-end', separator: true });
    items.push({
      key: 'remove',
      label: '从此区域移除',
      onClick: () => dispatch({ type: 'REMOVE_FIELD', zone, fieldName }),
    });

    return items;
    // 闭包依赖 tagMenu / viewConfig / viewMode — ContextMenu 只在点击时调 onClick,
    // 不必为 metaIndex/timeAxis/dispatch 变化重算(visual 上 menu 已弹出,内容不变)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagMenu, viewConfig, viewMode]);
}
