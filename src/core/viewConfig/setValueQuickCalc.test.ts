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

  // 2026-05-17:duplicate chip(同 measureName 多 chip)精确定位 —
  //   chipIdx 优先,fallback findIndex 第一个 match
  describe('chipIdx 精确定位', () => {
    it('chipIdx=1 + 合法 → 改的是 idx 1 chip', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm1' }), // duplicate
        ],
      });
      const after = setValueQuickCalc(before, 'm1', { _enum: 'TotalPercent' }, 1);
      expect(after.values[0]!.quickCalc).toBeNull(); // idx 0 不动
      expect(after.values[1]!.quickCalc).toEqual({ _enum: 'TotalPercent' });
    });

    it('chipIdx 缺省 → fallback findIndex 第一个(向后兼容)', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm1' }),
        ],
      });
      const after = setValueQuickCalc(before, 'm1', { _enum: 'TotalPercent' });
      expect(after.values[0]!.quickCalc).toEqual({ _enum: 'TotalPercent' });
      expect(after.values[1]!.quickCalc).toBeNull();
    });

    it('chipIdx 越界 / stale → fallback findIndex', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm2' }),
        ],
      });
      // chipIdx=1 但该位置是 m2,不是 m1 — stale,fallback 找 idx 0
      const after = setValueQuickCalc(before, 'm1', { _enum: 'TotalPercent' }, 1);
      expect(after.values[0]!.quickCalc).toEqual({ _enum: 'TotalPercent' });
      expect(after.values[1]!.quickCalc).toBeNull();
    });
  });
});
