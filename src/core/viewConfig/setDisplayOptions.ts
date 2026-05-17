/**
 * setDisplayOptions — 部分更新 pageState 的显示选项(P3 设置面板批量提交)
 *
 * 收益:reducer SET_DISPLAY_OPTIONS case 原 ~15 行重复 if-check 变 1 行调用;
 *   原先 hook 层只在 history 测试里顺带触发,本身没语义测试 — 抽到 core 后补全。
 *
 * 注意:接口字段跟 PageState 一一对应;不传 = 不动(undefined 不当作"清空")。
 *
 * 不变量:
 *   I1. 所有字段皆 undefined → 入参引用(no-op)
 *   I2. 任一字段给值 → 仅更新该字段(其他保留)
 *   I3. 多字段同时给值 → 全部应用
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export interface SetDisplayOptionsArgs {
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

/** 字段表(数据驱动 — 加新字段只改这里,不用复制 if-check) */
const OPTION_KEYS = [
  'compressEmptyRows',
  'compressEmptyColumns',
  'freezeHeader',
  'freezeRowHeader',
  'showTotalRowCount',
  'emptyValueText',
  'rowHeaderMode',
  'columnHeaderMode',
  'paginationMode',
  'exportMaxRows',
] as const;

export function setDisplayOptions(
  state: ViewConfig,
  args: SetDisplayOptionsArgs,
): ViewConfig {
  // I1: 所有字段皆 undefined → no-op
  let touched = false;
  for (const k of OPTION_KEYS) {
    if (args[k] !== undefined) {
      touched = true;
      break;
    }
  }
  if (!touched) return state;
  const next: typeof state.pageState = { ...state.pageState };
  for (const k of OPTION_KEYS) {
    const v = args[k];
    if (v !== undefined) {
      // 类型上 K 对应 PageState 子集,且 args[k] 的具体类型跟 next[k] 一致
      // 用 unknown 双跳避开 PageState 没 index signature 的限制
      (next as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return { ...state, pageState: next };
}
