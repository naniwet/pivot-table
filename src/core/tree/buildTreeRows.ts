/**
 * buildTreeRows — branch cache + expanded 集合 → TreeRenderer 渲染序列
 *
 * 输入:
 *   - rootKey="root" 在 branches 里取得 root branch
 *   - expanded:已展开的 path key 集合
 *   - maxDepth:viewConfig.rows.length(用于判断"叶子层不能再展开")
 *
 * 输出:扁平序列(parent / leaf 混合,顺序保留),给 TreeRenderer 直接 map 渲染。
 *
 * 关键不变量:
 *   I1. 每行的 depth = path.length-1
 *   I2. 父展开 → 在父行下面紧跟 children;父折叠 → 仅父行,children 不渲染
 *   I3. 父展开 + branch loading → 紧跟 placeholder 行(loading)
 *   I4. 父展开 + branch error → 紧跟 placeholder 行(error,带 retry)
 *   I5. 折叠后再展开:cache 命中秒出
 */

import { pathKey } from './buildBranchQuery.js';
import type { BranchEntry, BranchRow, TreePathKey } from '../../types/tree.js';

export type TreeRenderItem =
  | {
      kind: 'row';
      pathKey: TreePathKey;
      fullPath: string[];
      depth: number;
      row: BranchRow;
      hasChildren: boolean;
      expanded: boolean;
    }
  | {
      kind: 'placeholder';
      /** 该 placeholder 占位指向哪个 path(loading 或 error 状态) */
      pathKey: TreePathKey;
      forParentPath: string[];
      depth: number;
      state: 'loading' | 'error';
      error?: Error;
    };

export interface BuildTreeRowsInput {
  branches: ReadonlyMap<TreePathKey, BranchEntry>;
  expanded: ReadonlySet<TreePathKey>;
  /** viewConfig.rows.length(树最大深度;到这层就不能再展开)*/
  maxDepth: number;
}

export function buildTreeRows(input: BuildTreeRowsInput): TreeRenderItem[] {
  const { branches, expanded, maxDepth } = input;
  const out: TreeRenderItem[] = [];

  function walk(parentPath: string[]): void {
    const k = pathKey(parentPath);
    const branch = branches.get(k);
    if (!branch) {
      // root 还没起查 / 或某 expanded path 还没起 — 渲染 loading placeholder
      out.push({
        kind: 'placeholder',
        pathKey: k,
        forParentPath: parentPath,
        depth: parentPath.length,
        state: 'loading',
      });
      return;
    }
    if (branch.status === 'loading') {
      out.push({
        kind: 'placeholder',
        pathKey: k,
        forParentPath: parentPath,
        depth: parentPath.length,
        state: 'loading',
      });
      return;
    }
    if (branch.status === 'error') {
      out.push({
        kind: 'placeholder',
        pathKey: k,
        forParentPath: parentPath,
        depth: parentPath.length,
        state: 'error',
        error: branch.error,
      });
      return;
    }

    // success — emit each row,递归展开 expanded 的 children
    for (const row of branch.rows) {
      const childPath = [...parentPath, row.member.name];
      const childKey = pathKey(childPath);
      const isLeafLevel = childPath.length >= maxDepth;
      const hasChildren = !isLeafLevel;
      const isExpanded = hasChildren && expanded.has(childKey);
      out.push({
        kind: 'row',
        pathKey: childKey,
        fullPath: childPath,
        depth: childPath.length - 1,
        row,
        hasChildren,
        expanded: isExpanded,
      });
      if (isExpanded) {
        walk(childPath);
      }
    }
  }

  walk([]);
  return out;
}
