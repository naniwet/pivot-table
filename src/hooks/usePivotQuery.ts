/**
 * usePivotQuery — 拉取 + L0 缓存 + ADR-011 取消 + 连续失败保险丝
 *
 * 接口（与 p0-dev §3.5 对齐，1 处简化：cacheType→cacheTtlMs，详见 .test.ts 文件头）：
 *   usePivotQuery({ query, onQuery, cacheTtlMs?, maxFailures? })
 *     → { data, loading, error, refetch }
 *
 * 设计要点：
 *   - 缓存 key = JSON.stringify(query)（QueryBuilder 输出顺序稳定，足够）
 *   - cacheTtlMs > 0 才启用 L0；cacheTtlMs = 0 等价 UNCACHE
 *   - refetch 等价 CLEAR：清缓存 + 失败计数清零 + 触发 effect 重跑
 *   - inflight 取消：每次新 effect 起一个 AbortController；旧 controller 在 cleanup 中 abort
 *   - 双层防陈旧结果：requestId 比对 + signal.aborted 检查
 *
 * 不做（P0）：
 *   - L1 翻页缓存（同 viewConfig 不同 page）— 优化项，按需加
 *   - 重试退避 — 失败直接报错，refetch 给手动重试出口
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CellSet } from '../types/cellSet.js';
import type { Query } from '../types/query.js';

const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_MAX_FAILURES = 3;
const CIRCUIT_BREAK_MESSAGE = '操作过快，已暂停查询；点击重试可恢复';

export interface UsePivotQueryOptions {
  query: Query | null;
  onQuery: (query: Query, ctx: { signal: AbortSignal }) => Promise<CellSet>;
  /** L0 缓存 TTL；0 = 不缓存。默认 30000ms */
  cacheTtlMs?: number;
  /** 连续失败上限；超过则后续 query 直接熔断。默认 3 */
  maxFailures?: number;
}

export interface UsePivotQueryResult {
  data: CellSet | null;
  loading: boolean;
  error: Error | null;
  /** 等价 CLEAR：清缓存 + 重置失败计数 + 重新发起 */
  refetch: () => void;
}

interface CacheEntry {
  data: CellSet;
  storedAt: number;
}

function queryKey(q: Query): string {
  return JSON.stringify(q);
}

export function usePivotQuery(options: UsePivotQueryOptions): UsePivotQueryResult {
  const {
    query,
    onQuery,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    maxFailures = DEFAULT_MAX_FAILURES,
  } = options;

  const [data, setData] = useState<CellSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const failureCountRef = useRef(0);
  const [refetchToken, setRefetchToken] = useState(0);

  const refetch = useCallback(() => {
    cacheRef.current.clear();
    failureCountRef.current = 0;
    setRefetchToken((t) => t + 1);
  }, []);

  const key = query ? queryKey(query) : null;

  useEffect(() => {
    if (!query || !key) {
      // null query → 回到 idle，不清 data（保留旧值便于切换时仍能展示）
      setLoading(false);
      setError(null);
      return;
    }

    // 失败熔断：直接报错，不发请求
    if (failureCountRef.current >= maxFailures) {
      setError(new Error(CIRCUIT_BREAK_MESSAGE));
      setLoading(false);
      return;
    }

    // L0 命中
    if (cacheTtlMs > 0) {
      const cached = cacheRef.current.get(key);
      if (cached && Date.now() - cached.storedAt <= cacheTtlMs) {
        setData(cached.data);
        setLoading(false);
        setError(null);
        return;
      }
    }

    // 取消旧 inflight
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    const myId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    onQuery(query, { signal: controller.signal })
      .then((result) => {
        if (myId !== requestIdRef.current) return; // 有更新的请求
        if (controller.signal.aborted) return;
        if (cacheTtlMs > 0) {
          cacheRef.current.set(key, { data: result, storedAt: Date.now() });
        }
        failureCountRef.current = 0;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (myId !== requestIdRef.current) return;
        if (controller.signal.aborted) return;
        failureCountRef.current += 1;
        const errorToShow =
          failureCountRef.current >= maxFailures
            ? new Error(CIRCUIT_BREAK_MESSAGE)
            : err instanceof Error
              ? err
              : new Error(String(err));
        setError(errorToShow);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [key, query, onQuery, cacheTtlMs, maxFailures, refetchToken]);

  return { data, loading, error, refetch };
}
