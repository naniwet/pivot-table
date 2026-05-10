/**
 * Translator 测试
 *   translateFilters：P1.0 起实做平铺 leaf
 *   translateMeasureFilters / translateCustomElements：仍 stub
 */

import { describe, expect, it } from 'vitest';

import { orderModelMetadata } from '../../../fixtures/metadata/orderModel.js';

import { translateCustomElements, translateFilters } from './stubs.js';

describe('translateFilters (P1.0 平铺 leaf → FieldFilter)', () => {
  it('returns empty array for empty input', () => {
    expect(translateFilters([])).toEqual([]);
  });

  it('skips leaf filters with empty value（用户刚拖入还没填）', () => {
    expect(
      translateFilters([{ kind: 'leaf', field: 'A', operator: 'In', value: [] }]),
    ).toEqual([]);
    expect(
      translateFilters([{ kind: 'leaf', field: 'A', operator: 'Equals', value: '' }]),
    ).toEqual([]);
  });

  it.each(['Like', 'Contains', 'StartsWith', 'EndsWith', 'NotLike'] as const)(
    'translates string operator %s → FieldFilter(ByValue.operator) (P2)',
    (op) => {
      const result = translateFilters([
        { kind: 'leaf', field: 'A', operator: op, value: 'foo' },
      ]);
      expect(result).toEqual([
        {
          _enum: 'FieldFilter',
          field: 'A',
          filter: { _enum: 'ByValue', operator: op, value: 'foo' },
        },
      ]);
    },
  );

  it('translates leaf with value into FieldFilter (ByValue + operator)', () => {
    const result = translateFilters([
      { kind: 'leaf', field: 'A', operator: 'In', value: ['v1', 'v2'] },
    ]);
    expect(result).toEqual([
      {
        _enum: 'FieldFilter',
        field: 'A',
        filter: { _enum: 'ByValue', operator: 'In', value: ['v1', 'v2'] },
      },
    ]);
  });

  it('translates group on a single field → FieldFilter with nested And', () => {
    // P1.5: 同字段 [>=100, <=1000] And-group → 单 FieldFilter，filter 是嵌套 And
    const result = translateFilters([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThanOrEqual', value: 100 },
          { kind: 'leaf', field: 'A', operator: 'LessThanOrEqual', value: 1000 },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        _enum: 'FieldFilter',
        field: 'A',
        filter: {
          _enum: 'And',
          left: { _enum: 'ByValue', operator: 'GreaterThanOrEqual', value: 100 },
          right: { _enum: 'ByValue', operator: 'LessThanOrEqual', value: 1000 },
        },
      },
    ]);
  });

  it('translates group with 3+ children on same field → right-associative nested And', () => {
    const result = translateFilters([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThan', value: 0 },
          { kind: 'leaf', field: 'A', operator: 'LessThan', value: 100 },
          { kind: 'leaf', field: 'A', operator: 'NotEquals', value: 50 },
        ],
      },
    ]);
    // 期望 right-associative: And(c0, And(c1, c2))
    expect(result).toEqual([
      {
        _enum: 'FieldFilter',
        field: 'A',
        filter: {
          _enum: 'And',
          left: { _enum: 'ByValue', operator: 'GreaterThan', value: 0 },
          right: {
            _enum: 'And',
            left: { _enum: 'ByValue', operator: 'LessThan', value: 100 },
            right: { _enum: 'ByValue', operator: 'NotEquals', value: 50 },
          },
        },
      },
    ]);
  });

  it('Or group → uses _enum: Or for the binary nesting', () => {
    const result = translateFilters([
      {
        kind: 'group',
        op: 'Or',
        children: [
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 2 },
        ],
      },
    ]);
    expect(result[0]!.filter).toEqual({
      _enum: 'Or',
      left: { _enum: 'ByValue', operator: 'Equals', value: 1 },
      right: { _enum: 'ByValue', operator: 'Equals', value: 2 },
    });
  });

  it('group: skips empty-value children, then translates remaining (1 child → no nesting needed)', () => {
    const result = translateFilters([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThan', value: 100 },
          { kind: 'leaf', field: 'A', operator: 'LessThan', value: '' }, // 空值跳过
        ],
      },
    ]);
    // 只剩一个有效 child → 退化为单 ByValue，不需要 And/Or 包装
    expect(result).toEqual([
      {
        _enum: 'FieldFilter',
        field: 'A',
        filter: { _enum: 'ByValue', operator: 'GreaterThan', value: 100 },
      },
    ]);
  });

  it('group: all children empty → skip the whole group', () => {
    const result = translateFilters([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThan', value: '' },
          { kind: 'leaf', field: 'A', operator: 'LessThan', value: '' },
        ],
      },
    ]);
    expect(result).toEqual([]);
  });

  it('group: cross-field children → throw（同字段约束，UI 不应允许跨字段 group）', () => {
    expect(() =>
      translateFilters([
        {
          kind: 'group',
          op: 'And',
          children: [
            { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
            { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
          ],
        },
      ]),
    ).toThrow(/same field/i);
  });
});

// translateMeasureFilters 完整测试见 ./measureFilter.test.ts(P3 改为单 TupleFilter
// 内嵌套 Filter 树后,旧"多个 TupleFilter 平铺"的预期失效)

describe('P0 stub translators', () => {
  it('translateCustomElements:空 customFields → 空数组', () => {
    // 详细测试见 ./customElements.test.ts;此处只验证空入口
    expect(translateCustomElements([], orderModelMetadata)).toEqual([]);
  });
});
