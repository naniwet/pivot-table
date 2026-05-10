/**
 * applyDrop — 把"从字段树拖来的字段"放进目标 zone
 *
 * 不变量：
 *   I1. canDrop(fieldType, zone) === false → throw
 *   I2. 同一 fieldName 不能同时存在于多个 zone（rows/columns/values）
 *       → 落地时若该字段已在某 zone，先移除再加（语义化为"移动"）
 *   I3. 行/列字段类型映射：FieldType → RowColFieldType（Hierarchy 默认 drillDepth=1）
 *   I4. value 字段：fieldName → ValueField.measureName，aggregator/quickCalc 默认 null
 */
import { describe, expect, it } from 'vitest';

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';

import { applyDrop } from './applyDrop.js';

describe('applyDrop — happy paths', () => {
  it('drops Hierarchy into row zone with drillDepth=1 (top level only)', () => {
    const before = buildViewConfig();
    const after = applyDrop(before, 'row', 'custom1624587732438', 'Hierarchy');
    expect(after.rows).toEqual([
      { fieldName: 'custom1624587732438', type: 'Hierarchy', drillDepth: 1 },
    ]);
  });

  it('drops Dimension into row zone (no drillDepth)', () => {
    const before = buildViewConfig();
    const after = applyDrop(before, 'row', 'ShipProvince', 'Dimension');
    expect(after.rows).toEqual([{ fieldName: 'ShipProvince', type: 'Dimension' }]);
  });

  it('drops CalcGroup into column zone', () => {
    const before = buildViewConfig();
    const after = applyDrop(before, 'column', '城市分组', 'CalcGroup');
    expect(after.columns).toEqual([{ fieldName: '城市分组', type: 'CalcGroup' }]);
  });

  it('drops Measure into value zone with default aggregator/quickCalc', () => {
    const before = buildViewConfig();
    const after = applyDrop(before, 'value', '销售额_1624531356707', 'Measure');
    expect(after.values).toEqual([
      { measureName: '销售额_1624531356707', aggregator: null, quickCalc: null },
    ]);
  });

  it('appends to existing fields in zone (preserves order)', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'h1' })],
    });
    const after = applyDrop(before, 'row', 'h2', 'Hierarchy');
    expect(after.rows.map((r) => r.fieldName)).toEqual(['h1', 'h2']);
  });
});

describe('applyDrop — invariant I1: canDrop check', () => {
  it('throws when dropping Measure into row', () => {
    expect(() => applyDrop(buildViewConfig(), 'row', '销售额', 'Measure')).toThrow(
      /cannot drop Measure into row/i,
    );
  });

  it('throws when dropping Hierarchy into value', () => {
    expect(() => applyDrop(buildViewConfig(), 'value', 'h1', 'Hierarchy')).toThrow(
      /cannot drop Hierarchy into value/i,
    );
  });

  it('drops a Dimension into filter zone with placeholder ClientFilter (P1.0)', () => {
    const after = applyDrop(buildViewConfig(), 'filter', 'd1', 'Dimension');
    expect(after.filters).toEqual([
      { kind: 'leaf', field: 'd1', operator: 'In', value: [] },
    ]);
  });

  it('does not duplicate filter for the same field (idempotent)', () => {
    const before = applyDrop(buildViewConfig(), 'filter', 'd1', 'Dimension');
    const after = applyDrop(before, 'filter', 'd1', 'Dimension');
    expect(after.filters).toHaveLength(1);
  });

  it('drops a Measure into filter zone with placeholder MeasureFilter (P1.0)', () => {
    // P1.0：度量拖入 filter → measureFilters（top-N / 数值范围），与维度 filters 分开
    const after = applyDrop(buildViewConfig(), 'filter', 'sales', 'Measure');
    expect(after.measureFilters).toEqual([
      { measureName: 'sales', operator: 'GreaterThan', value: '' },
    ]);
    expect(after.filters).toEqual([]);
  });

  it('does not duplicate measureFilter for the same measure (idempotent)', () => {
    const before = applyDrop(buildViewConfig(), 'filter', 'sales', 'Measure');
    const after = applyDrop(before, 'filter', 'sales', 'Measure');
    expect(after.measureFilters).toHaveLength(1);
  });

  it('drops a NamedSet into row zone (P1.5 开放)', () => {
    const after = applyDrop(buildViewConfig(), 'row', 'ns1', 'NamedSet');
    expect(after.rows).toEqual([{ fieldName: 'ns1', type: 'NamedSet' }]);
  });
});

describe('applyDrop — invariant I2: auto-move when field already in another zone', () => {
  it('moves Hierarchy from row to column when dropped onto column', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'h1' })],
    });
    const after = applyDrop(before, 'column', 'h1', 'Hierarchy');
    expect(after.rows).toEqual([]);
    expect(after.columns).toEqual([
      { fieldName: 'h1', type: 'Hierarchy', drillDepth: 1 },
    ]);
  });

  it('P3+ value zone 同 measure 重复拖入 → APPEND(允许多 chip,可分别切换聚合)', () => {
    const before = buildViewConfig({ values: [buildValueField({ measureName: 'm1' })] });
    const after = applyDrop(before, 'value', 'm1', 'Measure');
    // 现在 2 项,base measureName 相同,各自独立(后续可右键改 aggregator)
    expect(after.values).toHaveLength(2);
    expect(after.values.every((v) => v.measureName === 'm1')).toBe(true);
  });

  it('P3+ value chip 内部 reorder(sourceZone="value" + chipKey)→ 移动该 chip,不复制', () => {
    const before = buildViewConfig({
      values: [
        buildValueField({ measureName: 'm1' }),
        buildValueField({ measureName: 'm2' }),
        buildValueField({ measureName: 'm3' }),
      ],
    });
    // 把 m1 拖到 idx=2 — sourceZone=value + chipKey 触发 reorder
    const after = applyDrop(before, 'value', 'm1', 'Measure', 2, {
      sourceZone: 'value',
      chipKey: 'm1', // 默认 aggregator/quickCalc → encoded name = base
    });
    expect(after.values.map((v) => v.measureName)).toEqual(['m2', 'm1', 'm3']);
  });

  it('preserves siblings in source zone when moving', () => {
    const before = buildViewConfig({
      rows: [
        buildHierarchyRow({ fieldName: 'h1' }),
        buildHierarchyRow({ fieldName: 'h2' }),
      ],
    });
    const after = applyDrop(before, 'column', 'h1', 'Hierarchy');
    expect(after.rows.map((r) => r.fieldName)).toEqual(['h2']);
    expect(after.columns.map((c) => c.fieldName)).toEqual(['h1']);
  });
});

describe('applyDrop — immutability', () => {
  it('returns new ViewConfig (does not mutate input)', () => {
    const before = buildViewConfig();
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = applyDrop(before, 'row', 'h1', 'Hierarchy');
    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);
  });
});

describe('applyDrop — insertIdx (拖拽 reorder)', () => {
  it('insertIdx=0 → 字段插入到 zone 最前', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const after = applyDrop(before, 'row', 'C', 'Dimension', 0);
    expect(after.rows.map((r) => r.fieldName)).toEqual(['C', 'A', 'B']);
  });

  it('insertIdx=1 → 字段插入到中间', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const after = applyDrop(before, 'row', 'C', 'Dimension', 1);
    expect(after.rows.map((r) => r.fieldName)).toEqual(['A', 'C', 'B']);
  });

  it('insertIdx=undefined → append 末尾(向后兼容)', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const after = applyDrop(before, 'row', 'C', 'Dimension');
    expect(after.rows.map((r) => r.fieldName)).toEqual(['A', 'B', 'C']);
  });

  it('同 zone 内 reorder:把 A(idx=0)拖到 idx=2 → 最终在 idx=1(因 remove 后元素左移)', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
        { fieldName: 'C', type: 'Dimension' },
      ],
    });
    // 用户感知:把 A 放到 B/C 之间(用户看到的 idx=2)— 实际经过 remove A 后 [B,C] 的 idx 1
    const after = applyDrop(before, 'row', 'A', 'Dimension', 2);
    expect(after.rows.map((r) => r.fieldName)).toEqual(['B', 'A', 'C']);
  });

  it('同 zone 内 reorder:把 C(idx=2)拖到 idx=0 → 最前(无偏移)', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
        { fieldName: 'C', type: 'Dimension' },
      ],
    });
    const after = applyDrop(before, 'row', 'C', 'Dimension', 0);
    expect(after.rows.map((r) => r.fieldName)).toEqual(['C', 'A', 'B']);
  });

  it('value zone insertIdx 同样工作', () => {
    const before = buildViewConfig({
      values: [
        buildValueField({ measureName: 'M1' }),
        buildValueField({ measureName: 'M2' }),
      ],
    });
    const after = applyDrop(before, 'value', 'M3', 'Measure', 1);
    expect(after.values.map((v) => v.measureName)).toEqual(['M1', 'M3', 'M2']);
  });
});
