/**
 * filterTree — 操作 ClientFilter / ClientMeasureFilter 树的纯函数(P3 树编辑器)
 *
 * 数据视角:viewConfig.filters / measureFilters 是 ClientFilter[](数组),
 * 语义上等价 "隐式根 AND group with children=数组"。
 * 这里的 helper 把它当成树操作(immutable update)。
 *
 * 路径 path: number[] — 从根开始的索引序列;[] 表示根本身。
 *
 * 泛型:L = leaf 类型(MeasureFilter / Extract<ClientFilter, leaf>)。
 * GroupNode shape 通用,helpers 不区分 leaf 内部结构。
 */

/**
 * 任意 group 节点。L 是 leaf 类型(运行时 kind!=='group');
 * 类型上不强约束 L(避免 union 冲突),helpers 用 isGroup duck-typing。
 */
export interface GroupShape<L> {
  kind: 'group';
  op: 'And' | 'Or';
  children: TreeNode<L>[];
}

export type TreeNode<L> = L | GroupShape<L>;

function isGroup<L>(node: TreeNode<L>): node is GroupShape<L> {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { kind?: string }).kind === 'group'
  );
}

/** 通用:在指定路径替换节点(immutable);返回新树 */
export function updateNodeAt<L>(
  tree: TreeNode<L>[],
  path: number[],
  updater: (node: TreeNode<L>) => TreeNode<L>,
): TreeNode<L>[] {
  if (path.length === 0) return tree;
  const [head, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) {
      return updater(node);
    }
    if (!isGroup(node)) return node;
    return {
      ...node,
      children: updateNodeAt(node.children, rest, updater),
    };
  });
}

/** 在指定 group 路径下追加 leaf;[] = 追加到根数组末尾 */
export function addLeaf<L>(
  tree: TreeNode<L>[],
  groupPath: number[],
  leaf: L,
): TreeNode<L>[] {
  if (groupPath.length === 0) {
    return [...tree, leaf];
  }
  return updateNodeAt(tree, groupPath, (node) => {
    if (!isGroup(node)) return node;
    return { ...node, children: [...node.children, leaf] };
  });
}

/**
 * 删除指定路径节点。删除后:
 *   - 父 group 只剩 1 child → 自动降级为该 child(扁平化,降低嵌套深度)
 *   - 父 group 0 child → 留下空 group(交给 UI 层 cleanup;实际场景 UI 不让删到 0)
 *   - 路径为 [] → noop(根不能删自己)
 */
export function removeAt<L>(
  tree: TreeNode<L>[],
  path: number[],
): TreeNode<L>[] {
  if (path.length === 0) return tree;
  if (path.length === 1) {
    return tree.filter((_, i) => i !== path[0]);
  }
  const parentPath = path.slice(0, -1);
  const childIdx = path[path.length - 1]!;
  return updateNodeAt(tree, parentPath, (parent) => {
    if (!isGroup(parent)) return parent;
    const nextChildren = parent.children.filter((_, i) => i !== childIdx);
    if (nextChildren.length === 1) {
      return nextChildren[0]!;
    }
    return { ...parent, children: nextChildren };
  });
}

/** 切换某 group 的 op(And ↔ Or);路径为 [] 或目标不是 group → noop */
export function setGroupOp<L>(
  tree: TreeNode<L>[],
  groupPath: number[],
  op: 'And' | 'Or',
): TreeNode<L>[] {
  if (groupPath.length === 0) return tree;
  return updateNodeAt(tree, groupPath, (node) => {
    if (!isGroup(node)) return node;
    if (node.op === op) return node;
    return { ...node, op };
  });
}

/** 把指定 leaf 升格为 group;原 leaf 成为 group 的唯一 child */
export function wrapLeafInGroup<L>(
  tree: TreeNode<L>[],
  leafPath: number[],
  op: 'And' | 'Or',
): TreeNode<L>[] {
  if (leafPath.length === 0) return tree;
  let changed = false;
  const next = updateNodeAt(tree, leafPath, (node) => {
    if (isGroup(node)) return node;
    changed = true;
    return { kind: 'group', op, children: [node] };
  });
  return changed ? next : tree;
}

// ─── moveNode 内部 helpers ─────────────────────────────────────────────────────

/** a 是 b 的前缀(或相等)— 用于判"to 在 from 内部" */
function isPathPrefixOrEqual(a: number[], b: number[]): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 取节点(找不到返回 undefined) */
function getNodeAt<L>(
  tree: TreeNode<L>[],
  path: number[],
): TreeNode<L> | undefined {
  if (path.length === 0) return undefined;
  let cur: TreeNode<L> | undefined = tree[path[0]!];
  for (let i = 1; i < path.length; i++) {
    if (cur === undefined || !isGroup(cur)) return undefined;
    cur = cur.children[path[i]!];
  }
  return cur;
}

/** 不触发 unwrap 的删除 — moveNode 用,避免删除时改变 toGroupPath 索引语义 */
function removeAtNoUnwrap<L>(
  tree: TreeNode<L>[],
  path: number[],
): TreeNode<L>[] {
  if (path.length === 0) return tree;
  if (path.length === 1) {
    return tree.filter((_, i) => i !== path[0]);
  }
  const parentPath = path.slice(0, -1);
  const childIdx = path[path.length - 1]!;
  return updateNodeAt(tree, parentPath, (parent) => {
    if (!isGroup(parent)) return parent;
    return {
      ...parent,
      children: parent.children.filter((_, i) => i !== childIdx),
    };
  });
}

/** 在 group path 末尾追加任意节点(leaf 或 group);[] = 根 */
function appendNodeAt<L>(
  tree: TreeNode<L>[],
  groupPath: number[],
  node: TreeNode<L>,
): TreeNode<L>[] {
  if (groupPath.length === 0) {
    return [...tree, node];
  }
  return updateNodeAt(tree, groupPath, (n) => {
    if (!isGroup(n)) return n;
    return { ...n, children: [...n.children, node] };
  });
}

/** 删除 fromPath 后调整 toPath 的索引(如果 to 在 from 同父且位于 from 之后,索引-1) */
function adjustPathAfterRemoval(toPath: number[], fromPath: number[]): number[] {
  if (fromPath.length === 0) return toPath;
  const fromParent = fromPath.slice(0, -1);
  const fromIdx = fromPath[fromPath.length - 1]!;
  if (toPath.length <= fromParent.length) return toPath;
  for (let i = 0; i < fromParent.length; i++) {
    if (toPath[i] !== fromParent[i]) return toPath;
  }
  const toIdx = toPath[fromParent.length]!;
  if (toIdx > fromIdx) {
    const next = [...toPath];
    next[fromParent.length] = toIdx - 1;
    return next;
  }
  return toPath;
}

/** 全树扫描:把 1-child group 降级为该 child(保持 removeAt 的 unwrap 不变量) */
function unwrapSingleChildGroups<L>(tree: TreeNode<L>[]): TreeNode<L>[] {
  return tree.map((node) => {
    if (!isGroup(node)) return node;
    const cleaned = unwrapSingleChildGroups(node.children);
    if (cleaned.length === 1) {
      return cleaned[0]!;
    }
    return { ...node, children: cleaned };
  });
}

/**
 * 把 fromPath 的节点移到 toGroupPath 指向的 group 末尾。
 *
 * 边界:
 *   - fromPath=[]  → noop(根不能移)
 *   - toGroupPath=[] → 移到根末尾
 *   - toGroupPath 是 fromPath 的前缀(包含自己 / 自己 descendant)→ noop(避免环)
 *   - fromPath 不存在 → noop
 *   - to 不是 group(除根外)→ noop(updateNodeAt 找到非 group 节点直接返回原节点)
 *
 * 行为:
 *   - 节点为 group 时整体搬走(包括 children)
 *   - 移走后若祖先 group 只剩 1 child 自动降级(与 removeAt 一致)
 */
export function moveNode<L>(
  tree: TreeNode<L>[],
  fromPath: number[],
  toGroupPath: number[],
): TreeNode<L>[] {
  if (fromPath.length === 0) return tree;
  if (isPathPrefixOrEqual(fromPath, toGroupPath)) return tree;
  const node = getNodeAt(tree, fromPath);
  if (node === undefined) return tree;
  const afterRemove = removeAtNoUnwrap(tree, fromPath);
  const adjustedTo = adjustPathAfterRemoval(toGroupPath, fromPath);
  const afterAdd = appendNodeAt(afterRemove, adjustedTo, node);
  return unwrapSingleChildGroups(afterAdd);
}
