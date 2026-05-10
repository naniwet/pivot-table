/**
 * setRowPage — 翻页只改 pageState.rowPageNo，其他字段保留
 */
import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';

import { setRowPage } from './setRowPage.js';

describe('setRowPage', () => {
  it('updates rowPageNo', () => {
    const before = buildViewConfig();
    const after = setRowPage(before, 3);
    expect(after.pageState.rowPageNo).toBe(3);
  });

  it('preserves other pageState fields (rowPageSize / column*)', () => {
    const before = buildViewConfig();
    const after = setRowPage(before, 5);
    expect(after.pageState.rowPageSize).toBe(before.pageState.rowPageSize);
    expect(after.pageState.columnPageNo).toBe(before.pageState.columnPageNo);
    expect(after.pageState.columnPageSize).toBe(before.pageState.columnPageSize);
  });

  it('returns new ViewConfig (immutable update)', () => {
    const before = buildViewConfig();
    const after = setRowPage(before, 2);
    expect(after).not.toBe(before);
    expect(after.pageState).not.toBe(before.pageState);
  });

  it('clamps to >= 1 (defensive: pageNo is 1-based per backend)', () => {
    const before = buildViewConfig();
    expect(setRowPage(before, 0).pageState.rowPageNo).toBe(1);
    expect(setRowPage(before, -3).pageState.rowPageNo).toBe(1);
  });
});
