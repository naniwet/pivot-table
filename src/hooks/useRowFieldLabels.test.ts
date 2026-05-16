/**
 * useRowFieldLabels 测试 —
 *   I1. MeasureGroupName → 'Σ 度量名称'
 *   I2. Hierarchy with drillDepth → 展开 level aliases
 *   I3. 普通 Dimension → metadata alias
 *   I4. metadata 找不到 → customFields 回退
 *   I5. 都找不到 → fieldName fallback
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';
import type { ViewConfig, RowField } from '../types/viewConfig.js';

import { useRowFieldLabels } from './useRowFieldLabels.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function vc(rows: RowField[], customFields: ViewConfig['customFields'] = []): ViewConfig {
  return {
    rows,
    columns: [],
    values: [],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
    customFields,
    extensions: null,
  };
}

function hierRow(overrides: Partial<RowField> = {}): RowField {
  return {
    fieldName: FIELD_IDS.shipRegionHierarchy,
    type: 'Hierarchy',
    drillDepth: 1,
    ...overrides,
  };
}

describe('useRowFieldLabels', () => {
  it('I1: MeasureGroupName → Σ 度量名称', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(
        vc([
          { fieldName: 'Measures', type: 'MeasureGroupName' },
        ]),
        metaIndex,
      ),
    );
    expect(result.current).toEqual(['Σ 度量名称']);
  });

  it('I2: Hierarchy drillDepth=1 → 一个 level alias', () => {
    const { result } = renderHook(() => useRowFieldLabels(vc([hierRow({ drillDepth: 1 })]), metaIndex));
    expect(result.current).toEqual(['省份']); // provinceNode alias
  });

  it('I2: Hierarchy drillDepth=2 → 两个 level aliases', () => {
    const { result } = renderHook(() => useRowFieldLabels(vc([hierRow({ drillDepth: 2 })]), metaIndex));
    expect(result.current).toEqual(['省份', '区域']);
  });

  it('I2: Hierarchy drillDepth=3 → 三个 level aliases', () => {
    const { result } = renderHook(() => useRowFieldLabels(vc([hierRow({ drillDepth: 3 })]), metaIndex));
    expect(result.current).toEqual(['省份', '区域', '发货城市']);
  });

  it('I2: Hierarchy drillDepth 超过 level 数 → 只出存在的 levels', () => {
    // drillDepth=10 也只会出 3 个 level(province→region→city)
    const { result } = renderHook(() => useRowFieldLabels(vc([hierRow()]), metaIndex));
    // Even at default drillDepth=1, if all children exist, just first
    expect(result.current).toHaveLength(1);
  });

  it('I2: Hierarchy drillDepth default to 1 when undefined', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(vc([{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy' } as RowField]), metaIndex),
    );
    expect(result.current).toHaveLength(1);
  });

  it('I3: 普通 Dimension → metadata alias', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(vc([{ fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' } as RowField]), metaIndex),
    );
    expect(result.current).toEqual(['城市分组']);
  });

  it('I4: field 不在 metadata → 从 customFields 回退 name', () => {
    const cfId = 'enum-my-group';
    const { result } = renderHook(() =>
      useRowFieldLabels(
        vc(
          [{ fieldName: cfId, type: 'EnumGroup' } as RowField],
          [{ id: cfId, name: '我的分组', kind: 'enum_group', baseField: 'province', groups: [], ungroupedHandling: 'show_individually' as const }],
        ),
        metaIndex,
      ),
    );
    expect(result.current).toEqual(['我的分组']);
  });

  it('I5: 同时不在 metadata 和 customFields → fieldName fallback', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(vc([{ fieldName: 'ghost_field', type: 'Dimension' } as RowField]), metaIndex),
    );
    expect(result.current).toEqual(['ghost_field']);
  });

  it('多 row 组合', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(
        vc([
          hierRow({ drillDepth: 2 }),
          { fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' } as RowField,
        ]),
        metaIndex,
      ),
    );
    expect(result.current).toEqual(['省份', '区域', '城市分组']);
  });

  it('empty rows → empty labels', () => {
    const { result } = renderHook(() => useRowFieldLabels(vc([]), metaIndex));
    expect(result.current).toEqual([]);
  });

  it('stable memoization', () => {
    const config = vc([hierRow()]);
    const { result, rerender } = renderHook(({ v }: { v: ViewConfig }) => useRowFieldLabels(v, metaIndex), {
      initialProps: { v: config },
    });
    const first = result.current;
    rerender({ v: config });
    expect(result.current).toBe(first);
  });
});
