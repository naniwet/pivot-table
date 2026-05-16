/**
 * useFieldMenu 测试 —
 *   I1. fieldMenu=null → 空 items
 *   I2. pivot 模式 → 行/列/数值/筛选 + 维度类字段有"作为度量"submenu
 *   I3. adhoc 模式 → 只有行+筛选,无 column/value/作为度量
 *   I4. disabled 由 canDrop 决定
 *   I5. onClick → dispatch DROP_FIELD / ADD_DIMENSION_AS_VALUE
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';
import type { FieldContextMenuEvent } from '../components/FieldTree/FieldTree.js';

import type { UseFieldMenuOptions } from './useFieldMenu.js';
import { useFieldMenu } from './useFieldMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function menuEvent(overrides: Partial<FieldContextMenuEvent> = {}): FieldContextMenuEvent {
  return {
    fieldName: FIELD_IDS.provinceLevel,
    fieldType: 'Dimension',
    x: 100,
    y: 200,
    ...overrides,
  };
}

function render(overrides: Partial<UseFieldMenuOptions> = {}, isAdhoc = false) {
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useFieldMenu({
      fieldMenu: menuEvent(),
      isAdhoc,
      metaIndex,
      dispatch,
      ...overrides,
    }),
  );
  return { result, dispatch };
}

describe('useFieldMenu — guard', () => {
  it('I1: fieldMenu=null → 空 items', () => {
    const { result } = renderHook(() =>
      useFieldMenu({ fieldMenu: null, isAdhoc: false, metaIndex, dispatch: vi.fn() }),
    );
    expect(result.current).toEqual([]);
  });
});

describe('useFieldMenu — pivot 模式', () => {
  it('I2: Dimension 字段 → 行/列/数值/筛选 + separator + 作为度量 submenu', () => {
    const { result } = render({}, false);
    const items = result.current;
    const keys = items.map((i) => i.key);
    expect(keys).toContain('add-row');
    expect(keys).toContain('add-column');
    expect(keys).toContain('add-value');
    expect(keys).toContain('add-filter');
    expect(keys).toContain('sep-as-measure');
    expect(keys).toContain('as-measure');
  });

  it('I4: Dimension 字段 row 可拖 → add-row disabled=false', () => {
    const { result } = render({}, false);
    const addRow = result.current.find((i) => i.key === 'add-row')!;
    expect('disabled' in addRow && addRow.disabled).toBe(false);
  });

  it('I4: Dimension 字段 value 不可拖 → add-value disabled=true', () => {
    const { result } = render({}, false);
    const addValue = result.current.find((i) => i.key === 'add-value')!;
    expect('disabled' in addValue && addValue.disabled).toBe(true);
  });

  it('I2: Measure 字段(数值型)→ 无"作为度量"submenu', () => {
    const { result } = render({ fieldMenu: menuEvent({ fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure' }) }, false);
    const keys = result.current.map((i) => i.key);
    expect(keys).not.toContain('as-measure');
    expect(keys).not.toContain('sep-as-measure');
    // Measure can go to value (enabled)
    const addValue = result.current.find((i) => i.key === 'add-value')!;
    expect('disabled' in addValue && addValue.disabled).toBe(false);
  });

  it('I2: Hierarchy 字段 → "作为度量"submenu 含 applicableAggregators', () => {
    const { result } = render({ fieldMenu: menuEvent({ fieldName: FIELD_IDS.shipRegionHierarchy, fieldType: 'Hierarchy' }) }, false);
    const asMeasure = result.current.find((i) => i.key === 'as-measure')!;
    expect(asMeasure.children).toBeDefined();
    expect(asMeasure.children!.length).toBeGreaterThan(0);
    // STRING type → COUNT/COUNT_DISTINCT/FIRST/LAST/ATTR
    const childKeys = asMeasure.children!.map((c) => c.key);
    expect(childKeys).toContain('as-measure-COUNT');
    expect(childKeys).toContain('as-measure-COUNT_DISTINCT');
  });

  it('I5: 点"添加到行区"→ dispatch DROP_FIELD to row', () => {
    const { result, dispatch } = render({}, false);
    result.current.find((i) => i.key === 'add-row')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DROP_FIELD',
      zone: 'row',
      fieldName: FIELD_IDS.provinceLevel,
      fieldType: 'Dimension',
    });
  });

  it('I5: 点"添加到列区"→ dispatch DROP_FIELD to column', () => {
    const { result, dispatch } = render({}, false);
    result.current.find((i) => i.key === 'add-column')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DROP_FIELD',
      zone: 'column',
      fieldName: FIELD_IDS.provinceLevel,
      fieldType: 'Dimension',
    });
  });

  it('I5: 点"作为度量"子项 → dispatch ADD_DIMENSION_AS_VALUE', () => {
    const { result, dispatch } = render({}, false);
    const asMeasure = result.current.find((i) => i.key === 'as-measure')!;
    const countChild = asMeasure.children!.find((c) => c.key === 'as-measure-COUNT')!;
    countChild.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_DIMENSION_AS_VALUE',
      fieldName: FIELD_IDS.provinceLevel,
      aggregator: 'COUNT',
    });
  });
});

describe('useFieldMenu — adhoc 模式', () => {
  it('I3: adhoc → 只有行+筛选(无列/数值)', () => {
    const { result } = render({}, true);
    const keys = result.current.map((i) => i.key);
    expect(keys).toContain('add-row');
    expect(keys).toContain('add-filter');
    expect(keys).not.toContain('add-column');
    expect(keys).not.toContain('add-value');
  });

  it('I3: adhoc → 无"作为度量"submenu', () => {
    const { result } = render({}, true);
    const keys = result.current.map((i) => i.key);
    expect(keys).not.toContain('as-measure');
    expect(keys).not.toContain('sep-as-measure');
  });

  it('I4: adhoc 中 Measure 也可拖到 row(后端转 baseField)', () => {
    const { result } = render({ fieldMenu: menuEvent({ fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure' }) }, true);
    const addRow = result.current.find((i) => i.key === 'add-row')!;
    expect('disabled' in addRow && addRow.disabled).toBe(false);
  });
});

describe('useFieldMenu — CalcColumn as dimension-like', () => {
  it('CalcColumn 可走"作为度量"路径', () => {
    const { result } = render({ fieldMenu: menuEvent({ fieldName: 'calc_col_1', fieldType: 'CalcColumn' }) }, false);
    const asMeasure = result.current.find((i) => i.key === 'as-measure');
    expect(asMeasure).toBeDefined();
  });
});
