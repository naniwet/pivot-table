/**
 * setTotals — 部分更新 pageState.{showGrandTotal, subTotalAtEnd}
 *
 * 收益(Unix):reducer SET_TOTALS case 原 ~8 行变 1 行调用;此 case 之前在 hook 层无独立测试,
 *   抽到 core 后顺手补 4 case 覆盖 — 填覆盖盲点。
 *
 * 不变量:
 *   I1. 两参皆 undefined → 返回入参引用(no-op,防无谓 re-render)
 *   I2. 单参给值 → 仅更新该字段,另一字段不动
 *   I3. 两参都给值 → 都更新
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export interface SetTotalsArgs {
  showGrandTotal?: boolean;
  subTotalAtEnd?: boolean;
}

export function setTotals(state: ViewConfig, args: SetTotalsArgs): ViewConfig {
  if (args.showGrandTotal === undefined && args.subTotalAtEnd === undefined) {
    return state; // I1
  }
  const next = { ...state.pageState };
  if (args.showGrandTotal !== undefined) next.showGrandTotal = args.showGrandTotal;
  if (args.subTotalAtEnd !== undefined) next.subTotalAtEnd = args.subTotalAtEnd;
  return { ...state, pageState: next };
}
