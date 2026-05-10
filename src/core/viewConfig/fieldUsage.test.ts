/**
 * fieldUsage — 计算 ViewConfig 中每个字段的 zone 出现计数
 *
 * 不变量:
 *   I1. rows[].fieldName 计入(同 zone 内同字段去重)
 *   I2. columns[].fieldName 计入(同上)
 *   I3. values[].measureName 计入(同 measureName 多 aggregator 算 1 个 zone)
 *   I4. filters 树形 leaf.field 计入,group 节点递归
 *   I5. measureFilters 树形 leaf.measureName 计入(含 kind=undefined 老序列化兼容)
 *   I6. 跨 zone 累加(同字段在 row + filter → count=2)
 *   I7. 没用到的字段不在 Map 里(get 返回 undefined,调用方按 0 处理)
 */
import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';

import { computeFieldUsage } from './fieldUsage.js';

describe('computeFieldUsage', () => {
  it('I7: 空 viewConfig → 空 Map', () => {
    const usage = computeFieldUsage(buildViewConfig());
    expect(usage.size).toBe(0);
  });

  it('I1: rows 字段计入', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const usage = computeFieldUsage(vc);
    expect(usage.get('A')).toBe(1);
    expect(usage.get('B')).toBe(1);
  });

  it('I1: 同字段在 row 区出现 2 次 → 仍算 1', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'A', type: 'Dimension' },
      ],
    });
    expect(computeFieldUsage(vc).get('A')).toBe(1);
  });

  it('I3: values 同 measureName 多 aggregator 仍算 1', () => {
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales', aggregator: 'SUM' }),
        buildValueField({ measureName: 'sales', aggregator: 'AVG' }),
      ],
    });
    expect(computeFieldUsage(vc).get('sales')).toBe(1);
  });

  it('I4: 维度筛选 leaf', () => {
    const vc = buildViewConfig({
      filters: [{ kind: 'leaf', field: 'A', operator: 'In', value: ['x'] }],
    });
    expect(computeFieldUsage(vc).get('A')).toBe(1);
  });

  it('I4: 维度筛选 group 嵌套 leaf 全部计入', () => {
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'And',
          children: [
            { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
            { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
          ],
        },
      ],
    });
    const usage = computeFieldUsage(vc);
    expect(usage.get('A')).toBe(1);
    expect(usage.get('B')).toBe(1);
  });

  it('I5: 度量筛选 leaf', () => {
    const vc = buildViewConfig({
      measureFilters: [
        { kind: 'leaf', measureName: 'sales', operator: 'GreaterThan', value: 100 },
      ],
    });
    expect(computeFieldUsage(vc).get('sales')).toBe(1);
  });

  it('I5: 度量筛选 kind=undefined 老序列化兼容', () => {
    const vc = buildViewConfig({
      measureFilters: [
        { measureName: 'sales', operator: 'GreaterThan', value: 100 } as never,
      ],
    });
    expect(computeFieldUsage(vc).get('sales')).toBe(1);
  });

  it('I6: 跨 zone 累加 — A 在 row + filter → count=2', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      filters: [{ kind: 'leaf', field: 'A', operator: 'In', value: ['x'] }],
    });
    expect(computeFieldUsage(vc).get('A')).toBe(2);
  });

  it('I6: 4 zone 全用 → count=4', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      columns: [{ fieldName: 'A', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'A' })],
      filters: [{ kind: 'leaf', field: 'A', operator: 'Equals', value: 1 }],
    });
    expect(computeFieldUsage(vc).get('A')).toBe(4);
  });

  it('I7: 没出现的字段 → undefined(调用方按 0 处理)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
    });
    expect(computeFieldUsage(vc).get('Z')).toBeUndefined();
  });

  it('Hierarchy row 用 fieldName 而不是 level name(契约保持)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'shipRegion_h', drillDepth: 2 })],
    });
    expect(computeFieldUsage(vc).get('shipRegion_h')).toBe(1);
  });
});
