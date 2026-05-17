/**
 * useCellMenu — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:I1-I6(10 case 含 chips 推导/custom-field/drill 路由)
 *   下沉到 core buildCellMenu.test.ts。hook 层只保留 2 条 wiring:
 *   - guard:cellMenu=null → 空
 *   - 正常:返回 1 item + onClick → onSetDetailContext 被调
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';
import { makeCellSet, makeMember, makeColumnMeta } from '../fixtures/cellSet.js';
import type { CellSet } from '../types/cellSet.js';
import type { ViewConfig } from '../types/viewConfig.js';

import { useCellMenu } from './useCellMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

const vc: ViewConfig = {
  rows: [{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy', drillDepth: 1 }],
  columns: [],
  values: [{ measureName: FIELD_IDS.salesMeasure, aggregator: null, quickCalc: null }],
  filters: [], measureFilters: [], rowSorts: [], columnSorts: [],
  pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
  customFields: [], extensions: null,
};

function cellSet(): CellSet {
  return makeCellSet({
    columnMetadataArray: [makeColumnMeta({ name: FIELD_IDS.salesMeasure, alias: '销售额' })],
    rows: [[makeMember({ uniqueName: ['江苏'], name: '江苏' })]],
    columns: [[makeMember({ uniqueName: ['2024'], name: '2024', level: 'OrderDate_Year', fieldName: 'OrderDate_Year', dimension: 'OrderDate' })]],
  });
}

describe('useCellMenu — wiring', () => {
  it('cellMenu=null → 空 items (wiring)', () => {
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: null, drillThroughEnabled: true, cellSet: cellSet(),
        viewConfig: vc, metadata: orderModelMetadata, metaIndex,
        onSetDetailContext: vi.fn(),
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('正常 → 1 item;onClick → onSetDetailContext 被调(wiring)', () => {
    const onSetDetailContext = vi.fn();
    const { result } = renderHook(() =>
      useCellMenu({
        cellMenu: { rowIndex: 0, colIndex: 0, x: 0, y: 0 },
        drillThroughEnabled: true,
        cellSet: cellSet(),
        viewConfig: vc, metadata: orderModelMetadata, metaIndex,
        onSetDetailContext,
      }),
    );
    expect(result.current).toHaveLength(1);
    result.current[0]!.onClick!();
    expect(onSetDetailContext).toHaveBeenCalled();
  });
});
