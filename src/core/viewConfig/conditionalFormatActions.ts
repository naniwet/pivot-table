/**
 * conditionalFormatActions — ADD/UPDATE/REMOVE_CONDITIONAL_FORMAT 三纯函数
 *
 * 收益(Unix):把"在 pageState.conditionalFormats 列表上 add/update/remove + 去重 + no-op
 *   引用相等"3 段重复逻辑从 reducer 抽出来,可在 node 跑、显式声明不变量。
 * 代价:加 1 个 core 文件,reducer 那 3 段从 ~30 行 → 3 个一行调用。
 *
 * 不变量:
 *   I1. ADD 同 id 已存在 → 返回入参引用(no-op,不重复加)
 *   I2. ADD 新 id → 追加到列表末尾(顺序保留,UI 渲染按列表序)
 *   I3. UPDATE id 不存在 → 返回入参引用(no-op)
 *   I4. UPDATE id 存在 → 替换该 id rule,其他位置不动(顺序保留)
 *   I5. REMOVE id 不存在 → 返回入参引用(no-op,防无谓 re-render)
 *   I6. REMOVE id 存在 → 按 id 过滤掉
 */
import type {
  ConditionalFormatRule,
  ViewConfig,
} from '../../types/viewConfig.js';

export function addConditionalFormat(
  state: ViewConfig,
  rule: ConditionalFormatRule,
): ViewConfig {
  const list = state.pageState.conditionalFormats ?? [];
  if (list.some((r) => r.id === rule.id)) return state; // I1
  return {
    ...state,
    pageState: { ...state.pageState, conditionalFormats: [...list, rule] },
  };
}

export function updateConditionalFormat(
  state: ViewConfig,
  rule: ConditionalFormatRule,
): ViewConfig {
  const list = state.pageState.conditionalFormats ?? [];
  const idx = list.findIndex((r) => r.id === rule.id);
  if (idx === -1) return state; // I3
  const next = list.slice();
  next[idx] = rule;
  return {
    ...state,
    pageState: { ...state.pageState, conditionalFormats: next },
  };
}

export function removeConditionalFormat(
  state: ViewConfig,
  id: string,
): ViewConfig {
  const list = state.pageState.conditionalFormats ?? [];
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return state; // I5
  return {
    ...state,
    pageState: { ...state.pageState, conditionalFormats: next },
  };
}
