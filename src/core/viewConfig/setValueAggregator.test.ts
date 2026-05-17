/**
 * setValueAggregator 测试 — chipIdx 精确定位 + agg/qc 互斥 (I1-I5)
 */
import { describe, expect, it } from 'vitest';

import { buildValueField, buildViewConfig } from '../../fixtures/builders.js';

import { getMeasureFieldName } from './quickCalcs.js';
import { setValueAggregator } from './setValueAggregator.js';

describe('setValueAggregator — chipIdx 精确定位 (I1/I2)', () => {
  it('I1: chipIdx=1 + 合法 → 改的是 idx 1 chip,不是 findIndex 撞首的 idx 0', () => {
    const state = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales' }),
        buildValueField({ measureName: 'sales' }), // duplicate
      ],
    });
    const next = setValueAggregator(state, 'sales', 1, 'AVG');
    expect(next.values[0]!.aggregator).toBeFalsy(); // idx 0 不动
    expect(next.values[1]!.aggregator).toBe('AVG'); // idx 1 改
  });

  it('I2: chipIdx 缺省 → fallback findIndex 改第一个 match', () => {
    const state = buildValueField; // placeholder; replaced below
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales' }),
        buildValueField({ measureName: 'sales' }),
      ],
    });
    const next = setValueAggregator(vc, 'sales', undefined, 'SUM');
    expect(next.values[0]!.aggregator).toBe('SUM'); // findIndex 第一个
    expect(next.values[1]!.aggregator).toBeFalsy();
    // (silence unused)
    void state;
  });

  it('I2: chipIdx 越界 → fallback findIndex', () => {
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales' }),
        buildValueField({ measureName: 'sales' }),
      ],
    });
    const next = setValueAggregator(vc, 'sales', 99, 'MAX');
    expect(next.values[0]!.aggregator).toBe('MAX');
  });

  it('I2: chipIdx 处 chip 跟 chipKey 不匹配 (stale) → fallback findIndex', () => {
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales' }),
        buildValueField({ measureName: 'cost' }),
      ],
    });
    // chipIdx=1 但该位置是 cost,不是 sales — stale,fallback 找 idx 0
    const next = setValueAggregator(vc, 'sales', 1, 'MIN');
    expect(next.values[0]!.aggregator).toBe('MIN');
    expect(next.values[1]!.aggregator).toBeFalsy();
  });
});

describe('setValueAggregator — no-op (I3)', () => {
  it('I3: 找不到 chipKey → 入参引用', () => {
    const state = buildViewConfig({
      values: [buildValueField({ measureName: 'sales' })],
    });
    expect(setValueAggregator(state, 'nope', undefined, 'SUM')).toBe(state);
  });
});

describe('setValueAggregator — agg/qc 互斥 (I4/I5)', () => {
  // 注意:chipKey 是 encoded fullName(getMeasureFieldName),含 @QC@ / @A@ 后缀;
  //   UI 调用时把 chip 的 encoded name 传进来,这里用 helper 算出来匹配 reducer 真实路径
  it('I4: 非 null agg → 清掉已有的 quickCalc', () => {
    const vf = buildValueField({ measureName: 'sales', quickCalc: 'GroupPercent' });
    const state = buildViewConfig({ values: [vf] });
    const next = setValueAggregator(state, getMeasureFieldName(vf), 0, 'AVG');
    expect(next.values[0]!.aggregator).toBe('AVG');
    expect(next.values[0]!.quickCalc).toBeNull();
  });

  it('I5: null agg(清 override)→ 不影响 quickCalc(避免误清)', () => {
    const vf = buildValueField({
      measureName: 'sales',
      aggregator: 'AVG',
      quickCalc: 'GroupPercent',
    });
    const state = buildViewConfig({ values: [vf] });
    const next = setValueAggregator(state, getMeasureFieldName(vf), 0, null);
    expect(next.values[0]!.aggregator).toBeNull();
    expect(next.values[0]!.quickCalc).toBe('GroupPercent'); // 保留
  });
});
