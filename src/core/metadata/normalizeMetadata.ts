/**
 * normalizeMetadata — 修补 AugmentedDataSet 双视图设计的字段空洞
 *
 * 背景:
 *   `/api/augmentedDataSet/{id}` 返回的 `nodes[]`(树形 outline)里,所有 leaf 节点的
 *   `valueType / dataFormat / aggregator / originalDataType` 等字段都是 `null`。
 *   真实值存在 `levels[]` / `measures[]` / `fields[]` / `calcMeasures[]` 扁平数组里,
 *   通过 `node.id === record.id` 一对一对应。
 *
 *   消费方(FilterPanel / FilterModal / PivotTable / FieldTree)直接读 `node.valueType`
 *   是合理的——nodes[] 是字段树的"事实视图"。所以我们在收到响应时把扁平数组里的真值
 *   merge 回 nodes[],对消费方完全透明。
 *
 * 职责(Unix:做一件事):
 *   - 输入:Metadata(nodes[] 里 valueType/dataFormat/... 可能为 null)
 *   - 输出:Metadata(nodes[] 里 leaf 节点的这几个字段从扁平数组补全)
 *   - 不改:树结构、id、name、parentId、children 关系
 *
 * 不做:
 *   - 不修改输入对象(返回新 nodes 数组,内部节点 shallow clone)
 *   - 不构造索引(那是 buildMetadataIndex 的事)
 *   - 不解析 fieldId 字符串(fields 之间用 id 精确匹配,不靠模式)
 *
 * 调用时机:`SmartbiClient.fetchMetadata` 解码 JSON 后立刻 normalize 一次。
 */

import type { FieldNode, Metadata, MetadataAggregator, ValueType } from '../../types/metadata.js';

/** 扁平数组里能反查的字段子集 — 跟 FieldNode 的同名字段对齐 */
interface ResolvedFieldSource {
  valueType?: ValueType | null;
  dataFormat?: string | null;
  aggregator?: MetadataAggregator | null;
  originalDataType?: ValueType | null;
  extended?: string | null;
  refDataSetFieldId?: string | null;
  referenceFieldId?: string | null;
}

export function normalizeMetadata(metadata: Metadata): Metadata {
  // 1. 建 id → source 索引(levels / measures / calcMeasures / fields,后写不覆盖前写——但实际上
  //    一个 id 只会出现在某一类里,所以先后顺序不影响结果)
  const sourceById = new Map<string, ResolvedFieldSource>();
  for (const lv of metadata.levels) sourceById.set(lv.id, lv);
  for (const m of metadata.measures) sourceById.set(m.id, m);
  for (const cm of metadata.calcMeasures) sourceById.set(cm.id, cm);
  for (const f of metadata.fields) sourceById.set(f.id, f);

  // 2. 递归 enrich 每个节点。null 字段 ← source 同名字段(source 也是 null 就保持 null)
  function enrich(node: FieldNode): FieldNode {
    const src = sourceById.get(node.id);
    const enrichedChildren = node.children.map(enrich);
    if (!src) {
      // 没有匹配的 flat record(folder / root 节点)— 只递归 children
      return enrichedChildren === node.children ? node : { ...node, children: enrichedChildren };
    }
    return {
      ...node,
      valueType: node.valueType ?? src.valueType ?? null,
      dataFormat: node.dataFormat ?? src.dataFormat ?? null,
      aggregator: node.aggregator ?? src.aggregator ?? null,
      originalDataType: node.originalDataType ?? src.originalDataType ?? null,
      extended: node.extended ?? src.extended ?? null,
      refDataSetFieldId: node.refDataSetFieldId ?? src.refDataSetFieldId ?? null,
      referenceFieldId: node.referenceFieldId ?? src.referenceFieldId ?? null,
      children: enrichedChildren,
    };
  }

  return {
    ...metadata,
    nodes: metadata.nodes.map(enrich),
  };
}
