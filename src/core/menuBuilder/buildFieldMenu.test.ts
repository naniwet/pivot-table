/**
 * buildFieldMenuItems 测试 — I1-I5 不变量(从 useFieldMenu.test.ts 下沉)
 */
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import { buildFieldMenuItems } from './buildFieldMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function defaultCallbacks() {
  return { onAddToZone: vi.fn(), onAddAsMeasure: vi.fn() };
}

describe('buildFieldMenuItems — I1/I3 pivot 模式 + Dimension', () => {
  it('I1/I3: Dimension 字段 → 行/列/数值/筛选 + separator + "作为度量" submenu', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    const keys = items.map((i) => i.key);
    expect(keys).toContain('add-row');
    expect(keys).toContain('add-column');
    expect(keys).toContain('add-value');
    expect(keys).toContain('add-filter');
    expect(keys).toContain('sep-as-measure');
    expect(keys).toContain('as-measure');
  });

  it('I2: Dimension row 可拖 → add-row disabled=false', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    const addRow = items.find((i) => i.key === 'add-row')!;
    expect('disabled' in addRow && addRow.disabled).toBe(false);
  });

  it('I2: Dimension value 不可拖 → add-value disabled=true', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    const addValue = items.find((i) => i.key === 'add-value')!;
    expect('disabled' in addValue && addValue.disabled).toBe(true);
  });
});

describe('buildFieldMenuItems — I5 Measure 不渲染"作为度量"', () => {
  it('Measure 字段(数值型)→ 无 "作为度量" submenu', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain('as-measure');
    expect(keys).not.toContain('sep-as-measure');
    const addValue = items.find((i) => i.key === 'add-value')!;
    expect('disabled' in addValue && addValue.disabled).toBe(false);
  });
});

describe('buildFieldMenuItems — I3 Hierarchy + applicableAggregators', () => {
  it('Hierarchy 字段 → "作为度量" submenu 含 applicableAggregators', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.shipRegionHierarchy, fieldType: 'Hierarchy', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    const asMeasure = items.find((i) => i.key === 'as-measure')!;
    expect(asMeasure.children).toBeDefined();
    expect(asMeasure.children!.length).toBeGreaterThan(0);
    // STRING type → COUNT/COUNT_DISTINCT 等
    const childKeys = asMeasure.children!.map((c) => c.key);
    expect(childKeys).toContain('as-measure-COUNT');
    expect(childKeys).toContain('as-measure-COUNT_DISTINCT');
  });

  it('CalcColumn 也算维度类 → 有 "作为度量" submenu', () => {
    const items = buildFieldMenuItems(
      { fieldName: 'calc_col_1', fieldType: 'CalcColumn', isAdhoc: false, metaIndex },
      defaultCallbacks(),
    );
    expect(items.find((i) => i.key === 'as-measure')).toBeDefined();
  });
});

describe('buildFieldMenuItems — onClick → callbacks 调用 wiring', () => {
  it('点 add-row → onAddToZone("row") 被调', () => {
    const cbs = defaultCallbacks();
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      cbs,
    );
    items.find((i) => i.key === 'add-row')!.onClick!();
    expect(cbs.onAddToZone).toHaveBeenCalledWith('row');
  });

  it('点 add-column → onAddToZone("column") 被调', () => {
    const cbs = defaultCallbacks();
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      cbs,
    );
    items.find((i) => i.key === 'add-column')!.onClick!();
    expect(cbs.onAddToZone).toHaveBeenCalledWith('column');
  });

  it('点 "作为度量" 子项 → onAddAsMeasure(agg) 被调', () => {
    const cbs = defaultCallbacks();
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: false, metaIndex },
      cbs,
    );
    const asMeasure = items.find((i) => i.key === 'as-measure')!;
    const countChild = asMeasure.children!.find((c) => c.key === 'as-measure-COUNT')!;
    countChild.onClick!();
    expect(cbs.onAddAsMeasure).toHaveBeenCalledWith('COUNT');
  });
});

describe('buildFieldMenuItems — I1/I4 adhoc 模式', () => {
  it('I1: adhoc → 只有 row + filter(无 column / value)', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: true, metaIndex },
      defaultCallbacks(),
    );
    const keys = items.map((i) => i.key);
    expect(keys).toContain('add-row');
    expect(keys).toContain('add-filter');
    expect(keys).not.toContain('add-column');
    expect(keys).not.toContain('add-value');
  });

  it('I4: adhoc → 无 "作为度量" submenu', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', isAdhoc: true, metaIndex },
      defaultCallbacks(),
    );
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain('as-measure');
    expect(keys).not.toContain('sep-as-measure');
  });

  it('adhoc + Measure 也可拖到 row(后端转 baseField)', () => {
    const items = buildFieldMenuItems(
      { fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure', isAdhoc: true, metaIndex },
      defaultCallbacks(),
    );
    const addRow = items.find((i) => i.key === 'add-row')!;
    expect('disabled' in addRow && addRow.disabled).toBe(false);
  });
});
