/**
 * togglePivotAdhoc — pivot ↔ adhoc 双向状态保留
 *
 * 不变量(I1-I6 跟实现一致):
 *   I1. 同 mode → 返回入参引用(no-op,避免无谓 re-render)
 *   I2. pivot → adhoc:rows = [rows, columns, values.measureName] 去重 + 跳 customField,
 *                     清 columns/values/columnSorts,存 snapshot
 *   I3. pivot → adhoc:displayMode='chart' → 强制 'table'(其他保持 pageState 引用相等)
 *   I4. adhoc → pivot:从 snapshot 还原,清 snapshot;无 snapshot → 只切 queryMode='pivot'
 *   I5. adhoc → pivot:adhoc 期间对 rows 的修改 NOT 带回
 *   I6. filters / measureFilters / customFields / rowSorts 跨模式延续(不在 snapshot)
 */
import { describe, expect, it } from 'vitest';

import { buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import { FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { CustomField, ViewConfig } from '../../types/viewConfig.js';

import { PIVOT_SNAPSHOT_KEY, togglePivotAdhoc } from './togglePivotAdhoc.js';

describe('togglePivotAdhoc — I1 同 mode no-op', () => {
  it('queryMode=pivot + mode=pivot → 返回入参引用', () => {
    const state = buildViewConfig({ queryMode: 'pivot' });
    expect(togglePivotAdhoc(state, 'pivot')).toBe(state);
  });

  it('queryMode 缺省(默认 pivot)+ mode=pivot → 返回入参引用', () => {
    const state = buildViewConfig();
    expect(togglePivotAdhoc(state, 'pivot')).toBe(state);
  });

  it('queryMode=adhoc + mode=adhoc → 返回入参引用', () => {
    const state = buildViewConfig({ queryMode: 'adhoc' });
    expect(togglePivotAdhoc(state, 'adhoc')).toBe(state);
  });
});

describe('togglePivotAdhoc — I2 pivot → adhoc snapshot + merge', () => {
  it('rows + columns + values 全 merge 到 rows;清 columns/values/columnSorts;存 snapshot', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
      columnSorts: [{ type: 'ByDimension', fieldName: 'c1', direction: 'ASC' }],
    });
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.queryMode).toBe('adhoc');
    expect(next.rows.map((r) => r.fieldName)).toEqual(['r1', 'c1', 'm1']);
    expect(next.columns).toEqual([]);
    expect(next.values).toEqual([]);
    expect(next.columnSorts).toEqual([]);
    expect(next.extensions).toMatchObject({
      [PIVOT_SNAPSHOT_KEY]: {
        rows: initial.rows,
        columns: initial.columns,
        values: initial.values,
        columnSorts: initial.columnSorts,
      },
    });
  });

  it('迁移 rows 时跳过 customFields(calc_column/enum_group/calc_measure)', () => {
    const customFields: CustomField[] = [
      {
        id: 'cc_unit_price',
        name: '均价',
        kind: 'calc_column',
        dataFormat: '0.00',
        expression: '[销售额]/[数量]',
        ast: null,
      },
      {
        id: 'eg_region',
        name: '自定义区域',
        kind: 'enum_group',
        baseField: 'ShipProvince2',
        groups: [],
        ungroupedHandling: 'show_individually',
      },
      {
        id: 'cm_profit_ratio',
        name: '利润率',
        kind: 'calc_measure',
        dataFormat: '0.00%',
        expression: '[销售额]/[成本]',
        ast: null,
      },
    ];
    const initial = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince2', type: 'Dimension' },
        { fieldName: 'cc_unit_price', type: 'Dimension' },
      ],
      columns: [
        { fieldName: 'eg_region', type: 'EnumGroup' },
        { fieldName: 'ProductCategory', type: 'Dimension' },
      ],
      values: [
        buildValueField({ measureName: 'cm_profit_ratio' }),
        buildValueField({ measureName: FIELD_IDS.salesMeasure }),
      ],
      customFields,
    });
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.rows.map((r) => r.fieldName)).toEqual([
      'ShipProvince2',
      'ProductCategory',
      FIELD_IDS.salesMeasure,
    ]);
  });

  it('rows 同 fieldName 重复 → 去重保第一次出现', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      // c1 跟 row 同名 + value m1 与已有同名:都该被去掉
      columns: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'r1' })],
    });
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.rows.map((r) => r.fieldName)).toEqual(['r1']);
  });
});

describe('togglePivotAdhoc — I3 displayMode chart 防御', () => {
  it('切 adhoc 时 displayMode=chart → 强制改回 table', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
      pageState: { ...buildViewConfig().pageState, displayMode: 'chart' },
    });
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.pageState.displayMode).toBe('table');
  });

  it('切 adhoc 时 displayMode 非 chart → pageState 引用相等(防无谓 re-render)', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const before = initial.pageState;
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.pageState).toBe(before);
  });
});

describe('togglePivotAdhoc — I4/I5 adhoc → pivot 还原快照', () => {
  it('有 snapshot → 还原 rows/columns/values/columnSorts;清 snapshot', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
      columnSorts: [{ type: 'ByDimension', fieldName: 'c1', direction: 'DESC' }],
    });
    const adhocState = togglePivotAdhoc(initial, 'adhoc');
    // 模拟 adhoc 期间用户改了 row(还原后应丢弃)
    const adhocEdited: ViewConfig = {
      ...adhocState,
      rows: [...adhocState.rows, { fieldName: 'extra_in_adhoc', type: 'Dimension' }],
    };
    const restored = togglePivotAdhoc(adhocEdited, 'pivot');
    expect(restored.queryMode).toBe('pivot');
    expect(restored.rows).toEqual(initial.rows); // I5: extra_in_adhoc 丢弃
    expect(restored.columns).toEqual(initial.columns);
    expect(restored.values).toEqual(initial.values);
    expect(restored.columnSorts).toEqual(initial.columnSorts);
    expect(restored.extensions).toBeNull();
  });

  it('无 snapshot → 只切 queryMode,其他不动(防御:意外进 adhoc 没快照)', () => {
    const state = buildViewConfig({
      queryMode: 'adhoc',
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      // extensions 不含 snapshot
    });
    const next = togglePivotAdhoc(state, 'pivot');
    expect(next.queryMode).toBe('pivot');
    expect(next.rows).toEqual(state.rows);
  });

  it('extensions 含 snapshot + 其他 key → 只清 snapshot,其他 key 保留', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
    });
    const adhocState = togglePivotAdhoc(initial, 'adhoc');
    // 注入第三方 extension key
    const withOther: ViewConfig = {
      ...adhocState,
      extensions: { ...adhocState.extensions, foo: 'bar' },
    };
    const restored = togglePivotAdhoc(withOther, 'pivot');
    expect(restored.extensions).toEqual({ foo: 'bar' });
  });
});

describe('togglePivotAdhoc — I6 filters / customFields / rowSorts 跨模式延续', () => {
  it('filters 在 pivot 加 → adhoc 还在', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
      filters: [{ kind: 'leaf', field: 'r1', operator: 'In', value: ['x'] }],
    });
    const next = togglePivotAdhoc(initial, 'adhoc');
    expect(next.filters).toEqual(initial.filters);
  });

  it('多次切换:pivot → adhoc → pivot → adhoc 保持一致', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
    });
    let state = initial;
    for (let i = 0; i < 3; i++) {
      state = togglePivotAdhoc(state, 'adhoc');
      expect(state.queryMode).toBe('adhoc');
      expect(state.rows.map((r) => r.fieldName)).toEqual(['r1', 'c1', 'm1']);
      state = togglePivotAdhoc(state, 'pivot');
      expect(state.queryMode).toBe('pivot');
      expect(state.rows).toEqual(initial.rows);
      expect(state.columns).toEqual(initial.columns);
      expect(state.values).toEqual(initial.values);
    }
  });
});
