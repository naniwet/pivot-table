/**
 * useAvailableFields — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:I1-I5 + 边界(12 case)已下沉到 core
 *   computeAvailableFields.test.ts。hook 层只保留:
 *   - 1 条 hook 返回 core 计算结果(wiring smoke)
 *   - 1 条 memoization 稳定引用(真 React useMemo 行为)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Metadata } from '../types/metadata.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';

import { useAvailableFields } from './useAvailableFields.js';

describe('useAvailableFields — hook wiring', () => {
  it('returns core computeAvailableFields result (wiring smoke)', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    // 详细 case 由 core 证;hook 这里仅验"正确调用 core fn 并返回 4 套字段集"
    expect(result.current.availableFields).toContain(FIELD_IDS.salesMeasure);
    expect(result.current.dimensionFields).not.toContain(FIELD_IDS.salesMeasure);
    expect(result.current.numericDimensionFields).toEqual([]);
    expect(result.current.physicalColumns).toContain(FIELD_IDS.provinceLevel);
  });

  it('stable memoization — 同 metadata 多次渲染保持引用相等', () => {
    const { result, rerender } = renderHook(({ meta }: { meta: Metadata }) => useAvailableFields(meta), {
      initialProps: { meta: orderModelMetadata },
    });
    const first = result.current;
    rerender({ meta: orderModelMetadata });
    expect(result.current).toBe(first);
  });
});
