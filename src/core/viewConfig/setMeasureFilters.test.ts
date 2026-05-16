/**
 * setMeasureFilters 测试 —
 *   I1. 替换 measureFilters 全集,保持其他 zone 不变
 *   I2. 返回新 ViewConfig(immutable)
 *   I3. 空数组替换非空 / 非空替换空
 */
import { describe, expect, it } from 'vitest';

import type { MeasureFilter } from '../../types/viewConfig.js';
import { buildViewConfig } from '../../fixtures/builders.js';
import { setMeasureFilters } from './setMeasureFilters.js';

function mf(overrides: Partial<MeasureFilter> = {}): MeasureFilter {
  return { measureName: 'sales', operator: 'GreaterThan', value: 100, ...overrides };
}

describe('setMeasureFilters', () => {
  it('I1: replaces measureFilters with new array', () => {
    const before = buildViewConfig({
      values: [{ measureName: 'sales', aggregator: null, quickCalc: null }],
      measureFilters: [mf()],
    });
    const replacement = [mf({ measureName: 'cost' })];
    const after = setMeasureFilters(before, replacement);
    expect(after.measureFilters).toEqual(replacement);
    expect(after.values).toEqual(before.values);
  });

  it('I2: returns new ViewConfig (immutable)', () => {
    const before = buildViewConfig({ measureFilters: [mf()] });
    const after = setMeasureFilters(before, []);
    expect(after).not.toBe(before);
    expect(after.measureFilters).not.toBe(before.measureFilters);
  });

  it('I3: empty → non-empty', () => {
    const before = buildViewConfig();
    const replacement = [mf({ measureName: 'x' })];
    const after = setMeasureFilters(before, replacement);
    expect(after.measureFilters).toHaveLength(1);
  });

  it('I3: non-empty → empty', () => {
    const before = buildViewConfig({ measureFilters: [mf()] });
    const after = setMeasureFilters(before, []);
    expect(after.measureFilters).toEqual([]);
  });

  it('preserves dimension filters (sibling zone)', () => {
    const before = buildViewConfig({
      filters: [{ kind: 'leaf', field: 'A', operator: 'Equals', value: 1 }],
      measureFilters: [mf()],
    });
    const after = setMeasureFilters(before, []);
    expect(after.filters).toEqual(before.filters);
  });

  it('preserves sorts and pageState', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: 'm1', direction: 'DESC' }],
      pageState: { rowPageNo: 3, rowPageSize: 20, columnPageNo: 1, columnPageSize: 50 },
      measureFilters: [mf()],
    });
    const after = setMeasureFilters(before, []);
    expect(after.rowSorts).toEqual(before.rowSorts);
    expect(after.pageState).toEqual(before.pageState);
  });
});
