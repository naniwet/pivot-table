/**
 * translateDimensionFilter — ClientFilter[] → 单一 Filter 嵌套树
 *
 * 后端真正接受维度过滤的字段是 query.dimensionFilter: { filter: Filter } | null
 * Filter union 自带 And/Or/Not 嵌套,所以不再需要 FieldFilter[] 平铺。
 *
 * 翻译规则:
 *   - 每个 leaf  → { _enum: 'ByLevel', level: f.field, operator, value }
 *   - group{op, children} → 二元嵌套 And/Or 树(右结合)
 *   - 多个顶层 filter → 数组级隐式 And(用 Filter.And 嵌套)
 *   - 全部空 / 空 value 跳过 → 返回 null
 */
import { describe, expect, it } from 'vitest';

import { translateDimensionFilter } from './dimensionFilter.js';

describe('translateDimensionFilter', () => {
  it('空数组 → null', () => {
    expect(translateDimensionFilter([])).toBeNull();
  });

  it('全部空 value → null', () => {
    expect(
      translateDimensionFilter([
        { kind: 'leaf', field: 'A', operator: 'In', value: [] },
        { kind: 'leaf', field: 'B', operator: 'Equals', value: '' },
      ]),
    ).toBeNull();
  });

  it('单 leaf → ByLevel(level=field)', () => {
    expect(
      translateDimensionFilter([
        { kind: 'leaf', field: 'A', operator: 'In', value: ['x'] },
      ]),
    ).toEqual({ _enum: 'ByLevel', level: 'A', operator: 'In', value: ['x'] });
  });

  it('两个平铺 leaf → And(ByLevel1, ByLevel2)', () => {
    expect(
      translateDimensionFilter([
        { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
        { kind: 'leaf', field: 'B', operator: 'In', value: ['y'] },
      ]),
    ).toEqual({
      _enum: 'And',
      left: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 1 },
      right: { _enum: 'ByLevel', level: 'B', operator: 'In', value: ['y'] },
    });
  });

  it('三个平铺 leaf → 右结合 And(a, And(b, c))', () => {
    const r = translateDimensionFilter([
      { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
      { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
      { kind: 'leaf', field: 'C', operator: 'Equals', value: 3 },
    ]);
    expect(r).toEqual({
      _enum: 'And',
      left: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 1 },
      right: {
        _enum: 'And',
        left: { _enum: 'ByLevel', level: 'B', operator: 'Equals', value: 2 },
        right: { _enum: 'ByLevel', level: 'C', operator: 'Equals', value: 3 },
      },
    });
  });

  it('group {And, [a, b]} 同字段 → And(ByLevel, ByLevel)', () => {
    const r = translateDimensionFilter([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThanOrEqual', value: 100 },
          { kind: 'leaf', field: 'A', operator: 'LessThanOrEqual', value: 1000 },
        ],
      },
    ]);
    expect(r).toEqual({
      _enum: 'And',
      left: { _enum: 'ByLevel', level: 'A', operator: 'GreaterThanOrEqual', value: 100 },
      right: { _enum: 'ByLevel', level: 'A', operator: 'LessThanOrEqual', value: 1000 },
    });
  });

  it('group {Or, [a, b]} → Or(ByLevel, ByLevel)', () => {
    const r = translateDimensionFilter([
      {
        kind: 'group',
        op: 'Or',
        children: [
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 2 },
        ],
      },
    ]);
    expect(r).toEqual({
      _enum: 'Or',
      left: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 1 },
      right: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 2 },
    });
  });

  it('group 中含空 value 子节点 → 自动跳过', () => {
    const r = translateDimensionFilter([
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'leaf', field: 'A', operator: 'GreaterThan', value: 1 },
          { kind: 'leaf', field: 'A', operator: 'LessThan', value: '' },
        ],
      },
    ]);
    // 只剩一个 → 退化为单 ByLevel
    expect(r).toEqual({
      _enum: 'ByLevel',
      level: 'A',
      operator: 'GreaterThan',
      value: 1,
    });
  });

  it('混合:平铺 leaf + group → 顶层 And 串接', () => {
    const r = translateDimensionFilter([
      { kind: 'leaf', field: 'X', operator: 'Equals', value: 'foo' },
      {
        kind: 'group',
        op: 'Or',
        children: [
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
          { kind: 'leaf', field: 'A', operator: 'Equals', value: 2 },
        ],
      },
    ]);
    expect(r).toEqual({
      _enum: 'And',
      left: { _enum: 'ByLevel', level: 'X', operator: 'Equals', value: 'foo' },
      right: {
        _enum: 'Or',
        left: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 1 },
        right: { _enum: 'ByLevel', level: 'A', operator: 'Equals', value: 2 },
      },
    });
  });

  it('group 全部空 → 跳过整个 group;最终若全空 → null', () => {
    expect(
      translateDimensionFilter([
        {
          kind: 'group',
          op: 'And',
          children: [
            { kind: 'leaf', field: 'A', operator: 'Equals', value: '' },
          ],
        },
      ]),
    ).toBeNull();
  });
});
