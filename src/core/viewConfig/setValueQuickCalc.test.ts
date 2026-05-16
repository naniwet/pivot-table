/**
 * setValueQuickCalc 测试
 */
import { describe, expect, it } from 'vitest';

import { buildValueField, buildViewConfig } from '../../fixtures/builders.js';

import { setValueQuickCalc } from './setValueQuickCalc.js';

describe('setValueQuickCalc', () => {
  it('sets quickCalc on the matching ValueField', () => {
    const before = buildViewConfig({ values: [buildValueField({ measureName: 'm1' })] });
    const after = setValueQuickCalc(before, 'm1', { _enum: 'RowGlobalPercent' });
    expect(after.values[0]!.quickCalc).toEqual({ _enum: 'RowGlobalPercent' });
  });

  it('null quickCalc clears the existing setting', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1', quickCalc: { _enum: 'TotalPercent' } })],
    });
    const after = setValueQuickCalc(before, 'm1', null);
    expect(after.values[0]!.quickCalc).toBeNull();
  });

  it('throws when measureName not in values', () => {
    const before = buildViewConfig();
    expect(() => setValueQuickCalc(before, 'unknown', null)).toThrow(/not in values/i);
  });

  it('does not mutate sibling ValueFields', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1' }), buildValueField({ measureName: 'm2' })],
    });
    const after = setValueQuickCalc(before, 'm1', { _enum: 'TotalPercent' });
    expect(after.values[1]).toBe(before.values[1]);
  });

  // 互斥:同一 ValueField 不能既带 aggregator override 又带 quickCalc —
  // 语义混乱(先聚合还是先 quickCalc?)P5 决定后设置的覆盖前设置的
  it('设置非 null quickCalc → 清掉已有的 aggregator override(互斥)', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1', aggregator: 'AVG' })],
    });
    const after = setValueQuickCalc(before, 'm1', { _enum: 'RowGlobalPercent' });
    expect(after.values[0]!.quickCalc).toEqual({ _enum: 'RowGlobalPercent' });
    expect(after.values[0]!.aggregator).toBeNull();
  });

  it('null quickCalc(清快速计算)→ 不影响 aggregator(避免误清)', () => {
    const before = buildViewConfig({
      values: [
        buildValueField({
          measureName: 'm1',
          aggregator: 'AVG',
          quickCalc: { _enum: 'RowGlobalPercent' },
        }),
      ],
    });
    const after = setValueQuickCalc(before, 'm1', null);
    expect(after.values[0]!.quickCalc).toBeNull();
    expect(after.values[0]!.aggregator).toBe('AVG');
  });
});
