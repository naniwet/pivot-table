/**
 * useScrollPivotQuery — 滚动加载(行累积)模式专用查询 hook
 *
 * 范围:
 *   - 仅服务于 paginationMode='scroll' 场景;PivotTable 在 paged 模式仍走 usePivotQuery
 *   - 内部维护 scrollPageNo + 多页 cellSet 累积,自动从 page 1 fetch,loadMore() 加下一页
 *   - 通过"stable key"(query 排除 rowPageNo)检测 query 真变化:rows/cols/values/filters/sorts
 *     /pageSize 等任一变化 → 累积清空 + 重 fetch page 1;**只 rowPageNo 变不会触发重置**
 *     (scroll 模式下 query.pageSettings.rowPageNo 由 hook 自管,宿主传入的值被忽略)
 *   - hasMore = 累积行数 < cellSet.totalRowCount(server 返回的服务端总行数)
 *
 * 设计:
 *   - 跟 usePivotQuery 不共用代码:语义差异较大(累积 vs 单页),硬抽公共部分会让两边都难懂
 *   - 跟 usePivotQuery 协作策略:PivotTable 始终调用两个 hook,只给"激活"的那个传非 null query
 *     另一个收到 query=null 自动 idle,无副作用
 *   - mergeCellSets:多页合并时 rows 拼接 + data 行号 offset(每页 data.row 是 0-based 相对该页;
 *     合并后必须重映射为全局行号)
 *
 * Trade-off / 反悔成本:
 *   - 没引入 L0 cache 和 circuit breaker(usePivotQuery 有)。scroll 模式下:
 *     · 同一 query 同一 pageNo 不会重复触发(stableKey + scrollPageNo 不变就不 fetch)
 *     · 失败暂时直接报错,用户可改 viewConfig 重新进入新 stableKey 触发重 fetch,够用
 *   - 真要加 cache/熔断时,跟 usePivotQuery 一起重构成 useQueryCore,目前不做
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CellSet } from '../types/cellSet.js';
import type { Query } from '../types/query.js';

export interface UseScrollPivotQueryOptions {
  query: Query | null;
  onQuery: (query: Query, ctx: { signal: AbortSignal }) => Promise<CellSet>;
}

export interface UseScrollPivotQueryResult {
  data: CellSet | null;
  loading: boolean;
  error: Error | null;
  /** 清累积 + 从 page 1 重新 fetch */
  refetch: () => void;
  /** 是否还有下一页可加载(累积行数 < totalRowCount) */
  hasMore: boolean;
  /** 触发下一页 fetch + 累积。loading 中 / hasMore=false 时为 noop */
  loadMore: () => void;
}

/**
 * stable key:query 中除 rowPageNo 之外的任何字段变化都进入此 key。
 * key 变 → 累积重置;不变 → 累积保留。
 */
function computeStableKey(query: Query | null): string {
  if (!query) return '';
  const { pageSettings, ...rest } = query;
  const { rowPageNo: _ignored, ...restPageState } = pageSettings;
  return JSON.stringify({ ...rest, pageSettings: restPageState });
}

/**
 * 多页 cellSet 合并 — rows 拼接,data 行号 offset 重映射,columns/fields 取首页(各页应一致)。
 * totalRowCount 取最新一页(理论上各页相同;若服务端动态变 取最新更准)。
 */
function mergeCellSets(pages: CellSet[]): CellSet {
  if (pages.length === 0) {
    throw new Error('mergeCellSets: empty pages array');
  }
  if (pages.length === 1) return pages[0]!;

  const first = pages[0]!;
  const allRows: CellSet['rows'] = [];
  const allData: CellSet['data'] = [];
  let totalRowCount = first.totalRowCount;
  let rowOffset = 0;

  for (const page of pages) {
    for (const r of page.rows) allRows.push(r);
    for (const d of page.data) allData.push({ ...d, row: d.row + rowOffset });
    rowOffset += page.rows.length;
    totalRowCount = page.totalRowCount;
  }

  return {
    ...first,
    rows: allRows,
    data: allData,
    totalRowCount,
  };
}

export function useScrollPivotQuery(
  options: UseScrollPivotQueryOptions,
): UseScrollPivotQueryResult {
  const { query, onQuery } = options;

  const [pages, setPages] = useState<CellSet[]>([]);
  const [scrollPageNo, setScrollPageNo] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);

  // inflight 取消:每次新 effect 起 controller,旧的 abort
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const stableKey = useMemo(() => computeStableKey(query), [query]);

  // stableKey 变 → 重置累积 + scrollPageNo 回到 1
  // 注意:scrollPageNo 重置后,下面 fetch effect 会因 scrollPageNo 变化(若曾 > 1)而再次触发
  // 即使没变化(都是 1),stableKey 这条依赖也会触发 fetch
  useEffect(() => {
    setPages([]);
    setScrollPageNo(1);
  }, [stableKey]);

  // Fetch effect:stableKey / scrollPageNo / refetchToken 任一变 → 起新 fetch
  useEffect(() => {
    if (!query) {
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myId = ++requestIdRef.current;

    const queryToFetch: Query = {
      ...query,
      pageSettings: { ...query.pageSettings, rowPageNo: scrollPageNo },
    };

    setLoading(true);
    setError(null);

    onQuery(queryToFetch, { signal: controller.signal })
      .then((cs) => {
        if (myId !== requestIdRef.current || controller.signal.aborted) return;
        setPages((prev) => {
          // page 1 → 替换(初次 fetch 或重置后的首页);其它 → append
          if (scrollPageNo === 1) return [cs];
          return [...prev, cs];
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (myId !== requestIdRef.current || controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
    // onQuery 是回调,不放进 deps 避免每次 re-render 都重 fetch(usePivotQuery 同模式)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey, scrollPageNo, refetchToken]);

  const data = useMemo<CellSet | null>(() => {
    if (pages.length === 0) return null;
    return mergeCellSets(pages);
  }, [pages]);

  const loadedRows = data?.rows.length ?? 0;
  const totalRows = data?.totalRowCount ?? 0;
  const hasMore = data !== null && loadedRows < totalRows;

  const refetch = useCallback(() => {
    setPages([]);
    setScrollPageNo(1);
    setRefetchToken((t) => t + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setScrollPageNo((p) => p + 1);
  }, [loading, hasMore]);

  return { data, loading, error, refetch, hasMore, loadMore };
}
