/**
 * setDisplayMode 测试 — 不变量 I1-I4
 */
import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';

import { setDisplayMode } from './setDisplayMode.js';

describe('setDisplayMode — adhoc 防御 + 更新', () => {
  it('I1: adhoc + displayMode=chart → 入参引用 (no-op,UI 误切防御)', () => {
    const state = buildViewConfig({ queryMode: 'adhoc' });
    expect(setDisplayMode(state, { displayMode: 'chart' })).toBe(state);
  });

  it('I2: adhoc + displayMode=table → 正常更新', () => {
    const state = buildViewConfig({
      queryMode: 'adhoc',
      pageState: { ...buildViewConfig().pageState, displayMode: 'tree' },
    });
    const next = setDisplayMode(state, { displayMode: 'table' });
    expect(next.pageState.displayMode).toBe('table');
  });

  it('I3: pivot + displayMode=chart → 不挡,正常切', () => {
    const state = buildViewConfig(); // queryMode 缺省 = pivot
    const next = setDisplayMode(state, { displayMode: 'chart' });
    expect(next.pageState.displayMode).toBe('chart');
  });

  it('I3: pivot + chartType=line → 单独更新 chartType,displayMode 不动', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, displayMode: 'chart', chartType: 'bar' },
    });
    const next = setDisplayMode(state, { chartType: 'line' });
    expect(next.pageState.chartType).toBe('line');
    expect(next.pageState.displayMode).toBe('chart');
  });

  it('I3: pivot + displayMode + chartType 同时 → 都更新', () => {
    const state = buildViewConfig();
    const next = setDisplayMode(state, { displayMode: 'chart', chartType: 'pie' });
    expect(next.pageState.displayMode).toBe('chart');
    expect(next.pageState.chartType).toBe('pie');
  });

  it('I4: 两参皆 undefined → 入参引用', () => {
    const state = buildViewConfig();
    expect(setDisplayMode(state, {})).toBe(state);
  });
});
