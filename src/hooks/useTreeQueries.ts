/**
 * useTreeQueries — 树状模式的多分支查询编排(P5 Phase 2)
 *
 * 设计跟 usePivotQuery 完全独立 — 树状模式自带 cache + abort + 失败处理。
 *
 * 数据流:
 *   1. expanded set 变化 → 算出"需要查的 path 列表"(root + 每个展开的 parent)
 *   2. 对每个 path:cache 命中 → 跳过;cache miss → fire branch query
 *   3. 每个 branch 都有自己的 AbortController:
 *      - 父级折叠 → 不主动 abort(保留 cache,再展开秒出)
 *      - viewConfig 变化 → 全部 abort + 清 cache + 重新 fire root + expanded
 *      - 组件 unmount → 全部 abort
 *   4. 错误:branch.status='error',渲染层显示 retry 按钮(retryBranch helper)
 *
 * 不变量:
 *   I1. branches 是不可变 Map(每次 setState 替换新引用)
 *   I2. 同一 path key 同时只有一个 in-flight controller
 *   I3. viewConfig 变化(除 pageState 以外的部分)→ cache 完全失效
 *   I4. emptyValueText / freezeHeader 等纯渲染选项变化 → 不重发查询
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parseCellSet } from '../core/cellSetParser/parseCellSet.js';
import { buildBranchQuery, pathFromKey, pathKey } from '../core/tree/buildBranchQuery.js';
import type { CellSet } from '../types/cellSet.js';
import type { Metadata } from '../types/metadata.js';
import type { Query } from '../types/query.js';
import type { RenderModel } from '../types/renderModel.js';
import type { BranchEntry, BranchRow, TreePathKey } from '../types/tree.js';
import type { ViewConfig } from '../types/viewConfig.js';

export interface UseTreeQueriesOptions {
  viewConfig: ViewConfig;
  metadata: Metadata;
  onQuery: (query: Query, ctx: { signal: AbortSignal }) => Promise<CellSet>;
  /** 当前展开的 path key 集合(由 PivotTable 持有) */
  expanded: ReadonlySet<TreePathKey>;
  /** false 时 hook 完全不发查询(切回 table 模式时用) */
  enabled?: boolean;
}

export interface UseTreeQueriesResult {
  branches: ReadonlyMap<TreePathKey, BranchEntry>;
  /** 全局刷新 — 清 cache + 重发 root + 所有 expanded */
  refetch: () => void;
  /** 针对单个 branch 重试(错误恢复用) */
  retryBranch: (key: TreePathKey) => void;
}

/**
 * viewConfig 影响查询的部分(不含纯渲染选项)的稳定 key。
 * 改这部分 → 全部 cache 失效 + abort 所有 in-flight。
 *
 * 关键优化:customFields 只算"被 row/col/value 引用的子集"。
 * 用户新建一个还没拖到任何 zone 的自建字段(常见于打开"+ 分组"流程时)→
 * vcKey 不变 → tree cache 不清 → in-flight branch 不被 abort →
 * 后端不会看到 partial request 引发的 "Required request body is missing" 噪音。
 */
function vcQueryKey(vc: ViewConfig): string {
  const usedIds = new Set<string>();
  for (const r of vc.rows) usedIds.add(r.fieldName);
  for (const c of vc.columns) usedIds.add(c.fieldName);
  for (const v of vc.values) usedIds.add(v.measureName);
  const usedCustomFields = vc.customFields.filter((cf) => usedIds.has(cf.id));
  return JSON.stringify({
    rows: vc.rows,
    columns: vc.columns,
    values: vc.values,
    filters: vc.filters,
    measureFilters: vc.measureFilters,
    rowSorts: vc.rowSorts,
    columnSorts: vc.columnSorts,
    customFields: usedCustomFields,
    page: {
      compressEmptyRows: vc.pageState.compressEmptyRows,
      compressEmptyColumns: vc.pageState.compressEmptyColumns,
      showGrandTotal: vc.pageState.showGrandTotal,
      subTotalAtEnd: vc.pageState.subTotalAtEnd,
    },
  });
}

export function useTreeQueries(opts: UseTreeQueriesOptions): UseTreeQueriesResult {
  const { viewConfig, metadata, onQuery, expanded, enabled = true } = opts;
  const [branches, setBranches] = useState<Map<TreePathKey, BranchEntry>>(new Map());
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  const vcKey = useMemo(() => vcQueryKey(viewConfig), [viewConfig]);
  const vcKeyRef = useRef<string>(vcKey);
  const [refetchTok, setRefetchTok] = useState(0);

  /** 不可变 Map 更新 helper */
  const setBranch = useCallback((k: TreePathKey, entry: BranchEntry | null) => {
    setBranches((prev) => {
      const next = new Map(prev);
      if (entry) next.set(k, entry);
      else next.delete(k);
      return next;
    });
  }, []);

  /** abort 所有 in-flight controller */
  const abortAllInflight = useCallback(() => {
    for (const [, entry] of branchesRef.current) {
      if (entry.status === 'loading') entry.controller.abort();
    }
  }, []);

  /**
   * 针对一个 path 起 query。如果该 path 已 success/loading → 跳过。
   * 错误状态会被覆盖为 loading(用作 retry 入口)。
   */
  const fetchBranch = useCallback(
    (path: ReadonlyArray<string>, force = false) => {
      const k = pathKey(path);
      const existing = branchesRef.current.get(k);
      if (!force && existing) {
        if (existing.status === 'success' || existing.status === 'loading') return;
      }

      let query: Query;
      try {
        query = buildBranchQuery({ viewConfig, metadata, parentPath: path });
      } catch (err) {
        setBranch(k, {
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return;
      }

      const controller = new AbortController();
      setBranch(k, { status: 'loading', controller });

      onQuery(query, { signal: controller.signal })
        .then((cellSet) => {
          if (controller.signal.aborted) return;
          let renderModel: RenderModel;
          try {
            renderModel = parseCellSet(cellSet, viewConfig, metadata);
          } catch (err) {
            setBranch(k, {
              status: 'error',
              error: err instanceof Error ? err : new Error(String(err)),
            });
            return;
          }
          const rows: BranchRow[] = renderModel.rowHeader.map((rn, idx) => ({
            member: rn.member,
            fullPath: [...path, rn.member.name],
            cells: renderModel.matrix[idx] ?? [],
          }));
          setBranch(k, {
            status: 'success',
            rows,
            columnHeader: renderModel.columnHeader,
            columnHeaderLevels: renderModel.columnHeaderLevels,
            cellSet,
            renderModel,
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setBranch(k, {
            status: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
    },
    [viewConfig, metadata, onQuery, setBranch],
  );

  // viewConfig 影响查询的部分变化 → 整个 cache 失效
  useEffect(() => {
    if (vcKeyRef.current !== vcKey) {
      abortAllInflight();
      setBranches(new Map());
      vcKeyRef.current = vcKey;
    }
    // 注:第一次 mount 时 vcKeyRef.current === vcKey(初始化时同),不触发清空
  }, [vcKey, abortAllInflight]);

  // root + expanded 加载;enabled=false 不发查询,切回 table 模式时安静
  useEffect(() => {
    if (!enabled) return;
    if (viewConfig.rows.length === 0) return;
    if (viewConfig.values.length === 0) return; // 没度量 → 没意义

    fetchBranch([]);
    for (const k of expanded) {
      const path = pathFromKey(k);
      // 只查"还有更深一层可拉"的 path
      if (path.length < viewConfig.rows.length) {
        fetchBranch(path);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, expanded, vcKey, refetchTok]);

  // unmount 全部 abort
  useEffect(() => {
    return () => {
      for (const [, entry] of branchesRef.current) {
        if (entry.status === 'loading') entry.controller.abort();
      }
    };
  }, []);

  const refetch = useCallback(() => {
    abortAllInflight();
    setBranches(new Map());
    setRefetchTok((t) => t + 1);
  }, [abortAllInflight]);

  const retryBranch = useCallback(
    (k: TreePathKey) => {
      fetchBranch(pathFromKey(k), true);
    },
    [fetchBranch],
  );

  return { branches, refetch, retryBranch };
}
