/**
 * translateMeasureFilters — MeasureFilter[] → query.measureFilters: TupleFilter[]
 *
 * 跟 dimensionFilter 对称的"度量过滤树":
 *   - 输出长度 0(无过滤)或 1(单一 TupleFilter,内部 filter 是嵌套 Filter 树)
 *   - 多个 MeasureFilter → And(ByMeasure, ByMeasure, ...) 二元嵌套树
 *   - Between → And(GTE, LTE) 子树
 *   - 空 value 跳过
 *
 * 后端契约:`query.measureFilters: TupleFilter[]`,数组里通常 1 个 TupleFilter,
 * 内部 Filter union 自带 And/Or/Not 嵌套。
 */
import { describe, expect, it } from 'vitest';

import { translateMeasureFilters } from './measureFilter.js';

describe('translateMeasureFilters', () => {
  it('空数组 → []', () => {
    expect(translateMeasureFilters([])).toEqual([]);
  });

  it('全部空 value → []', () => {
    expect(
      translateMeasureFilters([
        { measureName: 'sales', operator: 'GreaterThan', value: '' },
      ]),
    ).toEqual([]);
  });

  it('单个 leaf → 单 TupleFilter,内部 ByMeasure', () => {
    expect(
      translateMeasureFilters([
        { measureName: 'sales', operator: 'GreaterThan', value: 1000 },
      ]),
    ).toEqual([
      {
        _enum: 'TupleFilter',
        filter: {
          _enum: 'ByMeasure',
          measure: 'sales',
          measureContext: 'InGlobal',
          operator: 'GreaterThan',
          value: 1000,
        },
      },
    ]);
  });

  it('两个 leaf → 单 TupleFilter,内部 And(ByMeasure, ByMeasure)', () => {
    expect(
      translateMeasureFilters([
        { measureName: 'sales', operator: 'GreaterThan', value: 1000 },
        { measureName: 'profit', operator: 'LessThan', value: 500 },
      ]),
    ).toEqual([
      {
        _enum: 'TupleFilter',
        filter: {
          _enum: 'And',
          left: {
            _enum: 'ByMeasure',
            measure: 'sales',
            measureContext: 'InGlobal',
            operator: 'GreaterThan',
            value: 1000,
          },
          right: {
            _enum: 'ByMeasure',
            measure: 'profit',
            measureContext: 'InGlobal',
            operator: 'LessThan',
            value: 500,
          },
        },
      },
    ]);
  });

  it('Between → And(GTE, LTE) 子树', () => {
    expect(
      translateMeasureFilters([
        { measureName: 'sales', operator: 'Between', value: [100, 1000] },
      ]),
    ).toEqual([
      {
        _enum: 'TupleFilter',
        filter: {
          _enum: 'And',
          left: {
            _enum: 'ByMeasure',
            measure: 'sales',
            measureContext: 'InGlobal',
            operator: 'GreaterThanOrEqual',
            value: 100,
          },
          right: {
            _enum: 'ByMeasure',
            measure: 'sales',
            measureContext: 'InGlobal',
            operator: 'LessThanOrEqual',
            value: 1000,
          },
        },
      },
    ]);
  });

  it('Between + 单值过滤组合 → 顶层 And 串接', () => {
    const r = translateMeasureFilters([
      { measureName: 'sales', operator: 'Between', value: [100, 1000] },
      { measureName: 'profit', operator: 'GreaterThan', value: 50 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.filter._enum).toBe('And');
  });

  it('group {Or, [a, b]} → 单 TupleFilter,内部 Or(ByMeasure, ByMeasure) 跨度量 (P3)', () => {
    expect(
      translateMeasureFilters([
        {
          kind: 'group',
          op: 'Or',
          children: [
            { measureName: 'sales', operator: 'GreaterThan', value: 10000 },
            { measureName: 'profit', operator: 'GreaterThan', value: 5000 },
          ],
        },
      ]),
    ).toEqual([
      {
        _enum: 'TupleFilter',
        filter: {
          _enum: 'Or',
          left: {
            _enum: 'ByMeasure',
            measure: 'sales',
            measureContext: 'InGlobal',
            operator: 'GreaterThan',
            value: 10000,
          },
          right: {
            _enum: 'ByMeasure',
            measure: 'profit',
            measureContext: 'InGlobal',
            operator: 'GreaterThan',
            value: 5000,
          },
        },
      },
    ]);
  });

  it('group 嵌套 group → 多层递归', () => {
    const r = translateMeasureFilters([
      {
        kind: 'group',
        op: 'And',
        children: [
          { measureName: 'sales', operator: 'GreaterThan', value: 1000 },
          {
            kind: 'group',
            op: 'Or',
            children: [
              { measureName: 'profit', operator: 'GreaterThan', value: 100 },
              { measureName: 'qty', operator: 'GreaterThan', value: 10 },
            ],
          },
        ],
      },
    ]);
    expect(r).toHaveLength(1);
    const filter = r[0]!.filter as { _enum: string; right: { _enum: string } };
    expect(filter._enum).toBe('And');
    expect(filter.right._enum).toBe('Or');
  });

  it('混合 leaf + group → 顶层 And 串接', () => {
    const r = translateMeasureFilters([
      { measureName: 'sales', operator: 'GreaterThan', value: 1000 },
      {
        kind: 'group',
        op: 'Or',
        children: [
          { measureName: 'profit', operator: 'GreaterThan', value: 100 },
          { measureName: 'qty', operator: 'LessThan', value: 5 },
        ],
      },
    ]);
    expect(r[0]!.filter._enum).toBe('And');
  });

  it('group 全部空 value → []', () => {
    expect(
      translateMeasureFilters([
        {
          kind: 'group',
          op: 'And',
          children: [
            { measureName: 'sales', operator: 'GreaterThan', value: '' },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('measureContext=InGroup 透传', () => {
    expect(
      translateMeasureFilters([
        {
          measureName: 'sales',
          operator: 'GreaterThan',
          value: 100,
          context: 'InGroup',
        },
      ])[0]!.filter,
    ).toMatchObject({ measureContext: 'InGroup' });
  });
});
