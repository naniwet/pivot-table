/**
 * MetadataIndex — Metadata 树的索引(2026-05-06 重写,对齐新 AugmentedDataSet 结构)
 *
 * 职责(Unix:只做一件事):
 *   - 提供 O(1) 的 name → FieldNode 查找(从 nodes[] 树/扁平索引)
 *   - 提供 fieldName → viewName 反查(从 levels/measures/fields → viewId → views[].name)
 *   - 提供 hierarchy → levels 查询(用于 drillDepth 展开)
 *   - 提供 parent 反查(用于 detectTimeAxis 等场景)
 *
 * 不做:
 *   - 不构造 query;不渲染;不缓存(外部按需缓存)
 *   - 不解析 fieldId 的字符串模式(viewName 用 viewId 精确反查)
 */

import type { FieldNode, Metadata } from '../../types/metadata.js';

export interface MetadataIndex {
  /** 按 fieldName 查 nodes[] 中的节点;找不到返回 null */
  findByName(name: string): FieldNode | null;
  /** 按 fieldName 反查父节点(nodes 树);找不到/根节点返回 null */
  findParentByName(name: string): FieldNode | null;
  /**
   * 给定 hierarchy fieldName,返回其 levels(按 order 排序);非 hierarchy/不存在返回 []
   */
  getHierarchyLevels(name: string): FieldNode[];
  /**
   * 反查 fieldName 所属 view 的 name(数据库表名)— 给 customElements 翻译用。
   *   1. 从 levels[]/measures[]/fields[] 中按 name 找,拿 viewId
   *   2. viewId → views[].name
   *   3. 找不到 → null
   */
  getViewName(fieldName: string): string | null;
}

function walkWithParent(
  node: FieldNode,
  parent: FieldNode | null,
  visit: (n: FieldNode, p: FieldNode | null) => void,
): void {
  visit(node, parent);
  for (const child of node.children) walkWithParent(child, node, visit);
}

const HIERARCHY_TYPES = new Set<FieldNode['type']>(['HIERARCHY', 'HIERARCHY_TIME']);

export function buildMetadataIndex(metadata: Metadata): MetadataIndex {
  // 1. nodes[] 树展开:递归 root-level 节点(parentId === null)收集所有节点 + parent 关系
  const byName = new Map<string, FieldNode>();
  const parentByName = new Map<string, FieldNode>();
  const roots = metadata.nodes.filter((n) => n.parentId === null);
  for (const root of roots) {
    walkWithParent(root, null, (n, p) => {
      byName.set(n.name, n);
      if (p) parentByName.set(n.name, p);
    });
  }

  // 2. viewId → viewName 索引(views[] 自身)
  const viewNameById = new Map<string, string>();
  for (const v of metadata.views) viewNameById.set(v.id, v.name);

  // 3. fieldName → viewId 索引(从 levels/measures/calcMeasures/fields 收集)
  //    多个数组按优先级回退查找
  const viewIdByFieldName = new Map<string, string | null>();
  for (const lv of metadata.levels) viewIdByFieldName.set(lv.name, lv.viewId);
  for (const m of metadata.measures) viewIdByFieldName.set(m.name, m.viewId);
  // calcMeasures 的 viewId 通常是 null(MDX 表达式无所属表);保留以便完整覆盖
  for (const cm of metadata.calcMeasures) {
    if (!viewIdByFieldName.has(cm.name)) viewIdByFieldName.set(cm.name, null);
  }
  for (const f of metadata.fields) {
    if (!viewIdByFieldName.has(f.name)) viewIdByFieldName.set(f.name, f.viewId);
  }

  return {
    findByName(name) {
      return byName.get(name) ?? null;
    },
    findParentByName(name) {
      return parentByName.get(name) ?? null;
    },
    getHierarchyLevels(name) {
      const node = byName.get(name);
      if (!node || !HIERARCHY_TYPES.has(node.type)) return [];
      // 按 order 排序,防止 children 顺序不稳定
      return [...node.children].sort((a, b) => a.order - b.order);
    },
    getViewName(fieldName) {
      const viewId = viewIdByFieldName.get(fieldName);
      if (!viewId) return null;
      return viewNameById.get(viewId) ?? null;
    },
  };
}
