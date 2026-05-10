/**
 * useScrollPivotQuery — 触底加载 / 行累积模式专用 hook
 *
 * 行为契约:
 *   - query=null → idle,不 fetch
 *   - query 非空 → 自动从 page 1 fetch,设 data
 *   - loadMore() → 触发下一页 fetch,新行 append 到累积 cellSet
 *   - stableKey 变化(query 任何字段除 rowPageNo)→ 累积清空 + 从 page 1 重 fetch
 *   - rowPageNo 变化(只有 rowPageNo)→ 不应触发重置(scroll 模式 hook 自己管 page,
 *     query.pageSettings.rowPageNo 在 stableKey 中被剥离)
 *   - hasMore = 累积行数 < totalRowCount
 *   - refetch() → 清累积 + 从 page 1 重 fetch
 *
 * 接口:
 *   useScrollPivotQuery({ query, onQuery })
 *     → { data, loading, error, refetch, hasMore, loadMore }
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CellSet, Member } from '../types/cellSet.js';
import type { Query } from '../types/query.js';

import { useScrollPivotQuery } from './useScrollPivotQuery.js';

// —— 极简 fixtures ——
function makeQuery(modelId: string, rowPageNo = 1): Query {
  return {
    modelId,
    queryType: 'PivotQuery',
    engineType: 'MDX',
    pageSettings: { rowPageNo, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
  } as unknown as Query;
}

// 帮造 cellSet:rows = 给定的 member 数组,data = 每行一个 value(同一列)
function makeCellSet(rowNames: string[], total: number): CellSet {
  const rows: Member[][] = rowNames.map((n) => [
    {
      name: n,
      uniqueName: [n],
      level: 'L',
      dimension: 'D',
      fieldName: 'F',
    } as Member,
  ]);
  return {
    rowFields: [{ name: 'F', define: { _enum: 'LevelField' } as never, fieldNames: ['F'] }],
    columnFields: [],
    columnMetadataArray: [],
    rows,
    columns: [],
    data: rowNames.map((_, i) => ({ row: i, column: 0, value: i, formattedValue: `${i}` })),
    fieldNameToUniqueId: {},
    totalRowCount: total,
  };
}

describe('useScrollPivotQuery — idle / null query', () => {
  it('query=null → idle(不 fetch,data null)', () => {
    const onQuery = vi.fn();
    const { result } = renderHook(() => useScrollPivotQuery({ query: null, onQuery }));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(onQuery).not.toHaveBeenCalled();
  });
});

describe('useScrollPivotQuery — 首次 fetch + 累积', () => {
  it('query 非空 → fetch page 1,data 是 page1 cellSet', async () => {
    const cs1 = makeCellSet(['a', 'b'], 5);
    const onQuery = vi.fn().mockResolvedValue(cs1);

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.rows).toHaveLength(2);
    expect(result.current.hasMore).toBe(true); // 2 < 5
    expect(onQuery).toHaveBeenCalledTimes(1);
    // 第一次 fetch 的 query 中 rowPageNo 应为 1
    const fetched = onQuery.mock.calls[0]![0] as Query;
    expect(fetched.pageSettings.rowPageNo).toBe(1);
  });

  it('loadMore → fetch page 2 + 行累积(rows 拼接,data 行号 offset)', async () => {
    const cs1 = makeCellSet(['a', 'b'], 5);
    const cs2 = makeCellSet(['c', 'd'], 5);
    const onQuery = vi
      .fn<[Query, { signal: AbortSignal }], Promise<CellSet>>()
      .mockImplementation(async (q) => (q.pageSettings.rowPageNo === 1 ? cs1 : cs2));

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));

    // 累积 cellSet:rows = a,b,c,d
    expect(result.current.data!.rows.map((r) => r[0]!.name)).toEqual(['a', 'b', 'c', 'd']);
    // page2 的 data 行号要 offset(原本 0,1 → 2,3)
    const dataRows = result.current.data!.data.map((d) => d.row);
    expect(dataRows).toEqual([0, 1, 2, 3]);
    expect(result.current.hasMore).toBe(true); // 4 < 5
  });

  it('累积到 totalRowCount → hasMore=false', async () => {
    const cs1 = makeCellSet(['a', 'b'], 4);
    const cs2 = makeCellSet(['c', 'd'], 4);
    const onQuery = vi
      .fn<[Query, { signal: AbortSignal }], Promise<CellSet>>()
      .mockImplementation(async (q) => (q.pageSettings.rowPageNo === 1 ? cs1 : cs2));

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useScrollPivotQuery — 并发 / 防抖', () => {
  it('loading 中 loadMore → noop(不重复 fetch)', async () => {
    const cs1 = makeCellSet(['a', 'b'], 10);
    const cs2 = makeCellSet(['c', 'd'], 10);
    let resolvePage2: ((cs: CellSet) => void) | null = null;
    const onQuery = vi.fn<[Query, { signal: AbortSignal }], Promise<CellSet>>().mockImplementation(
      async (q) => {
        if (q.pageSettings.rowPageNo === 1) return cs1;
        // page 2 慢慢 resolve,中间多次 loadMore 不应起新请求
        return new Promise<CellSet>((res) => {
          resolvePage2 = res;
        });
      },
    );

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    act(() => result.current.loadMore()); // 起 page 2
    expect(result.current.loading).toBe(true);
    act(() => result.current.loadMore()); // loading 中,应被忽略
    act(() => result.current.loadMore()); // 同上
    // 触发 page 2 完成
    act(() => resolvePage2!(cs2));
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));
    // onQuery 应只被调 2 次(page1 + page2),不重复
    expect(onQuery).toHaveBeenCalledTimes(2);
  });

  it('hasMore=false 时 loadMore → noop', async () => {
    const cs1 = makeCellSet(['a', 'b'], 2); // total = rows = 2,无更多
    const onQuery = vi.fn().mockResolvedValue(cs1);

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    act(() => result.current.loadMore());
    // 给点时间确认没有新 fetch 发出
    await new Promise((r) => setTimeout(r, 10));
    expect(onQuery).toHaveBeenCalledTimes(1);
  });
});

describe('useScrollPivotQuery — 重置语义', () => {
  it('query 变(modelId 不同)→ 累积清空 + 从 page 1 重 fetch', async () => {
    const cs1 = makeCellSet(['a', 'b'], 4);
    const cs2 = makeCellSet(['c', 'd'], 4);
    const cs3 = makeCellSet(['x', 'y'], 6);
    const onQuery = vi
      .fn<[Query, { signal: AbortSignal }], Promise<CellSet>>()
      .mockImplementation(async (q) => {
        if (q.modelId === 'm1') return q.pageSettings.rowPageNo === 1 ? cs1 : cs2;
        return cs3;
      });

    const { result, rerender } = renderHook(
      ({ q }: { q: Query }) => useScrollPivotQuery({ query: q, onQuery }),
      { initialProps: { q: makeQuery('m1') } },
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));

    // 切到不同的 query → 清累积,重新 fetch page 1
    rerender({ q: makeQuery('m2') });
    await waitFor(() =>
      expect(result.current.data?.rows.map((r) => r[0]!.name)).toEqual(['x', 'y']),
    );
    expect(result.current.hasMore).toBe(true); // 2 < 6
  });

  it('rowPageNo 在 query 中变 → 不应触发重置(scroll 模式 hook 自管 pageNo)', async () => {
    const cs1 = makeCellSet(['a', 'b'], 4);
    const cs2 = makeCellSet(['c', 'd'], 4);
    const onQuery = vi
      .fn<[Query, { signal: AbortSignal }], Promise<CellSet>>()
      .mockImplementation(async (q) => (q.pageSettings.rowPageNo === 1 ? cs1 : cs2));

    const { result, rerender } = renderHook(
      ({ q }: { q: Query }) => useScrollPivotQuery({ query: q, onQuery }),
      { initialProps: { q: makeQuery('m1', 1) } },
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));

    // 模拟用户在(隐藏的)分页器里改了 rowPageNo —— 应被 hook 忽略,累积保留
    const callsBefore = onQuery.mock.calls.length;
    rerender({ q: makeQuery('m1', 5) });
    await new Promise((r) => setTimeout(r, 10));
    expect(onQuery.mock.calls.length).toBe(callsBefore); // 没新 fetch
    expect(result.current.data?.rows).toHaveLength(4); // 累积保留
  });

  it('refetch → 清累积 + 从 page 1 重 fetch', async () => {
    const cs1 = makeCellSet(['a', 'b'], 4);
    const cs2 = makeCellSet(['c', 'd'], 4);
    const onQuery = vi
      .fn<[Query, { signal: AbortSignal }], Promise<CellSet>>()
      .mockImplementation(async (q) => (q.pageSettings.rowPageNo === 1 ? cs1 : cs2));

    const { result } = renderHook(() =>
      useScrollPivotQuery({ query: makeQuery('m1'), onQuery }),
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));

    act(() => result.current.refetch());
    // refetch 重新跑 page 1 → rows 回到 2
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
  });
});
