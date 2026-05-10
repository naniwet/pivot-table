/**
 * dropRules — DropZones 拖拽合法性的纯数据驱动表
 *
 * P0 仅开放：行 / 列 各开放维度类型；值开放度量类型；filter 全关（P1.0 开）
 * 任何不在表里的组合 → false（防御默认）
 */
import { describe, expect, it } from 'vitest';

import type { DropZone, FieldType } from './dropRules.js';
import { canDrop } from './dropRules.js';

describe('canDrop — P0 baseline', () => {
  // 每条 case 对应 p0-dev.md 3.4 的 DROP_RULES 矩阵
  it.each<[FieldType, DropZone, boolean]>([
    // Dimension: row/column 允许，value/filter 不允许
    ['Dimension', 'row', true],
    ['Dimension', 'column', true],
    ['Dimension', 'value', false],
    ['Dimension', 'filter', true], // P1.0 开放

    // Hierarchy: 同 Dimension
    ['Hierarchy', 'row', true],
    ['Hierarchy', 'column', true],
    ['Hierarchy', 'value', false],
    ['Hierarchy', 'filter', true], // P1.0 开放

    // CalcGroup: 同 Dimension
    ['CalcGroup', 'row', true],
    ['CalcGroup', 'column', true],
    ['CalcGroup', 'value', false],
    ['CalcGroup', 'filter', true], // P1.0 开放

    // Measure: value + filter（P1.0 measureFilter / top-N）
    ['Measure', 'value', true],
    ['Measure', 'row', false],
    ['Measure', 'column', false],
    ['Measure', 'filter', true],

    // CalcMeasure: 同 Measure
    ['CalcMeasure', 'value', true],
    ['CalcMeasure', 'row', false],
    ['CalcMeasure', 'filter', true],

    // NamedSet: P1.5 起 row/column/filter 开放，value 永远不可
    ['NamedSet', 'row', true],
    ['NamedSet', 'column', true],
    ['NamedSet', 'value', false],
    ['NamedSet', 'filter', true],

    // P2 自建字段闭环 — 跟同语义 metadata 字段拖拽规则一致
    // EnumGroup / RangeGroup(用户建的维度组分,跟 Dimension 等价)
    ['EnumGroup', 'row', true],
    ['EnumGroup', 'column', true],
    ['EnumGroup', 'value', false],
    ['EnumGroup', 'filter', true],
    ['RangeGroup', 'row', true],
    ['RangeGroup', 'column', true],
    ['RangeGroup', 'value', false],
    ['RangeGroup', 'filter', true],
    // UserCalcMeasure(用户建的计算度量,跟 Measure 等价)
    ['UserCalcMeasure', 'row', false],
    ['UserCalcMeasure', 'column', false],
    ['UserCalcMeasure', 'value', true],
    ['UserCalcMeasure', 'filter', true],
  ])('canDrop(%s, %s) === %s', (fieldType, zone, expected) => {
    expect(canDrop(fieldType, zone)).toBe(expected);
  });

  it('should return false for unknown field types (defensive default)', () => {
    // 若 P2/P3 加了新类型但未更新表 → false 而不是 throw（UI 层简单忽略）
    expect(canDrop('UnknownType' as FieldType, 'row')).toBe(false);
    expect(canDrop('UnknownType' as FieldType, 'value')).toBe(false);
  });

  it('should return false for unknown drop zones (defensive default)', () => {
    expect(canDrop('Measure', 'unknown' as DropZone)).toBe(false);
  });
});
