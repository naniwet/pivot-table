/**
 * useAvailableFields 测试 —
 *   I1. 从 metadata 树收集所有可拖字段(度量 + 维度)
 *   I2. dimensionFields 排除 MEASURE/CALC_MEASURE
 *   I3. numericDimensionFields 只含数值类型维度
 *   I4. 排除 FOLDER/HIDDEN 节点
 *   I5. physicalColumns 来自 metadata.fields(扁平索引)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FieldNode, Metadata } from '../types/metadata.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';

import { useAvailableFields } from './useAvailableFields.js';

function node(p: Partial<FieldNode> & Pick<FieldNode, 'id' | 'name' | 'type' | 'parentId'>): FieldNode {
  return {
    aliasFromDb: p.name,
    descFromDb: null,
    useFromDb: false,
    group: null,
    level: 0,
    order: 0,
    visible: 1,
    valueType: null,
    dataFormat: null,
    extended: null,
    refDataSetFieldId: null,
    referenceFieldId: null,
    originalDataType: null,
    aggregator: null,
    businessCaliber: null,
    children: [],
    alias: p.name,
    desc: null,
    creatorId: null,
    ...p,
  };
}

function makeMeta(nodes: FieldNode[]): Metadata {
  return {
    id: 'test',
    name: 'test',
    alias: 'test',
    desc: '',
    providerName: 'AUGMENTED',
    views: [],
    fields: [],
    levels: [],
    measures: [],
    calcMeasures: [],
    namedSets: [],
    nodes,
  };
}

describe('useAvailableFields — orderModel', () => {
  it('I1: 包含度量 + 维度字段', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    const { availableFields } = result.current;
    // 度量
    expect(availableFields).toContain(FIELD_IDS.salesMeasure);
    // 维度(层级 + levels + calc_group)
    expect(availableFields).toContain(FIELD_IDS.shipRegionHierarchy);
    expect(availableFields).toContain(FIELD_IDS.provinceLevel);
    expect(availableFields).toContain(FIELD_IDS.regionLevel);
    expect(availableFields).toContain(FIELD_IDS.cityLevel);
    expect(availableFields).toContain(FIELD_IDS.cityCalcGroup);
  });

  it('I2: dimensionFields 不含度量', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    expect(result.current.dimensionFields).not.toContain(FIELD_IDS.salesMeasure);
    expect(result.current.dimensionFields).toContain(FIELD_IDS.provinceLevel);
  });

  it('I3: numericDimensionFields — orderModel 中所有 dim 都是 STRING,所以空', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    expect(result.current.numericDimensionFields).toEqual([]);
  });

  it('I4: 不含 FOLDER 类型节点名', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    // '维度'(DIMENSION_FOLDER), '度量'(MEASURE_FOLDER), '订单表'(FOLDER), '订单明细'(FOLDER)
    const folders = ['维度', '度量', '命名集', '订单表', '订单明细'];
    for (const f of folders) {
      expect(result.current.availableFields).not.toContain(f);
    }
  });

  it('I5: physicalColumns 从 metadata.fields 取扁平列名', () => {
    const { result } = renderHook(() => useAvailableFields(orderModelMetadata));
    expect(result.current.physicalColumns).toContain('城市分组');
    expect(result.current.physicalColumns).toHaveLength(1); // orderModel 只有一个 field
  });

  it('returns stable reference for same metadata', () => {
    const { result, rerender } = renderHook(({ meta }: { meta: Metadata }) => useAvailableFields(meta), {
      initialProps: { meta: orderModelMetadata },
    });
    const first = result.current;
    rerender({ meta: orderModelMetadata });
    expect(result.current).toBe(first);
  });
});

describe('useAvailableFields — minimal test metadata', () => {
  it('I3: 数值类型维度 → 进入 numericDimensionFields', () => {
    const numDim = node({
      id: 'num-dim',
      name: 'Amount',
      type: 'LEVEL',
      parentId: null,
      valueType: 'DOUBLE',
    });
    const meta = makeMeta([numDim]);
    const { result } = renderHook(() => useAvailableFields(meta));
    expect(result.current.numericDimensionFields).toEqual(['Amount']);
  });

  it('I3: 多个数值类型', () => {
    const numTypes = ['INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC'] as const;
    const nodes: FieldNode[] = numTypes.map((vt, i) =>
      node({ id: `n${i}`, name: `n${i}`, type: 'LEVEL', parentId: null, valueType: vt }),
    );
    const { result } = renderHook(() => useAvailableFields(makeMeta(nodes)));
    for (const n of numTypes.keys()) {
      expect(result.current.numericDimensionFields).toContain(`n${n}`);
    }
    expect(result.current.numericDimensionFields).toHaveLength(numTypes.length);
  });

  it('I2: MEASURE 类型不在 dimensionFields', () => {
    const dimNode = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const measNode = node({ id: 'm', name: 'm1', type: 'MEASURE', parentId: null });
    const meta = makeMeta([dimNode, measNode]);
    const { result } = renderHook(() => useAvailableFields(meta));
    expect(result.current.dimensionFields).toEqual(['dim1']);
    expect(result.current.availableFields).toContain('m1');
    expect(result.current.availableFields).toContain('dim1');
  });

  it('I4: FOLDER 节点被跳过,不进入任何集合', () => {
    const dim = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const folder = node({
      id: 'f',
      name: '我的文件夹',
      type: 'FOLDER',
      parentId: null,
      children: [dim],
    });
    const meta = makeMeta([folder]); // dim is child of folder
    const { result } = renderHook(() => useAvailableFields(meta));
    expect(result.current.availableFields).toEqual(['dim1']); // folder name NOT in set
  });

  it('I4: HIDDEN types (MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE) excluded', () => {
    const hidden1 = node({ id: 'hid1', name: 'Measures', type: 'MEASURE_GROUP_NAME', parentId: null });
    const hidden2 = node({ id: 'hid2', name: 'Value', type: 'MEASURE_GROUP_VALUE', parentId: null });
    const dim = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const meta = makeMeta([hidden1, hidden2, dim]);
    const { result } = renderHook(() => useAvailableFields(meta));
    expect(result.current.availableFields).not.toContain('Measures');
    expect(result.current.availableFields).not.toContain('Value');
    expect(result.current.availableFields).toContain('dim1');
  });

  it('empty metadata → empty arrays', () => {
    const meta = makeMeta([]);
    const { result } = renderHook(() => useAvailableFields(meta));
    expect(result.current.availableFields).toEqual([]);
    expect(result.current.dimensionFields).toEqual([]);
    expect(result.current.numericDimensionFields).toEqual([]);
    expect(result.current.physicalColumns).toEqual([]);
  });
});
