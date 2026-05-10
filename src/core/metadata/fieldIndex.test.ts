/**
 * MetadataIndex 测试
 *
 * 职责：把 Metadata 树扁平化为 name → FieldNode 的 O(1) 索引。
 * 是 QueryBuilder / FieldTree 等多个模块的公共依赖。
 */

import { describe, expect, it } from 'vitest';

import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildMetadataIndex } from './fieldIndex.js';

describe('buildMetadataIndex', () => {
  it('should index hierarchy by name', () => {
    const index = buildMetadataIndex(orderModelMetadata);
    const node = index.findByName(FIELD_IDS.shipRegionHierarchy);

    expect(node).not.toBeNull();
    expect(node?.type).toBe('HIERARCHY');
    expect(node?.alias).toBe('发货区域');
  });

  it('should index hierarchy levels', () => {
    const index = buildMetadataIndex(orderModelMetadata);

    expect(index.findByName(FIELD_IDS.provinceLevel)?.type).toBe('LEVEL');
    expect(index.findByName(FIELD_IDS.regionLevel)?.type).toBe('LEVEL');
    expect(index.findByName(FIELD_IDS.cityLevel)?.type).toBe('LEVEL');
  });

  it('should index measures', () => {
    const index = buildMetadataIndex(orderModelMetadata);

    expect(index.findByName(FIELD_IDS.salesMeasure)?.type).toBe('MEASURE');
    expect(index.findByName(FIELD_IDS.salesMeasure)?.alias).toBe('销售额');
  });

  it('should index CALC_GROUP fields', () => {
    const index = buildMetadataIndex(orderModelMetadata);

    expect(index.findByName(FIELD_IDS.cityCalcGroup)?.type).toBe('CALC_GROUP');
  });

  it('should return null for unknown field', () => {
    const index = buildMetadataIndex(orderModelMetadata);

    expect(index.findByName('not_exists')).toBeNull();
  });

  it('should expose hierarchy levels in declared order', () => {
    const index = buildMetadataIndex(orderModelMetadata);
    const levels = index.getHierarchyLevels(FIELD_IDS.shipRegionHierarchy);

    expect(levels.map((l) => l.name)).toEqual([
      FIELD_IDS.provinceLevel,
      FIELD_IDS.regionLevel,
      FIELD_IDS.cityLevel,
    ]);
  });

  it('should return empty array when getHierarchyLevels called on non-hierarchy', () => {
    const index = buildMetadataIndex(orderModelMetadata);

    expect(index.getHierarchyLevels(FIELD_IDS.salesMeasure)).toEqual([]);
    expect(index.getHierarchyLevels('not_exists')).toEqual([]);
  });
});
