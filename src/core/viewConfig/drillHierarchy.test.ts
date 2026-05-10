/**
 * drillDownHierarchy / drillUpHierarchy — Hierarchy 轴深度增减
 *
 * 不变量：
 *   I1. drillDepth ∈ [1, maxDepth]，由 metadata 提供 maxDepth
 *   I2. 已在最深层 drill ▶ → no-op（不抛错，UI 应禁用按钮但 dispatch 防御性）
 *   I3. 已在 drillDepth=1 drill ▼ → no-op
 *   I4. 仅 type='Hierarchy' 的 RowField 受影响；其他原样
 *   I5. 找不到 fieldName 或 type 不对 → throw（与 toggle 旧版一致）
 */
import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildViewConfig } from '../../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import { drillDownHierarchy, drillUpHierarchy } from './drillHierarchy.js';

const HIER = FIELD_IDS.shipRegionHierarchy; // 3 levels: Province/Region/City

describe('drillDownHierarchy', () => {
  it('1 → 2 (top → top + region)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after.rows[0]!.drillDepth).toBe(2);
  });

  it('2 → 3 (down to deepest level)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after.rows[0]!.drillDepth).toBe(3);
  });

  it('3 → 3 (no-op at max depth)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 3 })],
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after.rows[0]!.drillDepth).toBe(3);
  });

  it('treats missing drillDepth as 1', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: HIER, type: 'Hierarchy' }], // no drillDepth
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after.rows[0]!.drillDepth).toBe(2);
  });

  it('throws when fieldName not in rows', () => {
    const before = buildViewConfig({ rows: [buildHierarchyRow({ fieldName: HIER })] });
    expect(() => drillDownHierarchy(before, 'unknown', orderModelMetadata)).toThrow(
      /not in rows/i,
    );
  });

  it('throws when target row is not a Hierarchy', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'foo', type: 'Dimension' }],
    });
    expect(() => drillDownHierarchy(before, 'foo', orderModelMetadata)).toThrow(
      /not a hierarchy/i,
    );
  });

  it('returns new ViewConfig (immutable)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after).not.toBe(before);
    expect(after.rows).not.toBe(before.rows);
  });

  it('does not modify sibling non-hierarchy rows', () => {
    const sibling = { fieldName: 'OrderDate', type: 'Dimension' as const };
    const before = buildViewConfig({
      rows: [sibling, buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const after = drillDownHierarchy(before, HIER, orderModelMetadata);
    expect(after.rows[0]).toBe(sibling);
    expect(after.rows[1]!.drillDepth).toBe(2);
  });
});

describe('drillUpHierarchy', () => {
  it('2 → 1', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
    });
    const after = drillUpHierarchy(before, HIER);
    expect(after.rows[0]!.drillDepth).toBe(1);
  });

  it('3 → 2', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 3 })],
    });
    const after = drillUpHierarchy(before, HIER);
    expect(after.rows[0]!.drillDepth).toBe(2);
  });

  it('1 → 1 (no-op at minimum)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const after = drillUpHierarchy(before, HIER);
    expect(after.rows[0]!.drillDepth).toBe(1);
  });

  it('treats missing drillDepth as 1 → still 1', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: HIER, type: 'Hierarchy' }],
    });
    const after = drillUpHierarchy(before, HIER);
    expect(after.rows[0]!.drillDepth).toBe(1);
  });

  it('throws on unknown fieldName', () => {
    const before = buildViewConfig({ rows: [buildHierarchyRow({ fieldName: HIER })] });
    expect(() => drillUpHierarchy(before, 'unknown')).toThrow(/not in rows/i);
  });

  it('throws when target is not a Hierarchy', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'foo', type: 'Dimension' }],
    });
    expect(() => drillUpHierarchy(before, 'foo')).toThrow(/not a hierarchy/i);
  });
});
