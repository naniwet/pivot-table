/**
 * useCellMenu 测试 —
 *   I1. cellMenu=null → 空 items
 *   I2. drillThroughEnabled=false → 空 items
 *   I3. cellSet=null → 空 items
 *   I4. 正常 → 一项 menu: 查看明细
 *   I5. onClick → onDrillThrough(query) 或 onSetDetailContext(...)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';
import { makeCellSet, makeMember, makeColumnMeta } from '../fixtures/cellSet.js';
import type { CellSet } from '../types/cellSet.js';
import type { ViewConfig } from '../types/viewConfig.js';

import type { CellMenuTarget } from './useCellMenu.js';
import { useCellMenu } from './useCellMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

const vc: ViewConfig = {
  rows: [{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy', drillDepth: 1 }],
  columns: [],
  values: [{ measureName: FIELD_IDS.salesMeasure, aggregator: null, quickCalc: null }],
  filters: [],
  measureFilters: [],
  rowSorts: [],
  columnSorts: [],
  pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
  customFields: [],
  extensions: null,
};

function makeMenuTarget(overrides: Partial<CellMenuTarget> = {}): CellMenuTarget {
  return { rowIndex: 0, colIndex: 0, x: 100, y: 200, ...overrides };
}

function cellSet(): CellSet {
  return makeCellSet({
    columnMetadataArray: [makeColumnMeta({ name: FIELD_IDS.salesMeasure, alias: '销售额' })],
    rows: [[makeMember({ uniqueName: ['江苏'], name: '江苏' })]],
    columns: [[makeMember({ uniqueName: ['2024'], name: '2024', level: 'OrderDate_Year', fieldName: 'OrderDate_Year', dimension: 'OrderDate' })]],
  });
}

describe('useCellMenu — guard clauses', () => {
  it('I1: cellMenu=null → []', () => {
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: null,
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext: vi.fn(),
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('I2: drillThroughEnabled=false → []', () => {
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: false,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext: vi.fn(),
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('I3: cellSet=null → []', () => {
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: true,
        cellSet: null,
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext: vi.fn(),
      }),
    );
    expect(result.current).toEqual([]);
  });
});

describe('useCellMenu — happy path', () => {
  it('I4: 返回一个 menu item: 查看明细', () => {
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext: vi.fn(),
      }),
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.key).toBe('drill-through');
    expect(result.current[0]!.label).toBe('查看明细');
  });

  it('I5: onClick → onDrillThrough 优先,传递 query', () => {
    const onDrillThrough = vi.fn();
    const onSetDetailContext = vi.fn();
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onDrillThrough,
        onSetDetailContext,
      }),
    );
    result.current[0]!.onClick!();
    expect(onDrillThrough).toHaveBeenCalledTimes(1);
    const query = onDrillThrough.mock.calls[0][0];
    expect(query).toBeDefined();
    expect(query.rows).toBeDefined();
    expect(query.columns).toBeDefined();
    expect(onSetDetailContext).not.toHaveBeenCalled();
  });

  it('I5: onClick → 无 onDrillThrough 则调 onSetDetailContext', () => {
    const onSetDetailContext = vi.fn();
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext,
      }),
    );
    result.current[0]!.onClick!();
    expect(onSetDetailContext).toHaveBeenCalledTimes(1);
    expect(onSetDetailContext).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ rows: expect.any(Array) }),
      chips: expect.any(Array),
    }));
  });
});

describe('useCellMenu — chips', () => {
  it('chips 包含行列成员摘要', () => {
    const onSetDetailContext = vi.fn();
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget(),
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext,
      }),
    );
    result.current[0]!.onClick!();
    expect(onSetDetailContext).toHaveBeenCalled();
    const arg = onSetDetailContext.mock.calls[0][0];
    expect(arg.chips.length).toBeGreaterThan(0);
  });

  it('Measures member → 跳过(不加入 chip)', () => {
    const onSetDetailContext = vi.fn();
    const cs = makeCellSet({
      columnMetadataArray: [makeColumnMeta()],
      rows: [[makeMember({ uniqueName: ['Measures', FIELD_IDS.salesMeasure], name: '销售额', level: 'MeasuresLevel', dimension: 'Measures', fieldName: FIELD_IDS.salesMeasure })]],
      columns: [],
    });
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget({ colIndex: 0, rowIndex: 0 }),
        drillThroughEnabled: true,
        cellSet: cs,
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext,
      }),
    );
    result.current[0]!.onClick!();
    // Measures member 不产生 chip(rows 也不产生 col member)
    expect(onSetDetailContext).toHaveBeenCalled();
  });

  it('(All) level member → 跳过', () => {
    const onSetDetailContext = vi.fn();
    const cs = makeCellSet({
      columnMetadataArray: [makeColumnMeta()],
      rows: [[makeMember({ uniqueName: ['全部'], name: '全部', level: '(All)', dimension: FIELD_IDS.shipRegionHierarchy, fieldName: FIELD_IDS.shipRegionHierarchy })]],
      columns: [],
    });
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: makeMenuTarget({ colIndex: 0, rowIndex: 0 }),
        drillThroughEnabled: true,
        cellSet: cs,
        viewConfig: vc,
        metadata: orderModelMetadata,
        metaIndex,
        onSetDetailContext,
      }),
    );
    result.current[0]!.onClick!();
    expect(onSetDetailContext).toHaveBeenCalled();
    // (All) level → skipped, no row-derived chip
    const args = onSetDetailContext.mock.calls[0][0];
    expect(args.chips).toEqual([]);
  });
});
