/**
 * setFilters 测试 —
 *   I1. 替换 filters 全集,保持其他 zone 不变
 *   I2. 返回新 ViewConfig(immutable)
 *   I3. 空数组替换非空 / 非空替换空
 */
import { describe, expect, it } from 'vitest';

import { buildLeafFilter, buildViewConfig } from '../../fixtures/builders.js';
import type { ViewConfig } from '../../types/viewConfig.js';
import { setFilters } from './setFilters.js';

describe('setFilters', () => {
  it('I1: replaces filters with new array', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'h1', type: 'Hierarchy', drillDepth: 1 }],
      filters: [buildLeafFilter({ field: 'A' })],
    });
    const replacement = [buildLeafFilter({ field: 'B' })];
    const after = setFilters(before, replacement);
    expect(after.filters).toEqual(replacement);
    // other zones preserved
    expect(after.rows).toEqual(before.rows);
    expect(after.columns).toEqual([]);
    expect(after.values).toEqual([]);
  });

  it('I2: returns new ViewConfig (immutable)', () => {
    const before = buildViewConfig({ filters: [buildLeafFilter()] });
    const after = setFilters(before, []);
    expect(after).not.toBe(before);
    expect(after.filters).not.toBe(before.filters);
  });

  it('I3: empty → non-empty', () => {
    const before = buildViewConfig();
    expect(before.filters).toEqual([]);
    const replacement = [buildLeafFilter({ field: 'X' })];
    const after = setFilters(before, replacement);
    expect(after.filters).toHaveLength(1);
  });

  it('I3: non-empty → empty', () => {
    const before = buildViewConfig({ filters: [buildLeafFilter()] });
    const after = setFilters(before, []);
    expect(after.filters).toEqual([]);
  });

  it('I3: preserves measureFilters (sibling zone)', () => {
    const before = buildViewConfig({
      filters: [buildLeafFilter({ field: 'A' })],
      measureFilters: [{ measureName: 'm1', operator: 'GreaterThan', value: 100 } as any],
    });
    const after = setFilters(before, [buildLeafFilter({ field: 'B' })]);
    expect(after.measureFilters).toEqual(before.measureFilters);
  });

  it('does not mutate other pageState / sorts', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByDimension' as const, fieldName: 'x', direction: 'ASC' as const }],
      pageState: { rowPageNo: 2, rowPageSize: 10, columnPageNo: 1, columnPageSize: 50 },
      filters: [buildLeafFilter()],
    });
    const after = setFilters(before, []);
    expect(after.rowSorts).toEqual(before.rowSorts);
    expect(after.pageState).toEqual(before.pageState);
  });
});

describe('setFilters — type-driven regression guards', () => {
  it('return type matches ViewConfig', () => {
    const vc: ViewConfig = setFilters(buildViewConfig(), []);
    expect(vc.rows).toBeDefined();
    expect(vc.columns).toBeDefined();
    expect(vc.filters).toBeDefined();
    expect(vc.measureFilters).toBeDefined();
  });
});
