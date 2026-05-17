/**
 * setDisplayMode — 更新 pageState.displayMode / chartType,带 adhoc 防御
 *
 * 收益:把"adhoc 不允许 chart"这条防御从 reducer 抽出来,跟 togglePivotAdhoc 配对成
 *   完整的"adhoc 不能图表化"语义(togglePivotAdhoc 管进入 adhoc 时强制 table;
 *   setDisplayMode 管 adhoc 期间挡掉 chart)
 *
 * 不变量:
 *   I1. adhoc 模式 + displayMode='chart' → 返回入参引用(no-op,防 UI 误切)
 *   I2. adhoc 模式 + displayMode != 'chart' → 正常更新
 *   I3. pivot 模式 → 不挡;displayMode / chartType 任一可独立更新
 *   I4. 两参皆 undefined → 返回入参引用(no change)— UI 没用,但接口上保持纯函数
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export interface SetDisplayModeArgs {
  displayMode?: 'table' | 'chart' | 'tree';
  chartType?: 'bar' | 'line' | 'pie';
}

export function setDisplayMode(
  state: ViewConfig,
  args: SetDisplayModeArgs,
): ViewConfig {
  const isAdhoc = (state.queryMode ?? 'pivot') === 'adhoc';
  // I1: adhoc 模式下挡掉 chart(明细无聚合数据,图表语义不成立)
  if (isAdhoc && args.displayMode === 'chart') return state;
  // I4: 两参都 undefined → 不动
  if (args.displayMode === undefined && args.chartType === undefined) return state;
  const next = { ...state.pageState };
  if (args.displayMode !== undefined) next.displayMode = args.displayMode;
  if (args.chartType !== undefined) next.chartType = args.chartType;
  return { ...state, pageState: next };
}
