import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';

import { setTotals } from './setTotals.js';

describe('setTotals — I1/I2/I3', () => {
  it('I1: 两参皆 undefined → 入参引用', () => {
    const state = buildViewConfig();
    expect(setTotals(state, {})).toBe(state);
  });

  it('I2: 仅 showGrandTotal → 只改它,subTotalAtEnd 不动', () => {
    const state = buildViewConfig();
    const beforeSub = state.pageState.subTotalAtEnd;
    const next = setTotals(state, { showGrandTotal: false });
    expect(next.pageState.showGrandTotal).toBe(false);
    expect(next.pageState.subTotalAtEnd).toBe(beforeSub);
  });

  it('I2: 仅 subTotalAtEnd → 只改它', () => {
    const state = buildViewConfig();
    const next = setTotals(state, { subTotalAtEnd: false });
    expect(next.pageState.subTotalAtEnd).toBe(false);
  });

  it('I3: 两参皆给 → 都更新', () => {
    const state = buildViewConfig();
    const next = setTotals(state, { showGrandTotal: false, subTotalAtEnd: false });
    expect(next.pageState.showGrandTotal).toBe(false);
    expect(next.pageState.subTotalAtEnd).toBe(false);
  });
});
