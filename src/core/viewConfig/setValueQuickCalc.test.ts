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
});
