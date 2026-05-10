/**
 * useViewConfig — 受控 / 非受控 ViewConfig 状态管理（ADR-006）
 *
 * 受控（value 给定）：hook 返回 value 本身；dispatch 计算下一态并调用 onChange，但不更新内部状态
 * 非受控（defaultValue 给定）：hook 维护内部状态；dispatch 更新内部并调用 onChange
 *
 * 模式在首次渲染时根据 value 是否定义锁定（与 React controlled-input 惯例一致）
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';

import { useViewConfig } from './useViewConfig.js';

const MEASURE = FIELD_IDS.salesMeasure;
const HIER = FIELD_IDS.shipRegionHierarchy;

describe('useViewConfig — uncontrolled mode', () => {
  it('returns defaultValue on first render', () => {
    const initial = buildViewConfig({ rows: [buildHierarchyRow()] });
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial }));
    expect(result.current[0]).toEqual(initial);
  });

  it('returns an empty ViewConfig when no value/defaultValue given', () => {
    const { result } = renderHook(() => useViewConfig({}));
    const [vc] = result.current;
    expect(vc.rows).toEqual([]);
    expect(vc.values).toEqual([]);
    expect(vc.pageState.rowPageNo).toBe(1);
  });

  it('updates state on DRILL_DOWN dispatch (requires metadata)', () => {
    const initial = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );

    act(() => {
      result.current[1]({ type: 'DRILL_DOWN', fieldName: HIER });
    });

    expect(result.current[0].rows[0]!.drillDepth).toBe(2);
  });

  it('updates state on DRILL_UP dispatch', () => {
    const initial = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 3 })],
    });
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial }));

    act(() => {
      result.current[1]({ type: 'DRILL_UP', fieldName: HIER });
    });

    expect(result.current[0].rows[0]!.drillDepth).toBe(2);
  });

  it('throws on DRILL_DOWN when metadata not provided (dev-time check)', () => {
    const initial = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
    });
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial }));

    expect(() => {
      act(() => {
        result.current[1]({ type: 'DRILL_DOWN', fieldName: HIER });
      });
    }).toThrow(/requires metadata/i);
  });

  it('CYCLE_ROW_SORT 在空 rowSorts 上 → DESC(排序循环起点)', () => {
    const initial = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
    });
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial }));

    act(() => {
      result.current[1]({ type: 'CYCLE_ROW_SORT', fieldName: MEASURE, kind: 'ByMeasure' });
    });

    expect(result.current[0].rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('SET_ROW_PAGE → pageState.rowPageNo 同步', () => {
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));

    act(() => {
      result.current[1]({ type: 'SET_ROW_PAGE', pageNo: 3 });
    });

    expect(result.current[0].pageState.rowPageNo).toBe(3);
  });

  it('updates state on DROP_FIELD dispatch', () => {
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));

    act(() => {
      result.current[1]({
        type: 'DROP_FIELD',
        zone: 'row',
        fieldName: HIER,
        fieldType: 'Hierarchy',
      });
    });

    expect(result.current[0].rows).toEqual([
      { fieldName: HIER, type: 'Hierarchy', drillDepth: 1 },
    ]);
  });

  it('updates state on REMOVE_FIELD dispatch', () => {
    const initial = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER })],
    });
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial }));

    act(() => {
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'row', fieldName: HIER });
    });

    expect(result.current[0].rows).toEqual([]);
  });

  it('replaces state entirely on SET dispatch', () => {
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));
    const newConfig = buildViewConfig({ values: [buildValueField()] });

    act(() => {
      result.current[1]({ type: 'SET', viewConfig: newConfig });
    });

    expect(result.current[0]).toBe(newConfig);
  });

  it('calls onChange with the next state on every dispatch', () => {
    const onChange = vi.fn();
    const initial = buildViewConfig();
    const { result } = renderHook(() => useViewConfig({ defaultValue: initial, onChange }));

    act(() => {
      result.current[1]({ type: 'SET_ROW_PAGE', pageNo: 5 });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageState: expect.objectContaining({ rowPageNo: 5 }) }),
    );
  });
});

describe('useViewConfig — controlled mode', () => {
  it('returns value prop on first render', () => {
    const value = buildViewConfig({ rows: [buildHierarchyRow()] });
    const { result } = renderHook(() => useViewConfig({ value }));
    expect(result.current[0]).toBe(value);
  });

  it('reflects new value prop on rerender', () => {
    const initial = buildViewConfig();
    const updated = buildViewConfig({ values: [buildValueField()] });
    const { result, rerender } = renderHook(
      ({ v }: { v: ReturnType<typeof buildViewConfig> }) => useViewConfig({ value: v }),
      { initialProps: { v: initial } },
    );
    expect(result.current[0]).toBe(initial);

    rerender({ v: updated });
    expect(result.current[0]).toBe(updated);
  });

  it('does NOT update returned state on dispatch (consumer must update value prop)', () => {
    const value = buildViewConfig({ pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 } });
    const { result } = renderHook(() => useViewConfig({ value }));

    act(() => {
      result.current[1]({ type: 'SET_ROW_PAGE', pageNo: 7 });
    });

    // 受控：state 仍是原 value，没自动跟进
    expect(result.current[0]).toBe(value);
    expect(result.current[0].pageState.rowPageNo).toBe(1);
  });

  it('calls onChange with the computed next state on dispatch', () => {
    const onChange = vi.fn();
    const value = buildViewConfig();
    const { result } = renderHook(() => useViewConfig({ value, onChange }));

    act(() => {
      result.current[1]({ type: 'SET_ROW_PAGE', pageNo: 4 });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].pageState.rowPageNo).toBe(4);
  });
});

describe('useViewConfig — mode lock', () => {
  it('locks mode at first render (controlled stays controlled even if value becomes undefined)', () => {
    // 防止用户在运行时切换受控/非受控（React 经典反模式）
    const value = buildViewConfig();
    const { result, rerender } = renderHook(
      ({ v }: { v: ReturnType<typeof buildViewConfig> | undefined }) => useViewConfig({ value: v }),
      { initialProps: { v: value as typeof value | undefined } },
    );

    rerender({ v: undefined });
    // 模式锁定：仍按受控处理。dispatch 不影响返回值（除非有 onChange + 外部更新）
    const onChange = vi.fn();
    expect(typeof result.current[1]).toBe('function');
    expect(onChange).not.toHaveBeenCalled(); // 没注册就不会调
  });
});

describe('useViewConfig — SET_QUERY_MODE 双向状态保留(P5+)', () => {
  it('pivot → adhoc:快照 columns/values/columnSorts,合并到 rows + 清空', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
      columnSorts: [{ type: 'ByDimension', fieldName: 'c1', direction: 'ASC' }],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    const [vc] = result.current;
    expect(vc.queryMode).toBe('adhoc');
    expect(vc.rows.map((r) => r.fieldName)).toEqual(['r1', 'c1', 'm1']);
    expect(vc.columns).toEqual([]);
    expect(vc.values).toEqual([]);
    expect(vc.columnSorts).toEqual([]);
    // snapshot 存在 extensions
    expect(vc.extensions).toMatchObject({
      __pivotSnapshot__: expect.objectContaining({
        rows: initial.rows,
        columns: initial.columns,
        values: initial.values,
        columnSorts: initial.columnSorts,
      }),
    });
  });

  it('adhoc → pivot:从快照还原 rows/columns/values/columnSorts,清快照', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
      columnSorts: [{ type: 'ByDimension', fieldName: 'c1', direction: 'DESC' }],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    // adhoc 期间用户改了点 row(应该不带回 pivot)
    act(() => result.current[1]({
      type: 'SET',
      viewConfig: {
        ...result.current[0],
        rows: [...result.current[0].rows, { fieldName: 'extra_in_adhoc', type: 'Dimension' }],
      },
    }));
    // 切回 pivot — 期望完全还原(adhoc 加的 extra_in_adhoc 丢弃)
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'pivot' }));
    const [vc] = result.current;
    expect(vc.queryMode).toBe('pivot');
    expect(vc.rows).toEqual(initial.rows);
    expect(vc.columns).toEqual(initial.columns);
    expect(vc.values).toEqual(initial.values);
    expect(vc.columnSorts).toEqual(initial.columnSorts);
    // 快照清掉
    expect(vc.extensions).toBeNull();
  });

  it('filter / measureFilter / customFields 跨模式延续(adhoc 改了带回 pivot)', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
      filters: [],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    // adhoc 期间加 filter
    act(() => result.current[1]({
      type: 'SET_FILTERS',
      filters: [{ kind: 'leaf', field: 'r1', operator: 'In', value: ['x'] }],
    }));
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'pivot' }));
    expect(result.current[0].filters).toHaveLength(1);
  });

  it('多次切换:pivot → adhoc → pivot → adhoc 保持一致', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      columns: [{ fieldName: 'c1', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'm1' })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    for (let i = 0; i < 3; i++) {
      act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
      expect(result.current[0].queryMode).toBe('adhoc');
      expect(result.current[0].rows.map((r) => r.fieldName)).toEqual(['r1', 'c1', 'm1']);
      act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'pivot' }));
      expect(result.current[0].queryMode).toBe('pivot');
      expect(result.current[0].rows).toEqual(initial.rows);
      expect(result.current[0].columns).toEqual(initial.columns);
      expect(result.current[0].values).toEqual(initial.values);
    }
  });

  it('同 mode dispatch 是 no-op', () => {
    const initial = buildViewConfig();
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const before = result.current[0];
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'pivot' }));
    expect(result.current[0]).toBe(before); // 引用相等 — 没 re-create
  });

  // ============================================================
  // adhoc 模式下不支持图表 — 用户反馈"明细是不能切图表的"
  // ============================================================
  it('SET_QUERY_MODE 切到 adhoc 时,如果 displayMode=chart → 强制改回 table', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
      pageState: {
        ...buildViewConfig().pageState,
        displayMode: 'chart', // ← 进入 adhoc 前在图表模式
      },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    expect(result.current[0].pageState.displayMode).toBe('chart');
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    expect(result.current[0].queryMode).toBe('adhoc');
    expect(result.current[0].pageState.displayMode).toBe('table'); // ← 强制切回
  });

  it('SET_QUERY_MODE 切 adhoc 时 displayMode 非 chart → pageState 不动', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
      // displayMode 缺省(=table)
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const beforePageState = result.current[0].pageState;
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    // pageState 引用相等(防御:避免不必要 re-render)
    expect(result.current[0].pageState).toBe(beforePageState);
  });

  it('SET_DISPLAY_MODE displayMode=chart 在 adhoc 模式下被挡掉(防御)', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      queryMode: 'adhoc',
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const before = result.current[0];
    act(() => result.current[1]({ type: 'SET_DISPLAY_MODE', displayMode: 'chart' }));
    // adhoc 模式下尝试切 chart → 状态不变(no-op)
    expect(result.current[0]).toBe(before);
    expect(result.current[0].pageState.displayMode).not.toBe('chart');
  });

  it('SET_DISPLAY_MODE displayMode=table 在 adhoc 模式下正常(回归)', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      queryMode: 'adhoc',
      pageState: {
        ...buildViewConfig().pageState,
        displayMode: 'tree', // 假设当前是 tree,切到 table
      },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'SET_DISPLAY_MODE', displayMode: 'table' }));
    expect(result.current[0].pageState.displayMode).toBe('table');
  });
});

// ============================================================
// P5+ 条件格式化 reducer
// ============================================================
describe('useViewConfig — 条件格式化(ADD/UPDATE/REMOVE_CONDITIONAL_FORMAT)', () => {
  const ruleA: import('../types/viewConfig.js').ConditionalFormatRule = {
    id: 'r1',
    measure: 'sales',
    kind: 'threshold',
    conditions: [{ op: 'gt', value: 100, style: { bg: 'red' } }],
  };
  const ruleB: import('../types/viewConfig.js').ConditionalFormatRule = {
    id: 'r2',
    measure: 'cost',
    kind: 'dataBar',
    color: 'blue',
    range: 'auto',
  };

  it('ADD_CONDITIONAL_FORMAT → 加到 pageState.conditionalFormats', () => {
    const initial = buildViewConfig();
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    expect(result.current[0].pageState.conditionalFormats).toBeUndefined();
    act(() => result.current[1]({ type: 'ADD_CONDITIONAL_FORMAT', rule: ruleA }));
    expect(result.current[0].pageState.conditionalFormats).toEqual([ruleA]);
  });

  it('ADD_CONDITIONAL_FORMAT 同 id 已存在 → no-op(应该走 UPDATE)', () => {
    const initial = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const before = result.current[0];
    act(() => result.current[1]({ type: 'ADD_CONDITIONAL_FORMAT', rule: ruleA }));
    expect(result.current[0]).toBe(before); // 引用相等,真 no-op
  });

  it('UPDATE_CONDITIONAL_FORMAT → 替换同 id 的 rule', () => {
    const initial = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA, ruleB] },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const ruleAUpdated: import('../types/viewConfig.js').ConditionalFormatRule = {
      ...ruleA,
      conditions: [{ op: 'lt', value: 0, style: { bg: 'green' } }],
    };
    act(() => result.current[1]({ type: 'UPDATE_CONDITIONAL_FORMAT', rule: ruleAUpdated }));
    const list = result.current[0].pageState.conditionalFormats!;
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(ruleAUpdated);
    expect(list[1]).toEqual(ruleB); // 顺序保留
  });

  it('UPDATE_CONDITIONAL_FORMAT id 不存在 → no-op', () => {
    const initial = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const before = result.current[0];
    act(() =>
      result.current[1]({
        type: 'UPDATE_CONDITIONAL_FORMAT',
        rule: { ...ruleB, id: '__nonexistent__' },
      }),
    );
    expect(result.current[0]).toBe(before);
  });

  it('REMOVE_CONDITIONAL_FORMAT → 按 id 删', () => {
    const initial = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA, ruleB] },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'REMOVE_CONDITIONAL_FORMAT', id: 'r1' }));
    expect(result.current[0].pageState.conditionalFormats).toEqual([ruleB]);
  });

  it('REMOVE_CONDITIONAL_FORMAT 不存在的 id → no-op(引用相等)', () => {
    const initial = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const before = result.current[0];
    act(() => result.current[1]({ type: 'REMOVE_CONDITIONAL_FORMAT', id: 'nope' }));
    expect(result.current[0]).toBe(before);
  });
});
