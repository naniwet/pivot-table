import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildViewConfig } from '../../fixtures/builders.js';

import { setFieldSubTotal } from './setFieldSubTotal.js';

describe('setFieldSubTotal — I1-I4', () => {
  it('I2: row zone 给 subTotal=SHOW → 该 field 被设置', () => {
    const state = buildViewConfig({
      rows: [
        { fieldName: 'r1', type: 'Dimension' },
        { fieldName: 'r2', type: 'Dimension' },
      ],
    });
    const next = setFieldSubTotal(state, 'row', 'r1', 'SHOW');
    expect(next.rows[0]).toEqual({ fieldName: 'r1', type: 'Dimension', subTotal: 'SHOW' });
    expect(next.rows[1]).toBe(state.rows[1]); // I4: 其他 field 引用相等
  });

  it('I2: 已有 subTotal → 覆盖', () => {
    const state = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension', subTotal: 'HIDDEN' }],
    });
    const next = setFieldSubTotal(state, 'row', 'r1', 'HIERARCHY_SHOW');
    expect(next.rows[0]).toMatchObject({ subTotal: 'HIERARCHY_SHOW' });
  });

  it('I3: subTotal=undefined → 彻底剔除字段(对象上无 subTotal key)', () => {
    const state = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension', subTotal: 'SHOW' }],
    });
    const next = setFieldSubTotal(state, 'row', 'r1', undefined);
    expect('subTotal' in next.rows[0]!).toBe(false);
    // 字段本身还在(只是没 subTotal 属性)
    expect(next.rows[0]).toEqual({ fieldName: 'r1', type: 'Dimension' });
  });

  it('I2: column zone 同 row 行为对称', () => {
    const state = buildViewConfig({
      columns: [
        { fieldName: 'c1', type: 'Dimension' },
        { fieldName: 'c2', type: 'Dimension' },
      ],
    });
    const next = setFieldSubTotal(state, 'column', 'c2', 'SHOW');
    expect(next.columns[0]).toBe(state.columns[0]);
    expect(next.columns[1]).toEqual({ fieldName: 'c2', type: 'Dimension', subTotal: 'SHOW' });
  });

  it('I4: row 操作不动 columns(反之亦然)', () => {
    const state = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
    });
    const next = setFieldSubTotal(state, 'row', 'r1', 'SHOW');
    expect(next.columns).toBe(state.columns); // 引用相等
  });

  it('I1: fieldName 不在 zone → 入参引用 (no-op)', () => {
    const state = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
    });
    expect(setFieldSubTotal(state, 'row', 'r__nope', 'SHOW')).toBe(state);
  });

  it('I2: Hierarchy 类型 row 也支持(同 fieldName 通用)', () => {
    const state = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'h1' })],
    });
    const next = setFieldSubTotal(state, 'row', 'h1', 'HIERARCHY_SHOW');
    expect(next.rows[0]).toMatchObject({ fieldName: 'h1', subTotal: 'HIERARCHY_SHOW' });
  });
});
