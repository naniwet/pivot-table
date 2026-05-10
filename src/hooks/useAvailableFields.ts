/**
 * useAvailableFields — 从 metadata 树收集可用字段集合(P2 自建字段闭环)
 *
 * 输出三个集合:
 *   - availableFields:所有可拖字段(度量 + 维度);给 FieldExpressionEditor 引用校验
 *   - dimensionFields:非度量字段(给 enum_group 选 base field)
 *   - numericDimensionFields:数值类型的维度字段(给 range_group 选 base field —
 *     range_group 本质是行级 CASE WHEN 表达式,必须是行级数值字段)
 *
 * 排除:folder 节点 / 虚拟字段(MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE)
 */

import { useMemo } from 'react';

import type { Metadata } from '../types/metadata.js';

const FOLDER_TYPES = new Set([
  'DIMENSION_FOLDER',
  'MEASURE_FOLDER',
  'NAMEDSET_FOLDER',
  'FOLDER',
]);
const HIDDEN_TYPES = new Set(['MEASURE_GROUP_NAME', 'MEASURE_GROUP_VALUE']);
const MEASURE_TYPES = new Set(['MEASURE', 'CALC_MEASURE']);
const NUMERIC_VTYPES = new Set([
  'INTEGER',
  'LONG',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'BIGDECIMAL',
  'NUMERIC',
]);

export interface AvailableFields {
  /** 所有可拖字段(度量 + 维度);给 FieldExpressionEditor 在 calc_measure 模式做引用校验 */
  availableFields: string[];
  /** 非度量字段(给 enum_group 选 base field) */
  dimensionFields: string[];
  /** 数值类型的维度字段(给 range_group 选 base field) */
  numericDimensionFields: string[];
  /**
   * 物理列名(metadata.fields[].name)— 给 FieldExpressionEditor 在 calc_column 模式做引用校验。
   * calc_column.expr 的 `[col_name]` 引用的是真实物理列(probe 实测后端要求),不是 metadata 字段树
   * 里的"维度/度量"名,所以单独一份。
   */
  physicalColumns: string[];
}

export function useAvailableFields(metadata: Metadata): AvailableFields {
  return useMemo(() => {
    const all: string[] = [];
    const dims: string[] = [];
    const numericDims: string[] = [];
    const stack: typeof metadata.nodes = metadata.nodes.filter((n) => n.parentId === null);
    while (stack.length) {
      const node = stack.pop()!;
      if (FOLDER_TYPES.has(node.type) || HIDDEN_TYPES.has(node.type)) {
        for (const c of node.children) stack.push(c);
        continue;
      }
      all.push(node.name);
      if (!MEASURE_TYPES.has(node.type)) {
        dims.push(node.name);
        if (node.valueType && NUMERIC_VTYPES.has(node.valueType)) {
          numericDims.push(node.name);
        }
      }
      for (const c of node.children) stack.push(c);
    }
    // physicalColumns 直接从 metadata.fields 拿(扁平索引),不走 nodes 树
    const physicalColumns = metadata.fields.map((f) => f.name);
    return {
      availableFields: all,
      dimensionFields: dims,
      numericDimensionFields: numericDims,
      physicalColumns,
    };
  }, [metadata]);
}
