/**
 * validateViewConfig 测试
 * 校验规则单元测试。buildQuery 间接也会触发这些 case，但独立测试便于定位。
 */

import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig, buildColumnField } from '../../fixtures/builders.js';
import { orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';

import { ValidationError, validateViewConfig } from './validators.js';

const index = buildMetadataIndex(orderModelMetadata);

describe('validateViewConfig', () => {
  it('should pass for valid minimum config', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
    });
    expect(() => validateViewConfig(vc, index)).not.toThrow();
  });

  it('should throw when no measure in values', () => {
    const vc = buildViewConfig({ rows: [buildHierarchyRow()], values: [] });
    expect(() => validateViewConfig(vc, index)).toThrow(ValidationError);
    expect(() => validateViewConfig(vc, index)).toThrow(/at least 1 measure/);
  });

  it('should throw when row field not in metadata', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'unknown_field' })],
      values: [buildValueField()],
    });
    expect(() => validateViewConfig(vc, index)).toThrow(/row field "unknown_field" not in metadata/);
  });

  it('should throw when column field not in metadata', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      columns: [buildColumnField({ fieldName: 'phantom_col' })],
      values: [buildValueField()],
    });
    expect(() => validateViewConfig(vc, index)).toThrow(/column field "phantom_col" not in metadata/);
  });

  it('should throw when measure not in metadata', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField({ measureName: 'fake_measure' })],
    });
    expect(() => validateViewConfig(vc, index)).toThrow(/measure "fake_measure" not in metadata/);
  });

  it('should report all field issues with ValidationError class', () => {
    const vc = buildViewConfig({ values: [] });
    try {
      validateViewConfig(vc, index);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as Error).name).toBe('ValidationError');
    }
  });

  describe('P2 自建字段闭环:customFields id 也算合法字段引用', () => {
    it('row 引用 enum_group 自建字段(不在 metadata 但在 customFields)→ 不抛', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: 'eg_xxx', type: 'EnumGroup' }],
        values: [buildValueField()],
        customFields: [
          {
            id: 'eg_xxx',
            name: '区域分组',
            kind: 'enum_group',
            baseField: 'ShipProvince2',
            groups: [{ label: '华东', members: ['江苏', '浙江'] }],
            ungroupedHandling: 'show_individually',
          },
        ],
      });
      expect(() => validateViewConfig(vc, index)).not.toThrow();
    });

    it('column 引用 range_group 自建字段 → 不抛', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow()],
        columns: [{ fieldName: 'rg_yyy', type: 'RangeGroup' }],
        values: [buildValueField()],
        customFields: [
          {
            id: 'rg_yyy',
            name: '销售额区间',
            kind: 'range_group',
            baseField: '销售额_1624531356707',
            ranges: [{ min: null, max: 1000, label: '低' }, { min: 1000, max: null, label: '高' }],
          },
        ],
      });
      expect(() => validateViewConfig(vc, index)).not.toThrow();
    });

    it('values 引用 calc_measure 自建字段 → 不抛', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField({ measureName: 'cm_zzz' })],
        customFields: [
          {
            id: 'cm_zzz',
            name: '利润率',
            kind: 'calc_measure',
            dataFormat: '0.00%',
            expression: '[销售额]/[成本]',
            ast: null,
          },
        ],
      });
      expect(() => validateViewConfig(vc, index)).not.toThrow();
    });

    it('row 引用不存在的 customField id → 仍抛(防止 id 写错)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: 'eg_typo', type: 'EnumGroup' }],
        values: [buildValueField()],
        customFields: [], // 空 — 引用的 id 不存在
      });
      expect(() => validateViewConfig(vc, index)).toThrow(/not in metadata or customFields/);
    });

    it('values 引用 enum_group(类型错位:维度组分不能当度量)→ 抛', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField({ measureName: 'eg_xxx' })], // ← enum_group id 用作 measure
        customFields: [
          {
            id: 'eg_xxx',
            name: '区域分组',
            kind: 'enum_group',
            baseField: 'ShipProvince2',
            groups: [],
            ungroupedHandling: 'show_individually',
          },
        ],
      });
      // measureName 仅查 calc_measure 类 customField,enum_group 不算 → 报错
      expect(() => validateViewConfig(vc, index)).toThrow(
        /measure "eg_xxx" not in metadata or customFields/,
      );
    });
  });
});
