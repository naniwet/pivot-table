/**
 * removeFieldFromZone — 从 zone 中移除字段（× 按钮）
 */
import { describe, expect, it } from 'vitest';

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';

import { removeFieldFromZone } from './removeFieldFromZone.js';

describe('removeFieldFromZone', () => {
  it('removes from row zone by fieldName', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'h1' }), buildHierarchyRow({ fieldName: 'h2' })],
    });
    const after = removeFieldFromZone(before, 'row', 'h1');
    expect(after.rows.map((r) => r.fieldName)).toEqual(['h2']);
  });

  it('removes from column zone', () => {
    const before = buildViewConfig({
      columns: [
        { fieldName: 'c1', type: 'Dimension' },
        { fieldName: 'c2', type: 'Dimension' },
      ],
    });
    const after = removeFieldFromZone(before, 'column', 'c1');
    expect(after.columns.map((c) => c.fieldName)).toEqual(['c2']);
  });

  it('removes from value zone by measureName', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1' }), buildValueField({ measureName: 'm2' })],
    });
    const after = removeFieldFromZone(before, 'value', 'm1');
    expect(after.values.map((v) => v.measureName)).toEqual(['m2']);
  });

  // 2026-05-17:duplicate chip 精确删除 — value 区同 measure 多 chip
  //   chipIdx 优先 + 防御性 fallback(下沉自 useViewConfig.test.ts L641/661/767/783)
  describe('value zone chipIdx 精确删除', () => {
    it('chipIdx=1 + 合法 → 只删 idx 1 chip,保留 idx 0', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm1' }), // duplicate
        ],
      });
      const after = removeFieldFromZone(before, 'value', 'm1', 1);
      expect(after.values).toHaveLength(1);
      expect(after.values[0]).toBe(before.values[0]); // 同引用,只删第 2 个
    });

    it('chipIdx 缺省 → 老语义按 encoded name 删全部同 chipKey(向后兼容)', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm2' }),
        ],
      });
      const after = removeFieldFromZone(before, 'value', 'm1');
      expect(after.values.map((v) => v.measureName)).toEqual(['m2']);
    });

    it('chipIdx 越界 / stale → fallback 老语义删全部同 name', () => {
      const before = buildViewConfig({
        values: [
          buildValueField({ measureName: 'm1' }),
          buildValueField({ measureName: 'm2' }),
        ],
      });
      // chipIdx=1 但该位置是 m2,不是 m1 — stale,fallback 按 name 删
      const after = removeFieldFromZone(before, 'value', 'm1', 1);
      expect(after.values.map((v) => v.measureName)).toEqual(['m2']);
    });
  });

  it('is a no-op when fieldName not present', () => {
    const before = buildViewConfig({ rows: [buildHierarchyRow({ fieldName: 'h1' })] });
    const after = removeFieldFromZone(before, 'row', 'unknown');
    expect(after.rows).toEqual(before.rows);
  });

  it('removes leaf 维度筛选(filters)by fieldName', () => {
    const before = buildViewConfig({
      filters: [
        { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
        { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
      ],
    });
    const after = removeFieldFromZone(before, 'filter', 'A');
    expect(after.filters).toEqual([
      { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
    ]);
  });

  it('removes leaf 度量筛选(measureFilters)by measureName', () => {
    const before = buildViewConfig({
      measureFilters: [
        { kind: 'leaf', measureName: 'sales', operator: 'GreaterThan', value: 100 },
        { kind: 'leaf', measureName: 'cost', operator: 'GreaterThan', value: 50 },
      ],
    });
    const after = removeFieldFromZone(before, 'filter', 'sales');
    expect(after.measureFilters).toEqual([
      { kind: 'leaf', measureName: 'cost', operator: 'GreaterThan', value: 50 },
    ]);
  });

  it('维度筛选 group: 嵌套 leaf 命中 → 裁掉,空 group 一并清', () => {
    const before = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'And',
          children: [
            { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
            { kind: 'leaf', field: 'A', operator: 'Equals', value: 2 },
          ],
        },
      ],
    });
    // 整 group 全是 A leaf,删 A → 整 group 空 → 顶层数组也空
    const after = removeFieldFromZone(before, 'filter', 'A');
    expect(after.filters).toEqual([]);
  });

  it('维度筛选 group: 部分裁后 group 还有其他子 → 保留', () => {
    const before = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
            { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
          ],
        },
      ],
    });
    const after = removeFieldFromZone(before, 'filter', 'A');
    expect(after.filters).toEqual([
      {
        kind: 'group',
        op: 'Or',
        children: [
          { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
        ],
      },
    ]);
  });

  it('filter zone 找不到该 field → 不变(no-op 兜底)', () => {
    const before = buildViewConfig({
      filters: [{ kind: 'leaf', field: 'X', operator: 'Equals', value: 1 }],
    });
    const after = removeFieldFromZone(before, 'filter', 'unknown');
    expect(after).toEqual(before);
  });

  it('removing a measure also clears orphaned ByMeasure rowSorts', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1' }), buildValueField({ measureName: 'm2' })],
      rowSorts: [{ type: 'ByMeasure', measureName: 'm1', direction: 'DESC' }],
    });
    const after = removeFieldFromZone(before, 'value', 'm1');
    expect(after.values.map((v) => v.measureName)).toEqual(['m2']);
    expect(after.rowSorts).toEqual([]); // orphan sort 被清掉
  });

  it('removing a measure preserves rowSorts that reference other measures', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1' }), buildValueField({ measureName: 'm2' })],
      rowSorts: [{ type: 'ByMeasure', measureName: 'm2', direction: 'ASC' }],
    });
    const after = removeFieldFromZone(before, 'value', 'm1');
    expect(after.rowSorts).toHaveLength(1);
    expect(after.rowSorts[0]).toMatchObject({ measureName: 'm2', direction: 'ASC' });
  });

  it('also cleans columnSorts when removing a measure', () => {
    const before = buildViewConfig({
      values: [buildValueField({ measureName: 'm1' })],
      columnSorts: [{ type: 'ByMeasure', measureName: 'm1', direction: 'DESC' }],
    });
    const after = removeFieldFromZone(before, 'value', 'm1');
    expect(after.columnSorts).toEqual([]);
  });

  it('returns new ViewConfig (immutable)', () => {
    const before = buildViewConfig({ rows: [buildHierarchyRow({ fieldName: 'h1' })] });
    const after = removeFieldFromZone(before, 'row', 'h1');
    expect(after).not.toBe(before);
    expect(after.rows).not.toBe(before.rows);
  });
});
