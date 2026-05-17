import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';

import { setDisplayOptions } from './setDisplayOptions.js';

describe('setDisplayOptions — I1/I2/I3', () => {
  it('I1: 空 args → 入参引用 (no-op)', () => {
    const state = buildViewConfig();
    expect(setDisplayOptions(state, {})).toBe(state);
  });

  it('I2: 单 boolean 字段 → 只改它', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, { compressEmptyRows: false });
    expect(next.pageState.compressEmptyRows).toBe(false);
    // 其他字段保留默认
    expect(next.pageState.compressEmptyColumns).toBe(state.pageState.compressEmptyColumns);
  });

  it('I2: 单 string 字段 → 只改它', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, { emptyValueText: '-' });
    expect(next.pageState.emptyValueText).toBe('-');
  });

  it('I2: 单 enum 字段 → 只改它', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, { paginationMode: 'scroll' });
    expect(next.pageState.paginationMode).toBe('scroll');
  });

  it('I2: 单 number 字段 → 只改它', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, { exportMaxRows: 5000 });
    expect(next.pageState.exportMaxRows).toBe(5000);
  });

  it('I3: 多字段同时给 → 全部应用', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, {
      compressEmptyRows: false,
      freezeHeader: false,
      emptyValueText: 'N/A',
      paginationMode: 'scroll',
      exportMaxRows: 8000,
    });
    expect(next.pageState.compressEmptyRows).toBe(false);
    expect(next.pageState.freezeHeader).toBe(false);
    expect(next.pageState.emptyValueText).toBe('N/A');
    expect(next.pageState.paginationMode).toBe('scroll');
    expect(next.pageState.exportMaxRows).toBe(8000);
  });

  it('I2: false 也是有效值(防御:! 不当作 undefined)', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, compressEmptyRows: true },
    });
    const next = setDisplayOptions(state, { compressEmptyRows: false });
    expect(next.pageState.compressEmptyRows).toBe(false);
  });

  it('I2: 空字符串也是有效值', () => {
    const state = buildViewConfig();
    const next = setDisplayOptions(state, { emptyValueText: '' });
    expect(next.pageState.emptyValueText).toBe('');
  });
});
