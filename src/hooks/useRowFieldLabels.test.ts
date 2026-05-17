/**
 * useRowFieldLabels — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:I1-I5 + 边界 / 组合(11 case)全部下沉到 core
 *   rowFieldLabels.test.ts。hook 层只保留:
 *   - 1 条"hook 返回 core 计算结果"的 wiring smoke
 *   - 1 条 memoization 稳定引用(真 React useMemo 行为)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';
import type { ViewConfig, RowField } from '../types/viewConfig.js';

import { useRowFieldLabels } from './useRowFieldLabels.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function vc(rows: RowField[]): ViewConfig {
  return {
    rows, columns: [], values: [], filters: [], measureFilters: [],
    rowSorts: [], columnSorts: [],
    pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
    customFields: [], extensions: null,
  };
}

describe('useRowFieldLabels', () => {
  it('returns the core computeRowFieldLabels result (wiring smoke)', () => {
    const { result } = renderHook(() =>
      useRowFieldLabels(
        vc([
          { fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy', drillDepth: 2 },
          { fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' } as RowField,
        ]),
        metaIndex,
      ),
    );
    // 详细 case 由 core/rowFieldLabels.test.ts 证;此处只验 hook 正确调用 core fn
    expect(result.current).toEqual(['省份', '区域', '城市分组']);
  });

  it('stable memoization — 同 viewConfig + metaIndex 多次渲染保持引用相等', () => {
    const config = vc([{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy', drillDepth: 1 }]);
    const { result, rerender } = renderHook(
      ({ v }: { v: ViewConfig }) => useRowFieldLabels(v, metaIndex),
      { initialProps: { v: config } },
    );
    const first = result.current;
    rerender({ v: config });
    expect(result.current).toBe(first);
  });
});
