/**
 * translateRows 测试
 *
 * 翻译 viewConfig.rows → query.rows
 * Hierarchy → 按 drillDepth 输出多个 level fieldName（[docs/adr-004-hierarchy-drill.md](../../../../docs/adr-004-hierarchy-drill.md) C2）
 * 其他字段 → 原样输出 fieldName
 */

import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildDimensionRow } from '../../../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../../../fixtures/metadata/orderModel.js';
import { buildMetadataIndex } from '../../metadata/fieldIndex.js';

import { translateColumns, translateRows } from './rows.js';

const idx = buildMetadataIndex(orderModelMetadata);
const HIER = FIELD_IDS.shipRegionHierarchy; // 3 levels: ShipProvince2 / ShipRegion2 / ShipCity2

describe('translateRows', () => {
  it('returns empty array for empty input', () => {
    expect(translateRows([], idx)).toEqual([]);
  });

  it('Hierarchy with drillDepth=1 → 1 level (top)', () => {
    const result = translateRows(
      [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      idx,
    );
    expect(result).toEqual(['ShipProvince2']);
  });

  it('Hierarchy with drillDepth=2 → 2 levels (top + region)', () => {
    const result = translateRows(
      [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
      idx,
    );
    expect(result).toEqual(['ShipProvince2', 'ShipRegion2']);
  });

  it('Hierarchy with drillDepth=3 → all 3 levels', () => {
    const result = translateRows(
      [buildHierarchyRow({ fieldName: HIER, drillDepth: 3 })],
      idx,
    );
    expect(result).toEqual(['ShipProvince2', 'ShipRegion2', 'ShipCity2']);
  });

  it('Hierarchy with drillDepth>maxDepth → clamps to maxDepth', () => {
    const result = translateRows(
      [buildHierarchyRow({ fieldName: HIER, drillDepth: 99 })],
      idx,
    );
    expect(result).toEqual(['ShipProvince2', 'ShipRegion2', 'ShipCity2']);
  });

  it('Hierarchy with missing drillDepth defaults to 1', () => {
    const result = translateRows(
      [{ fieldName: HIER, type: 'Hierarchy' as const }],
      idx,
    );
    expect(result).toEqual(['ShipProvince2']);
  });

  it('Dimension row passes through fieldName as-is', () => {
    const result = translateRows([buildDimensionRow()], idx);
    expect(result).toEqual(['ShipProvince']);
  });

  it('preserves drag order across mixed types', () => {
    const result = translateRows(
      [
        buildDimensionRow({ fieldName: 'A' }),
        buildHierarchyRow({ fieldName: HIER, drillDepth: 2 }),
        buildDimensionRow({ fieldName: 'B' }),
      ],
      idx,
    );
    expect(result).toEqual(['A', 'ShipProvince2', 'ShipRegion2', 'B']);
  });

  it('hierarchy not in metadata → falls back to fieldName as-is (defensive)', () => {
    const result = translateRows(
      [buildHierarchyRow({ fieldName: 'unknown_hier', drillDepth: 2 })],
      idx,
    );
    expect(result).toEqual(['unknown_hier']);
  });

  it('NamedSet row → wraps as { _enum: "NameSet", name } (P2)', () => {
    const result = translateRows(
      [{ fieldName: 'top10客户', type: 'NamedSet' }],
      idx,
    );
    expect(result).toEqual([{ _enum: 'NameSet', name: 'top10客户' }]);
  });

  it('NamedSet column → wraps as NameSet (P2)', () => {
    const result = translateColumns(
      [{ fieldName: 'top10客户', type: 'NamedSet' }],
      idx,
    );
    expect(result).toEqual([{ _enum: 'NameSet', name: 'top10客户' }]);
  });
});
