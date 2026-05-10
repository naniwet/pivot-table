/**
 * usePivotQuery — 拉取 + L0 缓存 + ADR-011 取消 + 连续失败保险丝
 *
 * 契约（与 p0-dev.md §3.5 对齐，做了 1 处简化）：
 *   - cacheTtlMs（默认 30000）取代 cacheType: 'CACHE'|'UNCACHE'|'CLEAR'
 *     - cacheTtlMs > 0 → 启用 L0 query 去重
 *     - cacheTtlMs = 0 → 不缓存（UNCACHE 等价）
 *     - refetch() → 等价 CLEAR：清缓存 + 重置失败计数 + 重新发起
 *
 * 行为不变量：
 *   I1. query 变更 → 旧 inflight 通过 ctx.signal.abort() 取消，且其结果不更新 state
 *   I2. 成功结果写入 L0；TTL 内同 query 命中缓存（不再调 onQuery）
 *   I3. 连续失败 ≥ maxFailures（默认 3）→ 后续 query 直接返回"操作过快"错误，不调 onQuery
 *   I4. 失败计数在成功 / refetch 后重置
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CellSet } from '../types/cellSet.js';
import type { Query } from '../types/query.js';

import { usePivotQuery } from './usePivotQuery.js';

// 极简 fixtures（本测试不关心 query/cellSet 内容，只要引用稳定）
const Q1: Query = { modelId: 'm1', queryType: 'PivotQuery', engineType: 'MDX' } as unknown as Query;
const Q2: Query = { modelId: 'm2', queryType: 'PivotQuery', engineType: 'MDX' } as unknown as Query;
const Q3: Query = { modelId: 'm3', queryType: 'PivotQuery', engineType: 'MDX' } as unknown as Query;
const Q4: Query = { modelId: 'm4', queryType: 'PivotQuery', engineType: 'MDX' } as unknown as Query;
const RESULT: CellSet = {
  rowFields: [],
  columnFields: [],
  columnMetadataArray: [],
  rows: [],
  columns: [],
  data: [],
  fieldNameToUniqueId: {},
  totalRowCount: 0,
};
const RESULT2: CellSet = { ...RESULT, totalRowCount: 1 };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePivotQuery — idle / null query', () => {
  it('returns idle state when query is null', () => {
    const onQuery = vi.fn();
    const { result } = renderHook(() => usePivotQuery({ query: null, onQuery }));
    expect(result.current).toMatchObject({ data: null, loading: false, error: null });
    expect(onQuery).not.toHaveBeenCalled();
  });
});

describe('usePivotQuery — basic fetch', () => {
  it('calls onQuery and resolves to data', async () => {
    const onQuery = vi.fn().mockResolvedValue(RESULT);
    const { result } = renderHook(() => usePivotQuery({ query: Q1, onQuery }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(RESULT));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery.mock.calls[0]![0]).toBe(Q1);
    expect(onQuery.mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it('surfaces error on failure', async () => {
    const err = new Error('boom');
    const onQuery = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => usePivotQuery({ query: Q1, onQuery }));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toMatch(/boom/);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});

describe('usePivotQuery — L0 cache (cacheTtlMs)', () => {
  /**
   * 注意：useEffect 仅在 query 变化时重跑，缓存命中检查发生在 effect 内。
   * 因此真正能验证缓存的场景是 Q1→Q2→Q1：第二次回到 Q1 时 effect 重跑、若 TTL 内则命中缓存。
   * （单纯 rerender({q:Q1, q:Q1}) 因为 deps 不变 effect 不会重跑，不能体现缓存逻辑。）
   */
  it('hits cache when revisiting a recent query (Q1→Q2→Q1 within TTL)', async () => {
    const onQuery = vi.fn().mockResolvedValue(RESULT);
    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, cacheTtlMs: 30_000 }),
      { initialProps: { q: Q1 } },
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    rerender({ q: Q1 });
    // 缓存命中 → data 同步切回 Q1 的 RESULT;不会新增 onQuery 调用
    await waitFor(() => expect(result.current.data).toBe(RESULT));
    expect(onQuery).toHaveBeenCalledTimes(2); // Q1 命中缓存,无新增
  });

  it('refetches after TTL expires (Q1→Q2→time>TTL→Q1)', async () => {
    const onQuery = vi.fn().mockResolvedValue(RESULT);
    const { rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, cacheTtlMs: 30_000 }),
      { initialProps: { q: Q1 } },
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));

    act(() => {
      vi.setSystemTime(Date.now() + 31_000);
    });
    rerender({ q: Q1 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(3));
  });

  it('disables cache when cacheTtlMs=0 (Q1→Q2→Q1 → 3 calls, UNCACHE)', async () => {
    const onQuery = vi.fn().mockResolvedValue(RESULT);
    const { rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, cacheTtlMs: 0 }),
      { initialProps: { q: Q1 } },
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    rerender({ q: Q1 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(3));
  });
});

describe('usePivotQuery — cancel inflight (ADR-011)', () => {
  it('aborts previous AbortSignal when query changes mid-flight', async () => {
    const cancelSpy = vi.fn();
    let resolveSecond: (v: CellSet) => void;
    const onQuery = vi.fn().mockImplementation((_q, ctx) => {
      ctx.signal.addEventListener('abort', cancelSpy);
      if (_q === Q1) {
        return new Promise(() => {});
      }
      return new Promise<CellSet>((res) => {
        resolveSecond = res;
      });
    });

    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery }),
      { initialProps: { q: Q1 } },
    );
    rerender({ q: Q2 });
    expect(cancelSpy).toHaveBeenCalled();

    act(() => resolveSecond(RESULT));
    await waitFor(() => expect(result.current.data).toBe(RESULT));
  });

  it('ignores resolution from stale (already-aborted) onQuery call', async () => {
    let resolveFirst!: (v: CellSet) => void;
    const onQuery = vi.fn().mockImplementation((q) => {
      if (q === Q1) {
        return new Promise<CellSet>((res) => {
          resolveFirst = res;
        });
      }
      return Promise.resolve(RESULT2);
    });

    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery }),
      { initialProps: { q: Q1 } },
    );
    rerender({ q: Q2 });
    await waitFor(() => expect(result.current.data).toBe(RESULT2));

    // Q1 现在 resolve；不应覆盖最新结果
    act(() => resolveFirst(RESULT));
    await Promise.resolve();
    expect(result.current.data).toBe(RESULT2);
  });
});

describe('usePivotQuery — failure circuit-breaker', () => {
  it('stops calling onQuery after maxFailures consecutive failures', async () => {
    const onQuery = vi.fn().mockRejectedValue(new Error('boom'));
    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, maxFailures: 3 }),
      { initialProps: { q: Q1 } },
    );

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    rerender({ q: Q3 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(3));

    // 第 4 次：被熔断，不调 onQuery
    rerender({ q: Q4 });
    await waitFor(() => expect(result.current.error?.message).toMatch(/操作过快/));
    expect(onQuery).toHaveBeenCalledTimes(3);
  });

  it('resets failure counter on success', async () => {
    const onQuery = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(RESULT)         // 第 3 次成功 → 重置计数
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, maxFailures: 3, cacheTtlMs: 0 }),
      { initialProps: { q: Q1 } },
    );

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    rerender({ q: Q3 });
    await waitFor(() => expect(result.current.data).toBe(RESULT));

    // 计数被重置；下面再连续 3 次失败才会熔断
    rerender({ q: Q4 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(4));
  });
});

describe('usePivotQuery — refetch', () => {
  it('refetch() bypasses cache and re-issues the query', async () => {
    const onQuery = vi.fn().mockResolvedValue(RESULT);
    const { result } = renderHook(() => usePivotQuery({ query: Q1, onQuery, cacheTtlMs: 30_000 }));

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
  });

  it('refetch() resets failure counter (un-pauses circuit breaker)', async () => {
    const onQuery = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockResolvedValueOnce(RESULT);

    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, maxFailures: 3, cacheTtlMs: 0 }),
      { initialProps: { q: Q1 } },
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    rerender({ q: Q2 });
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    rerender({ q: Q3 });
    await waitFor(() => expect(result.current.error?.message).toMatch(/3|操作过快/));
    // 此时熔断已激活
    expect(onQuery).toHaveBeenCalledTimes(3);

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe(RESULT));
    expect(onQuery).toHaveBeenCalledTimes(4);
  });
});
