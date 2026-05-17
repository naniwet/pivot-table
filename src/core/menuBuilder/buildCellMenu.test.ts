/**
 * buildCellMenuItems 测试 — I1-I6(从 useCellMenu.test.ts 下沉)
 */
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import { makeCellSet, makeMember, makeColumnMeta } from '../../fixtures/cellSet.js';
import type { CellSet } from '../../types/cellSet.js';
import type { ViewConfig } from '../../types/viewConfig.js';

import {
  type CellMenuTarget,
  buildCellMenuItems,
} from './buildCellMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

const vc: ViewConfig = {
  rows: [{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy', drillDepth: 1 }],
  columns: [],
  values: [{ measureName: FIELD_IDS.salesMeasure, aggregator: null, quickCalc: null }],
  filters: [], measureFilters: [], rowSorts: [], columnSorts: [],
  pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
  customFields: [], extensions: null,
};

function target(overrides: Partial<CellMenuTarget> = {}): CellMenuTarget {
  return { rowIndex: 0, colIndex: 0, x: 100, y: 200, ...overrides };
}

function cellSet(): CellSet {
  return makeCellSet({
    columnMetadataArray: [makeColumnMeta({ name: FIELD_IDS.salesMeasure, alias: '销售额' })],
    rows: [[makeMember({ uniqueName: ['江苏'], name: '江苏' })]],
    columns: [[
      makeMember({
        uniqueName: ['2024'], name: '2024', level: 'OrderDate_Year',
        fieldName: 'OrderDate_Year', dimension: 'OrderDate',
      }),
    ]],
  });
}

describe('buildCellMenuItems — I1 guard clauses', () => {
  it('I1: cellMenu=null → []', () => {
    expect(
      buildCellMenuItems(
        { cellMenu: null, drillThroughEnabled: true, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
        { onSetDetailContext: vi.fn() },
      ),
    ).toEqual([]);
  });

  it('I1: drillThroughEnabled=false → []', () => {
    expect(
      buildCellMenuItems(
        { cellMenu: target(), drillThroughEnabled: false, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
        { onSetDetailContext: vi.fn() },
      ),
    ).toEqual([]);
  });

  it('I1: cellSet=null → []', () => {
    expect(
      buildCellMenuItems(
        { cellMenu: target(), drillThroughEnabled: true, cellSet: null, viewConfig: vc, metadata: orderModelMetadata, metaIndex },
        { onSetDetailContext: vi.fn() },
      ),
    ).toEqual([]);
  });
});

describe('buildCellMenuItems — I2/I3 custom field cell 不可 drill', () => {
  it('I3: 正常 cell → 1 个 "查看明细" item', () => {
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext: vi.fn() },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.key).toBe('drill-through');
    expect(items[0]!.label).toBe('查看明细');
  });

  it('I3: 存在自建字段但当前 cell 是普通 measure → 仍返回', () => {
    const viewConfig: ViewConfig = {
      ...vc,
      customFields: [{
        id: 'cm_unused', name: '未使用计算度量', kind: 'calc_measure',
        dataFormat: '通用', expression: '[A] / [B]', ast: null,
      }],
    };
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext: vi.fn() },
    );
    expect(items[0]!.label).toBe('查看明细');
  });

  it('I2: 当前 cell 对应自建 measure → 空 items', () => {
    const customMeasure = 'cm_ratio';
    const viewConfig: ViewConfig = {
      ...vc,
      values: [{ measureName: customMeasure, aggregator: null, quickCalc: null }],
      customFields: [{
        id: customMeasure, name: '利润率', kind: 'calc_measure',
        dataFormat: '百分比', expression: '[A] / [B]', ast: null,
      }],
    };
    const cs = makeCellSet({
      columnMetadataArray: [makeColumnMeta({ name: customMeasure, alias: '利润率' })],
      rows: [[makeMember({ uniqueName: ['江苏'], name: '江苏' })]],
      columns: [[makeMember({
        uniqueName: ['Measures', customMeasure], name: '利润率',
        level: 'MeasuresLevel', dimension: 'Measures', fieldName: customMeasure,
      })]],
    });
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cs, viewConfig, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext: vi.fn() },
    );
    expect(items).toEqual([]);
  });
});

describe('buildCellMenuItems — I4 onClick 路由', () => {
  it('I4: 有 onDrillThrough → 优先调,传 query', () => {
    const onDrillThrough = vi.fn();
    const onSetDetailContext = vi.fn();
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
      { onDrillThrough, onSetDetailContext },
    );
    items[0]!.onClick!();
    expect(onDrillThrough).toHaveBeenCalledTimes(1);
    const query = onDrillThrough.mock.calls[0]![0];
    expect(query.rows).toBeDefined();
    expect(query.columns).toBeDefined();
    expect(onSetDetailContext).not.toHaveBeenCalled();
  });

  it('I4: 无 onDrillThrough → fallback 调 onSetDetailContext', () => {
    const onSetDetailContext = vi.fn();
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext },
    );
    items[0]!.onClick!();
    expect(onSetDetailContext).toHaveBeenCalledTimes(1);
    expect(onSetDetailContext).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ rows: expect.any(Array) }),
      chips: expect.any(Array),
    }));
  });
});

describe('buildCellMenuItems — I5/I6 chips 生成', () => {
  it('I5: chips 包含行/列 member 摘要(非 Measures、非 (All))', () => {
    const onSetDetailContext = vi.fn();
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig: vc, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext },
    );
    items[0]!.onClick!();
    const arg = onSetDetailContext.mock.calls[0]![0];
    expect(arg.chips.length).toBeGreaterThan(0);
  });

  it('I5: (All) level member → 跳过,不进 chips', () => {
    const onSetDetailContext = vi.fn();
    const cs = makeCellSet({
      columnMetadataArray: [makeColumnMeta()],
      rows: [[makeMember({
        uniqueName: ['全部'], name: '全部', level: '(All)',
        dimension: FIELD_IDS.shipRegionHierarchy, fieldName: FIELD_IDS.shipRegionHierarchy,
      })]],
      columns: [],
    });
    const items = buildCellMenuItems(
      { cellMenu: target({ colIndex: 0, rowIndex: 0 }), drillThroughEnabled: true, cellSet: cs, viewConfig: vc, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext },
    );
    items[0]!.onClick!();
    const arg = onSetDetailContext.mock.calls[0]![0];
    expect(arg.chips).toEqual([]);
  });

  it('I6: viewConfig.filters > 0 → chips 末尾加 "维度过滤(N 条)"', () => {
    const onSetDetailContext = vi.fn();
    const viewConfig: ViewConfig = {
      ...vc,
      filters: [{ kind: 'leaf', field: 'x', operator: 'In', value: ['a'] }],
    };
    const items = buildCellMenuItems(
      { cellMenu: target(), drillThroughEnabled: true, cellSet: cellSet(), viewConfig, metadata: orderModelMetadata, metaIndex },
      { onSetDetailContext },
    );
    items[0]!.onClick!();
    const arg = onSetDetailContext.mock.calls[0]![0];
    expect(arg.chips[arg.chips.length - 1]).toMatch(/维度过滤\(1 条\)/);
  });
});
