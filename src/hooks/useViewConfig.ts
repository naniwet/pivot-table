/**
 * useViewConfig — 受控/非受控的 ViewConfig 状态 hook（ADR-006）
 *
 * 职责（Unix）：
 *   - 把分散的纯变更函数（cycleRowSort / setRowPage / toggleHierarchyExpansion …）
 *     聚合为一个 reducer，对外暴露 [state, dispatch]
 *   - 处理"受控（value 给）/ 非受控（defaultValue 给）"两种模式
 *
 * 架构原则（CLAUDE.md "复杂度有代价"）：
 *   - 不引外部 store（Redux/Zustand），仅 useReducer
 *   - 模式（受控/非受控）首次渲染时锁定，避免运行时切换的歧义
 *   - 不做时间旅行 / undo（按需在 P3+ 引入）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';

import type { DropZone, FieldType } from '../core/dropRules/dropRules.js';
import { applyDrop } from '../core/viewConfig/applyDrop.js';
import {
  cycleRowSort,
  removeCustomSortOrder,
  setCustomSortOrder,
} from '../core/viewConfig/cycleRowSort.js';
import { drillDownHierarchy, drillUpHierarchy } from '../core/viewConfig/drillHierarchy.js';
import { removeFieldFromZone } from '../core/viewConfig/removeFieldFromZone.js';
import {
  applyAddCustomField,
  applyRemoveCustomField,
  applyUpdateCustomField,
} from '../core/viewConfig/customFields.js';
import { moveFieldInZone, type MoveDirection } from '../core/viewConfig/moveFieldInZone.js';
import { setFilters } from '../core/viewConfig/setFilters.js';
import { setMeasureFilters } from '../core/viewConfig/setMeasureFilters.js';
import { setRowPage } from '../core/viewConfig/setRowPage.js';
import { swapRowsColumns } from '../core/viewConfig/swapRowsColumns.js';
import { togglePivotAdhoc } from '../core/viewConfig/togglePivotAdhoc.js';
import { setValueQuickCalc } from '../core/viewConfig/setValueQuickCalc.js';
import {
  MAX_HISTORY,
  clearHistory as clearHistoryOp,
  isSignificantAction,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from '../core/viewConfig/historyOps.js';
import { setValueAggregator } from '../core/viewConfig/setValueAggregator.js';
import { setDisplayMode } from '../core/viewConfig/setDisplayMode.js';
import { setDisplayOptions } from '../core/viewConfig/setDisplayOptions.js';
import { setTotals } from '../core/viewConfig/setTotals.js';
import { setFieldSubTotal } from '../core/viewConfig/setFieldSubTotal.js';
import { addDimensionAsValue } from '../core/viewConfig/addDimensionAsValue.js';
import {
  addConditionalFormat,
  removeConditionalFormat,
  updateConditionalFormat,
} from '../core/viewConfig/conditionalFormatActions.js';
import { buildViewConfig } from '../fixtures/builders.js';
import type { Metadata } from '../types/metadata.js';
import type { QuickCalculation } from '../types/query.js';
import type {
  ClientFilter,
  CustomField,
  CustomRelationConfig,
  ClientMeasureFilter,
  ViewConfig,
} from '../types/viewConfig.js';

export type ViewConfigAction =
  | { type: 'DRILL_DOWN'; fieldName: string }
  | { type: 'DRILL_UP'; fieldName: string }
  | {
      type: 'CYCLE_ROW_SORT';
      fieldName: string;
      kind?: 'ByMeasure' | 'ByDimension';
      multi?: boolean;
      mode?: 'global' | 'group';
    }
  | { type: 'SET_ROW_PAGE'; pageNo: number }
  | { type: 'SET_TOTALS'; showGrandTotal?: boolean; subTotalAtEnd?: boolean }
  | {
      type: 'SET_DISPLAY_OPTIONS';
      compressEmptyRows?: boolean;
      compressEmptyColumns?: boolean;
      freezeHeader?: boolean;
      freezeRowHeader?: boolean;
      showTotalRowCount?: boolean;
      emptyValueText?: string;
      rowHeaderMode?: 'merge' | 'tree';
      columnHeaderMode?: 'merge' | 'tree';
      paginationMode?: 'paged' | 'scroll';
      exportMaxRows?: number;
    }
  | {
      /** 把字段(维度或已有度量)落到 value zone — 同 measureName + 同 aggregator 已存在则不重复 */
      type: 'ADD_DIMENSION_AS_VALUE';
      fieldName: string;
      aggregator: import('../types/query.js').Aggregator;
    }
  | { type: 'SWAP_ROWS_COLUMNS' }
  | {
      type: 'SET_DISPLAY_MODE';
      displayMode?: 'table' | 'chart' | 'tree';
      chartType?: 'bar' | 'line' | 'pie';
    }
  | {
      type: 'SET_FIELD_SUB_TOTAL';
      zone: 'row' | 'column';
      fieldName: string;
      subTotal: 'SHOW' | 'HIERARCHY_SHOW' | 'HIDDEN' | undefined;
    }
  | {
      type: 'DROP_FIELD';
      zone: DropZone;
      fieldName: string;
      fieldType: FieldType;
      /** 拖拽落点索引(可选,不传 = append 末尾)— 支持拖拽 reorder */
      insertIdx?: number;
      /** P3+ value zone 多 chip:chip 内部拖动用 sourceZone + chipKey 精确 reorder */
      sourceZone?: DropZone;
      chipKey?: string;
      chipIndex?: number;
    }
  | {
      type: 'SET_VALUE_AGGREGATOR';
      /** 目标 chip 的 encoded fullName(getMeasureFieldName(v))— duplicate chip 共享同 chipKey,需配合 chipIdx 精确定位 */
      chipKey: string;
      /**
       * P5+ duplicate chip 精确定位:viewConfig.values 里的 idx,优先按 idx 改;
       * 未传 → fallback 按 chipKey 找第一个 match(向后兼容)
       */
      chipIdx?: number;
      /** 新 aggregator;null = 用 metadata 默认 */
      aggregator: import('../types/query.js').Aggregator | null;
    }
  | {
      /** P5+ 切查询模式 — 切到 'adhoc' 时迁移 column/value 字段到 row */
      type: 'SET_QUERY_MODE';
      mode: 'pivot' | 'adhoc';
    }
  | {
      type: 'REMOVE_FIELD';
      zone: DropZone;
      fieldName: string;
      /**
       * P5+ duplicate chip 精确定位:viewConfig.values 里的 idx。
       * 仅 value zone 用 — duplicate chip 共享同 encoded name,不传则删所有同 name 的(老语义);
       * row/column/filter zone 字段名唯一,无须 chipIdx
       */
      chipIdx?: number;
    }
  | { type: 'MOVE_FIELD'; zone: DropZone; fieldName: string; direction: MoveDirection }
  | {
      type: 'SET_VALUE_QUICK_CALC';
      measureName: string;
      quickCalc: QuickCalculation | null;
      /** P5+ duplicate chip 精确定位;同 SET_VALUE_AGGREGATOR.chipIdx */
      chipIdx?: number;
    }
  | { type: 'SET_FILTERS'; filters: ClientFilter[] }
  | { type: 'SET_MEASURE_FILTERS'; measureFilters: ClientMeasureFilter[] }
  | { type: 'ADD_CUSTOM_FIELD'; field: CustomField }
  | { type: 'REMOVE_CUSTOM_FIELD'; id: string }
  | { type: 'UPDATE_CUSTOM_FIELD'; field: CustomField }
  | { type: 'SET_CUSTOM_RELATIONS'; customRelations: CustomRelationConfig[] }
  | {
      /** P5+ 条件格式化 — 加 / 改 / 删 rule(rule.id 是 key) */
      type: 'ADD_CONDITIONAL_FORMAT';
      rule: import('../types/viewConfig.js').ConditionalFormatRule;
    }
  | {
      type: 'UPDATE_CONDITIONAL_FORMAT';
      rule: import('../types/viewConfig.js').ConditionalFormatRule;
    }
  | { type: 'REMOVE_CONDITIONAL_FORMAT'; id: string }
  /**
   * P5+ 自定义排序顺序(ByCustomCaption)— 用户在 dim chip 右键 "自定义排序…" 配的成员顺序。
   * customCaption[i] 为 ASC 时显示顺序的第 i 位;DESC 反序。
   * 已存在同 fieldName 的 ByCustomCaption → 替换;不存在 → 新增。
   */
  | {
      type: 'SET_CUSTOM_SORT_ORDER';
      fieldName: string;
      customCaption: string[];
      direction?: 'ASC' | 'DESC';
    }
  /** 移除某字段的自定义排序(其他 sort 保留) */
  | { type: 'REMOVE_CUSTOM_SORT_ORDER'; fieldName: string }
  | { type: 'SET'; viewConfig: ViewConfig };

/**
 * DRILL_DOWN 需要 metadata 查 hierarchy 最大深度，因此 reducer 是 "metadata-aware"。
 * 不传 metadata 时调 DRILL_DOWN 会 throw（开发期捕获而非运行时静默失败）。
 */
export function viewConfigReducer(
  state: ViewConfig,
  action: ViewConfigAction,
  metadata?: Metadata,
): ViewConfig {
  switch (action.type) {
    case 'DRILL_DOWN':
      if (!metadata) throw new Error('[viewConfigReducer] DRILL_DOWN requires metadata');
      return drillDownHierarchy(state, action.fieldName, metadata);
    case 'DRILL_UP':
      return drillUpHierarchy(state, action.fieldName);
    case 'CYCLE_ROW_SORT':
      return cycleRowSort(state, action.fieldName, action.kind, {
        multi: action.multi,
        mode: action.mode,
      });
    case 'SET_ROW_PAGE':
      return setRowPage(state, action.pageNo);
    case 'SET_TOTALS':
      // 2026-05-17:下沉到 core/setTotals.ts
      return setTotals(state, {
        showGrandTotal: action.showGrandTotal,
        subTotalAtEnd: action.subTotalAtEnd,
      });
    case 'SET_DISPLAY_OPTIONS':
      // 2026-05-17:批量字段更新下沉到 core/setDisplayOptions.ts(数据驱动)
      return setDisplayOptions(state, {
        compressEmptyRows: action.compressEmptyRows,
        compressEmptyColumns: action.compressEmptyColumns,
        freezeHeader: action.freezeHeader,
        freezeRowHeader: action.freezeRowHeader,
        showTotalRowCount: action.showTotalRowCount,
        emptyValueText: action.emptyValueText,
        rowHeaderMode: action.rowHeaderMode,
        columnHeaderMode: action.columnHeaderMode,
        paginationMode: action.paginationMode,
        exportMaxRows: action.exportMaxRows,
      });
    case 'ADD_DIMENSION_AS_VALUE':
      // 2026-05-17:维度转度量(创建 CustomDimAsMeasureField 包装)下沉到 core;
      //   Date.now/Math.random 通过 mintId 注入,保 core fn 纯
      return addDimensionAsValue(
        state,
        action.fieldName,
        action.aggregator,
        () => `dam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      );
    case 'SET_VALUE_AGGREGATOR':
      // 2026-05-17:chipIdx 精确定位 + agg/qc 互斥 全部下沉到 core/setValueAggregator.ts
      return setValueAggregator(state, action.chipKey, action.chipIdx, action.aggregator);
    case 'SET_QUERY_MODE':
      // 2026-05-17:snapshot/restore/merge/displayMode 防御 — 全部下沉到
      //   core/viewConfig/togglePivotAdhoc.ts(原 ~70 行 reducer 内容 → 1 行调用)
      return togglePivotAdhoc(state, action.mode);
    case 'SWAP_ROWS_COLUMNS':
      return swapRowsColumns(state);
    case 'SET_DISPLAY_MODE':
      // 2026-05-17:adhoc 挡 chart 防御 + displayMode/chartType 更新 → core/setDisplayMode.ts
      return setDisplayMode(state, {
        displayMode: action.displayMode,
        chartType: action.chartType,
      });
    case 'SET_FIELD_SUB_TOTAL':
      // 2026-05-17:per-field subTotal 切换 + 剔除字段语义下沉到 core/setFieldSubTotal.ts
      return setFieldSubTotal(state, action.zone, action.fieldName, action.subTotal);
    case 'DROP_FIELD':
      return applyDrop(
        state,
        action.zone,
        action.fieldName,
        action.fieldType,
        action.insertIdx,
        { sourceZone: action.sourceZone, chipKey: action.chipKey, chipIndex: action.chipIndex },
      );
    case 'REMOVE_FIELD':
      return removeFieldFromZone(state, action.zone, action.fieldName, action.chipIdx);
    case 'MOVE_FIELD':
      return moveFieldInZone(state, action.zone, action.fieldName, action.direction);
    case 'SET_VALUE_QUICK_CALC':
      return setValueQuickCalc(state, action.measureName, action.quickCalc, action.chipIdx);
    case 'SET_FILTERS':
      return setFilters(state, action.filters);
    case 'SET_MEASURE_FILTERS':
      return setMeasureFilters(state, action.measureFilters);
    case 'ADD_CUSTOM_FIELD':
      return applyAddCustomField(state, action.field);
    case 'REMOVE_CUSTOM_FIELD':
      return applyRemoveCustomField(state, action.id);
    case 'UPDATE_CUSTOM_FIELD':
      return applyUpdateCustomField(state, action.field);
    case 'SET_CUSTOM_RELATIONS':
      return { ...state, customRelations: action.customRelations };
    case 'ADD_CONDITIONAL_FORMAT':
      return addConditionalFormat(state, action.rule);
    case 'UPDATE_CONDITIONAL_FORMAT':
      return updateConditionalFormat(state, action.rule);
    case 'REMOVE_CONDITIONAL_FORMAT':
      return removeConditionalFormat(state, action.id);
    case 'SET_CUSTOM_SORT_ORDER':
      return setCustomSortOrder(
        state,
        action.fieldName,
        action.customCaption,
        action.direction,
      );
    case 'REMOVE_CUSTOM_SORT_ORDER':
      return removeCustomSortOrder(state, action.fieldName);
    case 'SET':
      return action.viewConfig;
  }
}

export interface UseViewConfigOptions {
  value?: ViewConfig;
  defaultValue?: ViewConfig;
  onChange?: (next: ViewConfig) => void;
  /** DRILL_DOWN 需要 metadata 查 hierarchy 最大深度；其他 action 不依赖 */
  metadata?: Metadata;
}

/**
 * P5+ 撤销/重做 API — useViewConfig 第 3 个返回值
 *
 * 设计:state snapshot 风格(每次显著编辑前把当前 viewConfig 整体入栈)。
 *   - 内存代价小(viewConfig ~几 KB × 50 = ~250KB)
 *   - 任何 viewConfig 变更都能撤销
 *   - reducer 保持纯,history 仅在 hook 内 wrap
 *
 * 黑名单:翻页(SET_ROW_PAGE)不入栈 — 跟编辑意图无关,Excel/Tableau 一致语义
 * 数据源切换(metadata.id 变化)→ 自动 clearHistory
 */
export interface ViewConfigHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** 手动清空 history(数据源切换会自动调,宿主一般不需要主动用) */
  clearHistory: () => void;
}

// 2026-05-17:MAX_HISTORY / NON_HISTORY_ACTIONS / push/undo/redo/clear 操作
//   全部下沉到 core/viewConfig/historyOps.ts(I1-I5 不变量 + 15 case 覆盖)

export function useViewConfig(
  options: UseViewConfigOptions,
): readonly [ViewConfig, Dispatch<ViewConfigAction>, ViewConfigHistory] {
  const { value, defaultValue, onChange, metadata } = options;

  // 模式在首次渲染时锁定（基于 value 是否曾经定义）
  const isControlledRef = useRef(value !== undefined);

  const [internalState, setInternalState] = useState<ViewConfig>(
    () => defaultValue ?? buildViewConfig(),
  );

  // P5+ 历史栈:past(undo 拉这个)+ future(redo 拉这个)
  // 不存 current — current 始终是 viewConfig(controlled 走 value,uncontrolled 走 internalState)
  const [history, setHistory] = useState<HistoryState<ViewConfig>>(
    () => ({ past: [], future: [] }),
  );

  const dispatch = useCallback<Dispatch<ViewConfigAction>>(
    (action) => {
      const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
      const next = viewConfigReducer(currentSource, action, metadata);
      // reducer 返回同引用 → 无变化,不触发 onChange / history
      // (现有 reducer 中部分分支已显式 return state 早退)
      if (next === currentSource) return;
      onChange?.(next);
      if (!isControlledRef.current) {
        setInternalState(next);
      }
      // 入 history(黑名单除外);任何"新"编辑都清空 redo 栈(经典编辑器行为)
      if (isSignificantAction(action.type)) {
        setHistory((h) => pushHistory(h, currentSource, MAX_HISTORY));
      }
    },
    [value, internalState, onChange, metadata],
  );

  // 受控时返回 value(用 internalState 兜底,理论上不该走到)
  const currentState = isControlledRef.current ? (value ?? internalState) : internalState;

  const undo = useCallback(() => {
    const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
    const res = undoHistory(history, currentSource, MAX_HISTORY);
    if (!res) return;
    onChange?.(res.restored);
    if (!isControlledRef.current) setInternalState(res.restored);
    setHistory(res.next);
  }, [history, value, internalState, onChange]);

  const redo = useCallback(() => {
    const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
    const res = redoHistory(history, currentSource, MAX_HISTORY);
    if (!res) return;
    onChange?.(res.restored);
    if (!isControlledRef.current) setInternalState(res.restored);
    setHistory(res.next);
  }, [history, value, internalState, onChange]);

  const clearHistory = useCallback(() => {
    setHistory(clearHistoryOp());
  }, []);

  // 数据源切换(metadata.id 变化)→ 自动清空 history
  const prevMetadataIdRef = useRef<string | undefined>(metadata?.id);
  useEffect(() => {
    const nextId = metadata?.id;
    if (prevMetadataIdRef.current !== undefined && prevMetadataIdRef.current !== nextId) {
      setHistory(clearHistoryOp());
    }
    prevMetadataIdRef.current = nextId;
  }, [metadata?.id]);

  const historyApi: ViewConfigHistory = {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    clearHistory,
  };

  return [currentState, dispatch, historyApi] as const;
}
