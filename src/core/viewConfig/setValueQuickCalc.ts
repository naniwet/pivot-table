/**
 * setValueQuickCalc — 给 viewConfig.values 里某个 chip 设置 / 移除 quickCalc
 *
 * 用法（P1.0）：用户在 measure tag 上选择"占行总计%"等 → dispatch SET_VALUE_QUICK_CALC。
 *
 * 不变量：
 *   - 不存在的 measureName / encoded fieldName → throw（防御）
 *   - quickCalc=null → 清掉之前的 quickCalc(不影响 aggregator)
 *   - 设置非 null quickCalc → 同时清掉 aggregator override(两者互斥 —
 *     一个 measure 同时带 AVG 聚合 + 占行总计% 在 UI 语义上含混不清:
 *     "AVG 后再算占比"还是"先算占比再 AVG"?
 *     P5 决定:互斥,后设置的覆盖前设置的)
 *
 * P3+ 同 measure 多 ValueField:接受 encoded fieldName(getMeasureFieldName(v))精确匹配单 chip,
 * 退化按 measureName(选 first 命中,兼容老调用方)。
 */
import { getMeasureFieldName } from './quickCalcs.js';
import type { QuickCalculation } from '../../types/query.js';
import type { ViewConfig } from '../../types/viewConfig.js';

export function setValueQuickCalc(
  viewConfig: ViewConfig,
  measureName: string,
  quickCalc: QuickCalculation | null,
  /**
   * P5+ duplicate chip 精确定位:viewConfig.values 里的 idx,优先按 idx 改;
   * 未传 → fallback 按 encoded name / measureName 找第一个 match(向后兼容)
   */
  chipIdx?: number,
): ViewConfig {
  let idx: number;
  if (
    chipIdx !== undefined &&
    chipIdx >= 0 &&
    chipIdx < viewConfig.values.length &&
    // 防御:idx 处 chip 必须 encoded name 跟 measureName 一致,否则 chipIdx 跟 state 不同步
    (getMeasureFieldName(viewConfig.values[chipIdx]!) === measureName ||
      viewConfig.values[chipIdx]!.measureName === measureName)
  ) {
    idx = chipIdx;
  } else {
    // 优先按 encoded full name 精确匹配
    idx = viewConfig.values.findIndex((v) => getMeasureFieldName(v) === measureName);
    if (idx < 0) idx = viewConfig.values.findIndex((v) => v.measureName === measureName);
  }
  if (idx < 0) {
    throw new Error(`[setValueQuickCalc] measure "${measureName}" not in values`);
  }
  const nextValues = viewConfig.values.slice();
  const prev = nextValues[idx]!;
  // 设置非 null quickCalc → 同时清 aggregator(互斥);null = 清快速计算 → 不动 aggregator
  nextValues[idx] = quickCalc != null
    ? { ...prev, quickCalc, aggregator: null }
    : { ...prev, quickCalc };
  return { ...viewConfig, values: nextValues };
}
