/**
 * togglePivotAdhoc — pivot ↔ adhoc 双向状态保留(原 useViewConfig SET_QUERY_MODE reducer)
 *
 * 收益(Unix):
 *   把 ~70 行 reducer 内部的 snapshot/restore/merge/displayMode 防御从 hook 拆出来,
 *   让 hook 只剩 dispatch orchestration;同时让"双向切换 + 跨模式延续"逻辑可在
 *   node 跑(58% → 60%+ unit)。
 * 代价:加 1 个 core 文件;reducer 那一段从 ~70 行变成 1 行调用。
 * 何时翻案:如果将来切换需要访问 metadata(目前不需要 — merge/snapshot 不查 metadata)。
 *
 * 不变量:
 *   I1. 同 mode → 返回入参引用(no-op,避免无谓 re-render)
 *   I2. pivot → adhoc:rows = [rows, columns, values.measureName] 去重 + 跳 customField,
 *                     清 columns/values/columnSorts,存 snapshot 进 extensions
 *   I3. pivot → adhoc:displayMode='chart' → 强制 'table'(其他保持 pageState 引用相等)
 *   I4. adhoc → pivot:从 snapshot 还原;清 snapshot;无 snapshot 时仅切 queryMode='pivot'
 *   I5. adhoc → pivot:adhoc 期间对 rows 的修改 NOT 带回(两个独立视图语义)
 *   I6. filters / measureFilters / customFields / rowSorts 跨模式延续(不进 snapshot)
 */
import type {
  ColumnField,
  RowField,
  Sort,
  ValueField,
  ViewConfig,
} from '../../types/viewConfig.js';

/**
 * 切到 adhoc 前的 pivot 状态快照 key — 存进 viewConfig.extensions[PIVOT_SNAPSHOT_KEY]。
 * 切回 pivot 时按快照还原 rows/columns/values/columnSorts。
 *
 * 不快照 filters / measureFilters / customFields / rowSorts:这些跨模式延续(用户意图)。
 */
export const PIVOT_SNAPSHOT_KEY = '__pivotSnapshot__';

interface PivotSnapshot {
  rows: RowField[];
  columns: ColumnField[];
  values: ValueField[];
  columnSorts: Sort[];
}

export function togglePivotAdhoc(
  state: ViewConfig,
  mode: 'pivot' | 'adhoc',
): ViewConfig {
  // I1: queryMode 默认 'pivot'(undefined → 'pivot');同 mode 是 no-op
  const currentMode = state.queryMode ?? 'pivot';
  if (mode === currentMode) return state;

  if (mode === 'adhoc') {
    // I2: pivot → adhoc snapshot + merge
    const customFieldIds = new Set(state.customFields.map((field) => field.id));
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
    const originalFields = moved.filter((r) => !customFieldIds.has(r.fieldName));
    // 同 fieldName 去重(保第一次出现位置)
    const seen = new Set<string>();
    const dedup = originalFields.filter((r) => {
      if (seen.has(r.fieldName)) return false;
      seen.add(r.fieldName);
      return true;
    });
    // I3: adhoc 不支持图表,displayMode='chart' 强制回 'table';否则 pageState 引用相等
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

  // mode === 'pivot':adhoc → pivot 还原
  const ext = state.extensions ?? {};
  const snap = ext[PIVOT_SNAPSHOT_KEY] as PivotSnapshot | undefined;
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.rows)) {
    // I4 后半:无 snapshot 防御 — 只切 queryMode,其他不动
    return { ...state, queryMode: 'pivot' };
  }
  // 剥掉 snapshot key,保留其他 extension
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
