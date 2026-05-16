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
import { getMeasureFieldName as measureFieldNameOf } from '../core/viewConfig/quickCalcs.js';
import { cycleRowSort } from '../core/viewConfig/cycleRowSort.js';
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
import { setValueQuickCalc } from '../core/viewConfig/setValueQuickCalc.js';
import { buildViewConfig } from '../fixtures/builders.js';
import type { Metadata } from '../types/metadata.js';
import type { QuickCalculation } from '../types/query.js';
import type {
  ClientFilter,
  ColumnField,
  CustomField,
  ClientMeasureFilter,
  RowField,
  Sort,
  ValueField,
  ViewConfig,
} from '../types/viewConfig.js';

/**
 * 切到 adhoc 模式前的 pivot 状态快照,存进 viewConfig.extensions[PIVOT_SNAPSHOT_KEY]。
 * 切回 pivot 时按快照还原 rows/columns/values/columnSorts(adhoc 期间的 row 编辑不带回)。
 *
 * 不快照 filters / measureFilters / customFields / rowSorts:这些跨模式延续(用户意图)。
 */
const PIVOT_SNAPSHOT_KEY = '__pivotSnapshot__';
interface PivotSnapshot {
  rows: RowField[];
  columns: ColumnField[];
  values: ValueField[];
  columnSorts: Sort[];
}

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
      /** 目标 chip 的 encoded fullName(getMeasureFieldName(v)) */
      chipKey: string;
      /** 新 aggregator;null = 用 metadata 默认 */
      aggregator: import('../types/query.js').Aggregator | null;
      /** value zone 同 measure 完全重复 chip 的精确定位索引 */
      chipIndex?: number;
    }
  | {
      /** P5+ 切查询模式 — 切到 'adhoc' 时迁移 column/value 字段到 row */
      type: 'SET_QUERY_MODE';
      mode: 'pivot' | 'adhoc';
    }
  | { type: 'REMOVE_FIELD'; zone: DropZone; fieldName: string; chipIndex?: number }
  | { type: 'MOVE_FIELD'; zone: DropZone; fieldName: string; direction: MoveDirection }
  | { type: 'SET_VALUE_QUICK_CALC'; measureName: string; quickCalc: QuickCalculation | null; chipIndex?: number }
  | { type: 'SET_FILTERS'; filters: ClientFilter[] }
  | { type: 'SET_MEASURE_FILTERS'; measureFilters: ClientMeasureFilter[] }
  | { type: 'ADD_CUSTOM_FIELD'; field: CustomField }
  | { type: 'REMOVE_CUSTOM_FIELD'; id: string }
  | { type: 'UPDATE_CUSTOM_FIELD'; field: CustomField }
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
    case 'SET_TOTALS': {
      // 部分更新:不传的字段保留 state 中现值
      const next = { ...state.pageState };
      if (action.showGrandTotal !== undefined) next.showGrandTotal = action.showGrandTotal;
      if (action.subTotalAtEnd !== undefined) next.subTotalAtEnd = action.subTotalAtEnd;
      return { ...state, pageState: next };
    }
    case 'SET_DISPLAY_OPTIONS': {
      // P3 设置面板:批量更新显示选项
      const next = { ...state.pageState };
      if (action.compressEmptyRows !== undefined) next.compressEmptyRows = action.compressEmptyRows;
      if (action.compressEmptyColumns !== undefined) next.compressEmptyColumns = action.compressEmptyColumns;
      if (action.freezeHeader !== undefined) next.freezeHeader = action.freezeHeader;
      if (action.freezeRowHeader !== undefined) next.freezeRowHeader = action.freezeRowHeader;
      if (action.showTotalRowCount !== undefined) next.showTotalRowCount = action.showTotalRowCount;
      if (action.emptyValueText !== undefined) next.emptyValueText = action.emptyValueText;
      if (action.rowHeaderMode !== undefined) next.rowHeaderMode = action.rowHeaderMode;
      if (action.columnHeaderMode !== undefined) next.columnHeaderMode = action.columnHeaderMode;
      if (action.paginationMode !== undefined) next.paginationMode = action.paginationMode;
      if (action.exportMaxRows !== undefined) next.exportMaxRows = action.exportMaxRows;
      return { ...state, pageState: next };
    }
    case 'ADD_DIMENSION_AS_VALUE': {
      // 维度转度量 — 2026-05-07 起统一创建一个 CustomDimAsMeasureField(第 5 种 customField),
      // 翻译产生 CustomMeasure + measureBinding 元素;values 字段引用 customField.id。
      // 同 sourceField + 同 aggregator 已有 customField 则复用,不重复建。
      const existingCf = state.customFields.find(
        (cf): cf is import('../types/viewConfig.js').CustomDimAsMeasureField =>
          cf.kind === 'dim_as_measure' &&
          cf.sourceField === action.fieldName &&
          cf.aggregator === action.aggregator,
      );
      if (existingCf) {
        // 复用 — 只检查 values 是否已含,否则补一条
        const hasValue = state.values.some((v) => v.measureName === existingCf.id);
        if (hasValue) return state;
        return {
          ...state,
          values: [
            ...state.values,
            { measureName: existingCf.id, aggregator: null, quickCalc: null },
          ],
        };
      }
      // 新建 customField
      const id = `dam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newCf: import('../types/viewConfig.js').CustomDimAsMeasureField = {
        id,
        // 显示名:`<sourceField>(<AGG>)` — 跟其他自建字段命名风格一致
        name: `${action.fieldName}(${action.aggregator})`,
        kind: 'dim_as_measure',
        sourceField: action.fieldName,
        aggregator: action.aggregator,
        dataFormat: '',
      };
      return {
        ...state,
        customFields: [...state.customFields, newCf],
        values: [
          ...state.values,
          { measureName: id, aggregator: null, quickCalc: null },
        ],
      };
    }
    case 'SET_VALUE_AGGREGATOR': {
      // chipIndex 提供 → 精确定位(同 measure + 同 agg/qc 的完全重复 chip)
      const idx =
        action.chipIndex !== undefined &&
        action.chipIndex >= 0 &&
        action.chipIndex < state.values.length
          ? action.chipIndex
          : state.values.findIndex(
              (v) =>
                // chipKey 是 encoded full name 含 aggregator/quickCalc 信息
                measureFieldNameOf(v) === action.chipKey,
            );
      if (idx < 0) return state;
      const next = state.values.slice();
      next[idx] = { ...next[idx]!, aggregator: action.aggregator };
      return { ...state, values: next };
    }
    case 'SET_QUERY_MODE': {
      // queryMode 默认 'pivot'(undefined → 'pivot');同 mode dispatch 是 no-op
      const currentMode = state.queryMode ?? 'pivot';
      if (action.mode === currentMode) return state;
      // adhoc ↔ pivot 双向状态保留:
      //   pivot → adhoc:快照 (rows/columns/values/columnSorts) 存进 extensions.pivotSnapshot,
      //                 把 columns+values 全 merge 到 rows
      //   adhoc → pivot:从快照还原 (rows/columns/values/columnSorts),清快照
      //                 — adhoc 期间对 row 的修改不带回 pivot(按"两个独立视图"语义)
      //                 — filters / measureFilters / customFields / rowSorts 保留(意图跨模式延续)
      if (action.mode === 'adhoc') {
        const snapshot: PivotSnapshot = {
          rows: state.rows,
          columns: state.columns,
          values: state.values,
          columnSorts: state.columnSorts,
        };
        const moved: RowField[] = [
          ...state.rows,
          ...state.columns.map((c) => ({ ...c })),
          ...state.values.map(
            (v): RowField => ({ fieldName: v.measureName, type: 'Dimension' }),
          ),
        ];
        // 同 fieldName 去重(保第一次出现位置)
        const seen = new Set<string>();
        const dedup = moved.filter((r) => {
          if (seen.has(r.fieldName)) return false;
          seen.add(r.fieldName);
          return true;
        });
        // adhoc 不支持图表(没有聚合后数据);displayMode 强制回 'table'
        const nextPageState =
          state.pageState.displayMode === 'chart'
            ? { ...state.pageState, displayMode: 'table' as const }
            : state.pageState;
        return {
          ...state,
          queryMode: 'adhoc',
          rows: dedup,
          columns: [],
          values: [],
          columnSorts: [],
          pageState: nextPageState,
          extensions: {
            ...(state.extensions ?? {}),
            [PIVOT_SNAPSHOT_KEY]: snapshot,
          },
        };
      }
      // 切回 pivot:从 snapshot 还原(若有);清掉 snapshot
      const ext = state.extensions ?? {};
      const snap = ext[PIVOT_SNAPSHOT_KEY] as PivotSnapshot | undefined;
      if (!snap || typeof snap !== 'object' || !Array.isArray(snap.rows)) {
        return { ...state, queryMode: 'pivot' };
      }
      // strip snapshot from extensions
      const restExt = Object.fromEntries(
        Object.entries(ext).filter(([k]) => k !== PIVOT_SNAPSHOT_KEY),
      );
      return {
        ...state,
        queryMode: 'pivot',
        rows: snap.rows,
        columns: snap.columns,
        values: snap.values,
        columnSorts: snap.columnSorts,
        extensions: Object.keys(restExt).length > 0 ? restExt : null,
      };
    }
    case 'SWAP_ROWS_COLUMNS':
      return swapRowsColumns(state);
    case 'SET_DISPLAY_MODE': {
      // adhoc 模式下不允许切到 chart(明细无聚合数据,图表无意义)— 防御性挡掉
      const isAdhoc = (state.queryMode ?? 'pivot') === 'adhoc';
      if (isAdhoc && action.displayMode === 'chart') return state;
      const next = { ...state.pageState };
      if (action.displayMode !== undefined) next.displayMode = action.displayMode;
      if (action.chartType !== undefined) next.chartType = action.chartType;
      return { ...state, pageState: next };
    }
    case 'SET_FIELD_SUB_TOTAL': {
      // per-field subTotal:对 row/column 的某个字段切换显示模式
      // subTotal=undefined 表示清掉(等同 HIDDEN,但更省 query 字段)
      const updateField = <T extends { fieldName: string; subTotal?: string }>(
        arr: T[],
      ): T[] =>
        arr.map((f) =>
          f.fieldName === action.fieldName
            ? action.subTotal === undefined
              ? // remove subTotal field (rest spread without it)
                (() => {
                  const { subTotal: _drop, ...rest } = f as T & { subTotal?: string };
                  return rest as T;
                })()
              : ({ ...f, subTotal: action.subTotal } as T)
            : f,
        );
      if (action.zone === 'row') {
        return { ...state, rows: updateField(state.rows) };
      }
      return { ...state, columns: updateField(state.columns) };
    }
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
      return removeFieldFromZone(state, action.zone, action.fieldName, action.chipIndex);
    case 'MOVE_FIELD':
      return moveFieldInZone(state, action.zone, action.fieldName, action.direction);
    case 'SET_VALUE_QUICK_CALC':
      return setValueQuickCalc(state, action.measureName, action.quickCalc, action.chipIndex);
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
    case 'ADD_CONDITIONAL_FORMAT': {
      const list = state.pageState.conditionalFormats ?? [];
      // 同 id 已存在 → no-op(应该走 UPDATE)
      if (list.some((r) => r.id === action.rule.id)) return state;
      return {
        ...state,
        pageState: { ...state.pageState, conditionalFormats: [...list, action.rule] },
      };
    }
    case 'UPDATE_CONDITIONAL_FORMAT': {
      const list = state.pageState.conditionalFormats ?? [];
      const idx = list.findIndex((r) => r.id === action.rule.id);
      if (idx === -1) return state; // id 找不到 → no-op
      const next = [...list];
      next[idx] = action.rule;
      return {
        ...state,
        pageState: { ...state.pageState, conditionalFormats: next },
      };
    }
    case 'REMOVE_CONDITIONAL_FORMAT': {
      const list = state.pageState.conditionalFormats ?? [];
      const next = list.filter((r) => r.id !== action.id);
      if (next.length === list.length) return state; // 没动 → 引用相等防 re-render
      return {
        ...state,
        pageState: { ...state.pageState, conditionalFormats: next },
      };
    }
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

/** history 上限 — 50 步对 BI 场景足够;超出 shift 最老的 */
const MAX_HISTORY = 50;

/**
 * 不入 history 的 action 类型(action.type 黑名单):
 *   - SET_ROW_PAGE:翻页是"浏览"不是"编辑",跟 Excel/Tableau 一致
 * 其他所有 action 都入栈(包括 SET — 整体替换也算一步)
 */
const NON_HISTORY_ACTIONS: ReadonlySet<ViewConfigAction['type']> = new Set([
  'SET_ROW_PAGE',
]);

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
  const [history, setHistory] = useState<{ past: ViewConfig[]; future: ViewConfig[] }>(
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
      if (!NON_HISTORY_ACTIONS.has(action.type)) {
        setHistory((h) => ({
          past: [...h.past, currentSource].slice(-MAX_HISTORY),
          future: [],
        }));
      }
    },
    [value, internalState, onChange, metadata],
  );

  // 受控时返回 value(用 internalState 兜底,理论上不该走到)
  const currentState = isControlledRef.current ? (value ?? internalState) : internalState;

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1]!;
    const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
    onChange?.(prev);
    if (!isControlledRef.current) {
      setInternalState(prev);
    }
    setHistory({
      past: history.past.slice(0, -1),
      future: [currentSource, ...history.future].slice(0, MAX_HISTORY),
    });
  }, [history, value, internalState, onChange]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0]!;
    const currentSource = isControlledRef.current ? (value ?? internalState) : internalState;
    onChange?.(next);
    if (!isControlledRef.current) {
      setInternalState(next);
    }
    setHistory({
      past: [...history.past, currentSource].slice(-MAX_HISTORY),
      future: history.future.slice(1),
    });
  }, [history, value, internalState, onChange]);

  const clearHistory = useCallback(() => {
    setHistory({ past: [], future: [] });
  }, []);

  // 数据源切换(metadata.id 变化)→ 自动清空 history
  // 跨数据源的老 history 字段名不通用,撤销没意义
  const prevMetadataIdRef = useRef<string | undefined>(metadata?.id);
  useEffect(() => {
    const nextId = metadata?.id;
    if (prevMetadataIdRef.current !== undefined && prevMetadataIdRef.current !== nextId) {
      setHistory({ past: [], future: [] });
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
