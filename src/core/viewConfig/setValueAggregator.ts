/**
 * setValueAggregator — 替换指定 chip 的 aggregator(支持 duplicate chip 精确定位)
 *
 * 收益(Unix):把 reducer 里"chipIdx 优先 + fallback + agg/qc 互斥"~25 行抽出来,
 *   测试可在 node 跑;chipIdx 防御语义跟 setValueQuickCalc / removeFieldFromZone 对齐。
 *
 * 不变量:
 *   I1. chipIdx 给且合法(idx 内 + 该位置 chip 的 encoded name 等于 chipKey)→ 优先用 chipIdx
 *   I2. chipIdx 缺省 / 越界 / stale → fallback findIndex 第一个 match(向后兼容老调用)
 *   I3. 找不到 chipKey → 返回入参引用(no-op)
 *   I4. aggregator 非 null → 同时清掉 quickCalc(互斥语义:agg 跟 qc 不能并存)
 *   I5. aggregator null(清 override)→ 不动 quickCalc(避免误清用户已配的快算)
 */
import type { Aggregator } from '../../types/query.js';
import type { ViewConfig } from '../../types/viewConfig.js';

import { getMeasureFieldName } from './quickCalcs.js';

export function setValueAggregator(
  state: ViewConfig,
  chipKey: string,
  chipIdx: number | undefined,
  aggregator: Aggregator | null,
): ViewConfig {
  // I1/I2: 精确定位优先,失败 fallback findIndex
  let idx: number;
  if (
    chipIdx !== undefined &&
    chipIdx >= 0 &&
    chipIdx < state.values.length &&
    getMeasureFieldName(state.values[chipIdx]!) === chipKey
  ) {
    idx = chipIdx;
  } else {
    idx = state.values.findIndex((v) => getMeasureFieldName(v) === chipKey);
  }
  // I3: 找不到 → no-op
  if (idx < 0) return state;
  const next = state.values.slice();
  // I4/I5: 非 null agg 清 qc;null agg 保留 qc
  next[idx] = aggregator != null
    ? { ...next[idx]!, aggregator, quickCalc: null }
    : { ...next[idx]!, aggregator };
  return { ...state, values: next };
}
