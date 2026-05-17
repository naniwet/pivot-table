/**
 * computeAvailableFields 测试(从 useAvailableFields.test.ts 下沉,跑在 node)
 *
 *   I1. 从 metadata 树收集所有可拖字段(度量 + 维度)
 *   I2. dimensionFields 排除 MEASURE/CALC_MEASURE
 *   I3. numericDimensionFields 只含数值类型维度
 *   I4. 排除 FOLDER/HIDDEN 节点;FOLDER 仅下钻,HIDDEN 整 subtree 跳过
 *   I5. physicalColumns 来自 metadata.fields ∪ metadata.levels(剔除 measures)
 */
import { describe, expect, it } from 'vitest';

import type { FieldNode, Metadata } from '../../types/metadata.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import { computeAvailableFields } from './computeAvailableFields.js';

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
    id: 'test', name: 'test', alias: 'test', desc: '',
    providerName: 'AUGMENTED',
    views: [], fields: [], levels: [], measures: [], calcMeasures: [], namedSets: [],
    nodes,
  };
}

describe('computeAvailableFields — orderModel(I1/I2/I3/I4/I5)', () => {
  it('I1: 包含度量 + 维度字段', () => {
    const { availableFields } = computeAvailableFields(orderModelMetadata);
    expect(availableFields).toContain(FIELD_IDS.salesMeasure); // 度量
    expect(availableFields).toContain(FIELD_IDS.shipRegionHierarchy);
    expect(availableFields).toContain(FIELD_IDS.provinceLevel);
    expect(availableFields).toContain(FIELD_IDS.regionLevel);
    expect(availableFields).toContain(FIELD_IDS.cityLevel);
    expect(availableFields).toContain(FIELD_IDS.cityCalcGroup);
  });

  it('I2: dimensionFields 不含度量', () => {
    const { dimensionFields } = computeAvailableFields(orderModelMetadata);
    expect(dimensionFields).not.toContain(FIELD_IDS.salesMeasure);
    expect(dimensionFields).toContain(FIELD_IDS.provinceLevel);
  });

  it('I3: numericDimensionFields — orderModel 所有 dim 都 STRING,为空', () => {
    expect(computeAvailableFields(orderModelMetadata).numericDimensionFields).toEqual([]);
  });

  it('I4: 不含 FOLDER 类型节点名', () => {
    const { availableFields } = computeAvailableFields(orderModelMetadata);
    const folders = ['维度', '度量', '命名集', '订单表', '订单明细'];
    for (const f of folders) {
      expect(availableFields).not.toContain(f);
    }
  });

  // 2026-05-16:physicalColumns 只含 fields ∪ levels(剔除 measures)—
  // 计算列(SQL 行级)只能用维度/level,不能引用聚合度量
  it('I5: physicalColumns = fields ∪ levels(剔除 measures)', () => {
    const pc = computeAvailableFields(orderModelMetadata).physicalColumns;
    expect(pc).toContain('城市分组'); // fields[]
    expect(pc).toContain(FIELD_IDS.provinceLevel); // levels[]
    expect(pc).toContain(FIELD_IDS.regionLevel);
    expect(pc).toContain(FIELD_IDS.cityLevel);
    expect(pc).not.toContain(FIELD_IDS.salesMeasure); // 不含 measures
  });
});

describe('computeAvailableFields — minimal metadata', () => {
  it('I3: 数值类型维度 → 进 numericDimensionFields', () => {
    const numDim = node({
      id: 'num-dim', name: 'Amount', type: 'LEVEL', parentId: null, valueType: 'DOUBLE',
    });
    expect(computeAvailableFields(makeMeta([numDim])).numericDimensionFields).toEqual(['Amount']);
  });

  it('I3: 多个数值类型(INTEGER/LONG/BIGINT/FLOAT/DOUBLE/BIGDECIMAL/NUMERIC)', () => {
    const numTypes = ['INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC'] as const;
    const nodes: FieldNode[] = numTypes.map((vt, i) =>
      node({ id: `n${i}`, name: `n${i}`, type: 'LEVEL', parentId: null, valueType: vt }),
    );
    const { numericDimensionFields } = computeAvailableFields(makeMeta(nodes));
    for (const n of numTypes.keys()) {
      expect(numericDimensionFields).toContain(`n${n}`);
    }
    expect(numericDimensionFields).toHaveLength(numTypes.length);
  });

  it('I2: MEASURE 类型不在 dimensionFields(但在 availableFields)', () => {
    const dimNode = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const measNode = node({ id: 'm', name: 'm1', type: 'MEASURE', parentId: null });
    const { dimensionFields, availableFields } = computeAvailableFields(makeMeta([dimNode, measNode]));
    expect(dimensionFields).toEqual(['dim1']);
    expect(availableFields).toContain('m1');
    expect(availableFields).toContain('dim1');
  });

  it('I4: FOLDER 节点不进集合,但 children 下钻', () => {
    const dim = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const folder = node({
      id: 'f', name: '我的文件夹', type: 'FOLDER', parentId: null, children: [dim],
    });
    expect(computeAvailableFields(makeMeta([folder])).availableFields).toEqual(['dim1']);
  });

  it('I4: HIDDEN_TYPES(MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE)整 subtree 跳过', () => {
    const hidden1 = node({ id: 'hid1', name: 'Measures', type: 'MEASURE_GROUP_NAME', parentId: null });
    const hidden2 = node({ id: 'hid2', name: 'Value', type: 'MEASURE_GROUP_VALUE', parentId: null });
    const dim = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const { availableFields } = computeAvailableFields(makeMeta([hidden1, hidden2, dim]));
    expect(availableFields).not.toContain('Measures');
    expect(availableFields).not.toContain('Value');
    expect(availableFields).toContain('dim1');
  });

  // 2026-05-16:后端"成员"/"命名集"分组有时建成通用 FOLDER 类型,仅 name 区分;
  // 按 name 兜底过滤(跟 FieldTree HIDDEN_FIELD_NAMES 一致)
  it('I4.b: 按 name 兜底隐藏 — name=member 整 subtree 不收(type=FOLDER 也命中)', () => {
    const memberLeaf = node({
      id: 'm1', name: '一线城市', type: 'FIELD', parentId: 'member_root', group: 'DIMENSION',
    });
    const memberFolder = node({
      id: 'member_root', name: 'member', type: 'FOLDER', parentId: null, children: [memberLeaf],
    });
    const dim = node({ id: 'd', name: 'dim1', type: 'LEVEL', parentId: null });
    const { availableFields, dimensionFields } = computeAvailableFields(
      makeMeta([memberFolder, memberLeaf, dim]),
    );
    expect(availableFields).not.toContain('一线城市');
    expect(availableFields).not.toContain('member');
    expect(dimensionFields).not.toContain('一线城市');
    expect(availableFields).toContain('dim1'); // 平行字段照常进
  });

  it('empty metadata → 4 个空数组', () => {
    const { availableFields, dimensionFields, numericDimensionFields, physicalColumns } =
      computeAvailableFields(makeMeta([]));
    expect(availableFields).toEqual([]);
    expect(dimensionFields).toEqual([]);
    expect(numericDimensionFields).toEqual([]);
    expect(physicalColumns).toEqual([]);
  });
});
