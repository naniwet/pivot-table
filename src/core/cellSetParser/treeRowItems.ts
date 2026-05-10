/**
 * treeRowItems — 树状行表头展开/折叠的纯函数 helper
 *
 * 把 rowHeader 的扁平 fullPath 列表转成「parent 节点 + leaf 节点」混合的渲染序列。
 *
 * 职责(Unix:做一件事):
 *   - 输入:rowHeader[].fullPath + collapsed prefix 集合
 *   - 输出:渲染序列 TreeRowItem[](parent / leaf,顺序保留)
 *
 * 不做:
 *   - 不持有 React 状态(collapsed set 由 caller 管理)
 *   - 不渲染(纯数据转换)
 *   - 不算 subtotal(parent 行的数据 cells 由 caller 填,通常是空)
 *
 * 算法(逐行扫描,边走边判断 collapsed):
 *   - 对每行 path,从最浅(i=1)到最深(i=path.length-1)依次考虑 prefix:
 *     - 如果 prefix 已 emit 过 → 跳过(不重复 parent)
 *     - 如果 prefix 在 collapsed → 仍要 emit 一次 parent 入口(用户能展开),
 *       然后 break(不再 emit 更深 parent / leaf)
 *     - 否则 emit parent
 *   - 走完所有 prefix 仍未 break → emit leaf(指向原 rowIndex)
 */

import type { RowHeaderNode } from '../../types/renderModel.js';

export type TreeRowItem =
  | {
      kind: 'parent';
      prefix: string[];
      label: string;
      depth: number;
      key: string;
      collapsed: boolean;
    }
  | {
      kind: 'leaf';
      rowIndex: number;
      label: string;
      fullPath: string[];
      depth: number;
      key: string;
    };

const SEP = '​';

function pathKey(prefix: string[]): string {
  return prefix.join(SEP);
}

export function buildTreeRowItems(
  rowHeader: ReadonlyArray<RowHeaderNode>,
  collapsed: ReadonlySet<string>,
): TreeRowItem[] {
  const out: TreeRowItem[] = [];
  const emittedParent = new Set<string>();

  for (let r = 0; r < rowHeader.length; r++) {
    const node = rowHeader[r]!;
    const path = node.fullPath.length > 0 ? node.fullPath : [node.member.name];
    if (path.length === 0) continue;

    let cutoff = false;
    for (let i = 1; i < path.length; i++) {
      const prefix = path.slice(0, i);
      const k = pathKey(prefix);
      const isCollapsed = collapsed.has(k);
      if (!emittedParent.has(k)) {
        emittedParent.add(k);
        out.push({
          kind: 'parent',
          prefix,
          label: prefix[prefix.length - 1] ?? '',
          depth: prefix.length - 1,
          key: k,
          collapsed: isCollapsed,
        });
      }
      if (isCollapsed) {
        cutoff = true;
        break;
      }
    }
    if (cutoff) continue;

    out.push({
      kind: 'leaf',
      rowIndex: r,
      label: path[path.length - 1] ?? '',
      fullPath: path,
      depth: path.length - 1,
      key: pathKey(path),
    });
  }

  return out;
}

export const TREE_PATH_SEPARATOR = SEP;
