/**
 * useTreeQueries 测试 —
 *   T1. enabled=false → 不发查询,空 branches
 *   T2. rows/values 为空 → 不发查询
 *   T3. refetch / retryBranch 不抛异常
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildDimensionRow, buildValueField, buildViewConfig } from '../fixtures/builders.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';
import { useTreeQueries } from './useTreeQueries.js';

const META = orderModelMetadata;

describe('useTreeQueries', () => {
  it('T1: enabled=false → 不发查询,空 branches', () => {
    const onQuery = vi.fn();
    const { result } = renderHook(() =>
      useTreeQueries({ viewConfig: buildViewConfig(), metadata: META, onQuery, expanded: new Set(), enabled: false }),
    );
    expect(result.current.branches.size).toBe(0);
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('T2: rows 为空 → 不发查询', () => {
    const onQuery = vi.fn();
    renderHook(() =>
      useTreeQueries({ viewConfig: buildViewConfig(), metadata: META, onQuery, expanded: new Set() }),
    );
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('T2: values 为空 → 不发查询', () => {
    const onQuery = vi.fn();
    renderHook(() =>
      useTreeQueries({
        viewConfig: buildViewConfig({ rows: [buildDimensionRow()] }),
        metadata: META, onQuery, expanded: new Set(), enabled: true,
      }),
    );
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('refetch 不抛异常', () => {
    const { result } = renderHook(() =>
      useTreeQueries({ viewConfig: buildViewConfig(), metadata: META, onQuery: vi.fn(), expanded: new Set(), enabled: false }),
    );
    expect(() => result.current.refetch()).not.toThrow();
    expect(result.current.branches.size).toBe(0);
  });

  it('retryBranch 不抛异常', () => {
    const { result } = renderHook(() =>
      useTreeQueries({ viewConfig: buildViewConfig(), metadata: META, onQuery: vi.fn(), expanded: new Set(), enabled: false }),
    );
    expect(() => result.current.retryBranch('root/some')).not.toThrow();
  });
});
