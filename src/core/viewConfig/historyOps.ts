/**
 * historyOps — past/future 栈的 4 个纯操作 + significant action 谓词
 *
 * 收益(Unix):原 useViewConfig hook 内嵌的 setHistory 内联逻辑(push/undo/redo/clear)
 *   抽到 core 显式声明。hook 仍负责 useState 包装 + onChange 触发,但栈的 invariants
 *   由 core 单测保证。
 *
 * 不变量:
 *   I1. pushHistory:把 currentState 入 past 末尾,清 future;past 超 maxHistory 时
 *       从头丢一个(保留最近 maxHistory 步)
 *   I2. undoHistory:past.length===0 → null(no-op 信号);否则取 past 末尾 → restored,
 *       past 弹一,future = [currentState, ...future],future 截 maxHistory
 *   I3. redoHistory:future.length===0 → null(no-op);否则取 future[0] → restored,
 *       future shift 一,past 推一(同 push 截断)
 *   I4. clearHistory:返回空栈
 *   I5. isSignificantAction:type 不在黑名单 → true(SET_ROW_PAGE 翻页不算编辑)
 */

/** history 上限 — 50 步对 BI 场景足够;超出 shift 最老的 */
export const MAX_HISTORY = 50;

/**
 * 不入 history 的 action 类型(action.type 黑名单):
 *   - SET_ROW_PAGE:翻页是"浏览"不是"编辑"(跟 Excel/Tableau 一致)
 */
const NON_HISTORY_ACTIONS: ReadonlySet<string> = new Set(['SET_ROW_PAGE']);

export interface HistoryState<T> {
  past: T[];
  future: T[];
}

/** I1: push 当前状态到 past 末尾,清 future;past 超上限丢最老 */
export function pushHistory<T>(
  history: HistoryState<T>,
  currentState: T,
  maxHistory: number = MAX_HISTORY,
): HistoryState<T> {
  return {
    past: [...history.past, currentState].slice(-maxHistory),
    future: [],
  };
}

/** I2: undo — past 空返 null(让 caller 决定 no-op);否则返还原状态 + 新栈 */
export function undoHistory<T>(
  history: HistoryState<T>,
  currentState: T,
  maxHistory: number = MAX_HISTORY,
): { restored: T; next: HistoryState<T> } | null {
  if (history.past.length === 0) return null;
  const restored = history.past[history.past.length - 1]!;
  return {
    restored,
    next: {
      past: history.past.slice(0, -1),
      future: [currentState, ...history.future].slice(0, maxHistory),
    },
  };
}

/** I3: redo — future 空返 null;否则返还原状态 + 新栈 */
export function redoHistory<T>(
  history: HistoryState<T>,
  currentState: T,
  maxHistory: number = MAX_HISTORY,
): { restored: T; next: HistoryState<T> } | null {
  if (history.future.length === 0) return null;
  const restored = history.future[0]!;
  return {
    restored,
    next: {
      past: [...history.past, currentState].slice(-maxHistory),
      future: history.future.slice(1),
    },
  };
}

/** I4: 清空 */
export function clearHistory<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

/** I5: action 是否算"显著编辑"(入 history)*/
export function isSignificantAction(actionType: string): boolean {
  return !NON_HISTORY_ACTIONS.has(actionType);
}
