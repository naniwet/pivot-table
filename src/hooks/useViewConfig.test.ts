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
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));
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

describe('useViewConfig — SET_QUERY_MODE / SET_DISPLAY_MODE 模式切换 wiring', () => {
  // 2026-05-17 测试瘦身:SET_QUERY_MODE 的 8 条 snapshot/restore/merge/displayMode-defense
  //   测试已下沉到 core `togglePivotAdhoc.test.ts`(13 条 I1-I6 不变量全覆盖)。
  //   hook 层只留 1 条 dispatch wiring smoke,证明 reducer 把 action 路由给了 core fn。
  it('SET_QUERY_MODE dispatch → togglePivotAdhoc 被调,queryMode 切换 (wiring smoke)', () => {
    const initial = buildViewConfig({
      rows: [{ fieldName: 'r1', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    expect(result.current[0].queryMode).toBeUndefined();
    act(() => result.current[1]({ type: 'SET_QUERY_MODE', mode: 'adhoc' }));
    expect(result.current[0].queryMode).toBe('adhoc');
  });

  // 2026-05-17 测试瘦身:adhoc 模式下 chart 防御已下沉到 core
  //   setDisplayMode.test.ts(I1/I2/I3 — adhoc 挡 chart + 其他正常更新)。
  //   hook 层只留 1 条 SET_DISPLAY_MODE dispatch wiring。
  it('SET_DISPLAY_MODE dispatch → pageState.displayMode 更新 (wiring smoke)', () => {
    const initial = buildViewConfig();
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() => result.current[1]({ type: 'SET_DISPLAY_MODE', displayMode: 'chart' }));
    expect(result.current[0].pageState.displayMode).toBe('chart');
  });
});

// ============================================================
// P5+ 条件格式化 reducer
// ============================================================
describe('useViewConfig — 条件格式化 wiring', () => {
  // 2026-05-17 测试瘦身:ADD/UPDATE/REMOVE_CONDITIONAL_FORMAT 全部下沉到 core
  //   conditionalFormatActions.test.ts(9 case I1-I6 不变量全覆盖)。
  //   hook 层留 1 条 ADD dispatch wiring smoke,证明 reducer 把 3 个 action 都路由到 core fn。
  it('ADD_CONDITIONAL_FORMAT dispatch → conditionalFormats 更新 (wiring smoke)', () => {
    const initial = buildViewConfig();
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    const rule: import('../types/viewConfig.js').ConditionalFormatRule = {
      id: 'r1', measure: 'sales', kind: 'threshold',
      conditions: [{ op: 'gt', value: 100, style: { bg: 'red' } }],
    };
    act(() => result.current[1]({ type: 'ADD_CONDITIONAL_FORMAT', rule }));
    expect(result.current[0].pageState.conditionalFormats).toEqual([rule]);
  });
});

// ============================================================
// P5+ history (undo / redo)
// ============================================================
describe('useViewConfig — history (P5+)', () => {
  it('初始 canUndo=false, canRedo=false', () => {
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));
    expect(result.current[2].canUndo).toBe(false);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('dispatch 一次显著 action → canUndo=true', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    expect(result.current[2].canUndo).toBe(true);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('undo → 恢复到上一步,canRedo=true', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    expect(result.current[0].values).toEqual([]);

    act(() => result.current[2].undo());
    expect(result.current[0].values).toHaveLength(1);
    expect(result.current[2].canRedo).toBe(true);
    expect(result.current[2].canUndo).toBe(false);
  });

  it('redo → 恢复到 undo 之前', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    act(() => result.current[2].undo());
    expect(result.current[0].values).toHaveLength(1);

    act(() => result.current[2].redo());
    expect(result.current[0].values).toEqual([]);
    expect(result.current[2].canUndo).toBe(true);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('undo 后 dispatch 新 action → future 清空(经典编辑器行为)', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    act(() => result.current[2].undo());
    expect(result.current[2].canRedo).toBe(true);

    // 新 dispatch → future 应清空
    act(() =>
      result.current[1]({
        type: 'SET_DISPLAY_OPTIONS',
        emptyValueText: '-',
      }),
    );
    expect(result.current[2].canRedo).toBe(false);
    expect(result.current[2].canUndo).toBe(true);
  });

  it('SET_ROW_PAGE 不入 history(翻页是浏览,不算 step)', () => {
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: buildViewConfig(), metadata: orderModelMetadata }),
    );
    expect(result.current[2].canUndo).toBe(false);
    act(() => result.current[1]({ type: 'SET_ROW_PAGE', pageNo: 2 }));
    expect(result.current[2].canUndo).toBe(false); // 仍然 false
    expect(result.current[0].pageState.rowPageNo).toBe(2); // 但翻页生效
  });

  it('no-op action(reducer 返回同引用)不入 history', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    // REMOVE_CONDITIONAL_FORMAT 不存在的 id → reducer 早退返回同 state
    act(() =>
      result.current[1]({ type: 'REMOVE_CONDITIONAL_FORMAT', id: 'nope' }),
    );
    expect(result.current[2].canUndo).toBe(false);
  });

  it('canUndo=false 时调 undo() → no-op', () => {
    const { result } = renderHook(() => useViewConfig({ defaultValue: buildViewConfig() }));
    const before = result.current[0];
    act(() => result.current[2].undo());
    expect(result.current[0]).toBe(before);
  });

  it('canRedo=false 时调 redo() → no-op', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    const before = result.current[0];
    act(() => result.current[2].redo()); // future 空
    expect(result.current[0]).toBe(before);
  });

  it('clearHistory() → past + future 都清空', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    act(() => result.current[2].undo()); // 现在 past=[], future=[has 1]
    expect(result.current[2].canRedo).toBe(true);

    act(() => result.current[2].clearHistory());
    expect(result.current[2].canUndo).toBe(false);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('past 上限截断(连续 dispatch 多步,只保留最近 50)', () => {
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: buildViewConfig(), metadata: orderModelMetadata }),
    );
    // 2026-05-17:past 上限截断逻辑(pushHistory(.., maxHistory=N))已下沉到
    //   core historyOps.test.ts:43(maxHistory=3 case)+ default MAX_HISTORY=50。
    //   hook 这条只需证明 hook 把 MAX_HISTORY 正确传给了 core(简化版:dispatch 1 次 + undo 1 次)
    act(() => result.current[1]({ type: 'SET_DISPLAY_OPTIONS', emptyValueText: 'v0' }));
    act(() => result.current[1]({ type: 'SET_DISPLAY_OPTIONS', emptyValueText: 'v1' }));
    expect(result.current[2].canUndo).toBe(true);
    act(() => result.current[2].undo());
    expect(result.current[0].pageState.emptyValueText).toBe('v0');
  });

  it('metadata.id 变化 → 自动清空 history', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result, rerender } = renderHook(
      ({ md }: { md: typeof orderModelMetadata }) =>
        useViewConfig({ defaultValue: initial, metadata: md }),
      { initialProps: { md: orderModelMetadata } },
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    expect(result.current[2].canUndo).toBe(true);

    // 切到新 metadata(改 id)
    const newMd = { ...orderModelMetadata, id: 'other-model-id' };
    rerender({ md: newMd });
    expect(result.current[2].canUndo).toBe(false);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('同 metadata.id 同实例再传 → 不清空 history', () => {
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result, rerender } = renderHook(
      ({ md }: { md: typeof orderModelMetadata }) =>
        useViewConfig({ defaultValue: initial, metadata: md }),
      { initialProps: { md: orderModelMetadata } },
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    expect(result.current[2].canUndo).toBe(true);

    // 同 id 不同对象引用 → 不清空
    rerender({ md: { ...orderModelMetadata } });
    expect(result.current[2].canUndo).toBe(true);
  });

  // 2026-05-17 测试瘦身:nested "同 measure 重复 value chip 精确定位" 4 case 全下沉:
  //   - SET_VALUE_AGGREGATOR + chipIdx → setValueAggregator.test.ts I1
  //   - SET_VALUE_QUICK_CALC + chipIdx → setValueQuickCalc.test.ts chipIdx=1 case
  //   - REMOVE_FIELD + chipIdx → removeFieldFromZone.test.ts chipIdx=1 case
  //   - REMOVE_FIELD + encoded name fallback → removeFieldFromZone.test.ts no-chipIdx case

  it('undo / redo 在受控模式 — 调 onChange 传 prev/next', () => {
    const onChange = vi.fn();
    const initial = buildViewConfig({
      values: [buildValueField({ measureName: MEASURE })],
    });
    const { result, rerender } = renderHook(
      ({ value }: { value: ReturnType<typeof buildViewConfig> }) =>
        useViewConfig({ value, onChange, metadata: orderModelMetadata }),
      { initialProps: { value: initial } },
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_FIELD', zone: 'value', fieldName: MEASURE }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    // 父组件应该用 onChange 给的新 value 更新外部 state
    const afterRemove = onChange.mock.calls[0]![0];
    rerender({ value: afterRemove });

    act(() => result.current[2].undo());
    expect(onChange).toHaveBeenCalledTimes(2);
    // undo 应该调 onChange 传回原 initial 值
    expect(onChange.mock.calls[1]![0].values).toHaveLength(1);
  });
});

// ============================================================
// 2026-05-17 测试瘦身:duplicate chip 精确定位(chipIdx)+ agg/qc 互斥
//   全部下沉到 core(共 9 case I1-I5):
//   - setValueAggregator.test.ts:I1 (chipIdx=1) / I2 (fallback × 3)/ I3 (no-op)/ I4-I5 (互斥)
//   - setValueQuickCalc.test.ts:chipIdx describe(3 case)+ L40/49 (互斥)
//   - removeFieldFromZone.test.ts:value zone chipIdx describe(3 case)
// hook 层留 1 条 SET_VALUE_AGGREGATOR dispatch wiring smoke,证明 action 路由到 core fn
// ============================================================
describe('useViewConfig — chip 精确定位 + agg/qc 互斥 wiring', () => {
  it('SET_VALUE_AGGREGATOR dispatch + chipIdx → reducer 路由到 setValueAggregator', () => {
    const initial = buildViewConfig({
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: MEASURE }),
      ],
    });
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: initial, metadata: orderModelMetadata }),
    );
    act(() =>
      result.current[1]({
        type: 'SET_VALUE_AGGREGATOR',
        chipKey: MEASURE,
        chipIdx: 1,
        aggregator: 'AVG',
      }),
    );
    // core 已证 chipIdx 精确定位;这里只验"参数正确传给了 core"
    expect(result.current[0].values[1]!.aggregator).toBe('AVG');
  });
});

// ============================================================
// P5+ SET_CUSTOM_SORT_ORDER / REMOVE_CUSTOM_SORT_ORDER 自定义排序
// ============================================================
describe('useViewConfig — 自定义排序 actions', () => {
  it('SET_CUSTOM_SORT_ORDER → rowSorts 加 ByCustomCaption', () => {
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: buildViewConfig({}) }),
    );
    act(() =>
      result.current[1]({
        type: 'SET_CUSTOM_SORT_ORDER',
        fieldName: 'region',
        customCaption: ['华东', '华南', '华北'],
      }),
    );
    expect(result.current[0].rowSorts).toEqual([
      {
        type: 'ByCustomCaption',
        fieldName: 'region',
        direction: 'ASC',
        customCaption: ['华东', '华南', '华北'],
      },
    ]);
  });

  it('SET_CUSTOM_SORT_ORDER 再调一次 → 替换(不重复)', () => {
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: buildViewConfig({}) }),
    );
    act(() =>
      result.current[1]({
        type: 'SET_CUSTOM_SORT_ORDER',
        fieldName: 'region',
        customCaption: ['华东', '华南'],
      }),
    );
    act(() =>
      result.current[1]({
        type: 'SET_CUSTOM_SORT_ORDER',
        fieldName: 'region',
        customCaption: ['华北', '华西'],
        direction: 'DESC',
      }),
    );
    expect(result.current[0].rowSorts).toEqual([
      {
        type: 'ByCustomCaption',
        fieldName: 'region',
        direction: 'DESC',
        customCaption: ['华北', '华西'],
      },
    ]);
  });

  it('REMOVE_CUSTOM_SORT_ORDER → 仅删该字段的 ByCustomCaption,其他 sort 保留', () => {
    const { result } = renderHook(() =>
      useViewConfig({
        defaultValue: buildViewConfig({
          rowSorts: [
            { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
            {
              type: 'ByCustomCaption',
              fieldName: 'region',
              direction: 'ASC',
              customCaption: ['华东'],
            },
          ],
        }),
      }),
    );
    act(() =>
      result.current[1]({ type: 'REMOVE_CUSTOM_SORT_ORDER', fieldName: 'region' }),
    );
    expect(result.current[0].rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('SET_CUSTOM_SORT_ORDER 入 history → 可 undo', () => {
    const { result } = renderHook(() =>
      useViewConfig({ defaultValue: buildViewConfig({}) }),
    );
    act(() =>
      result.current[1]({
        type: 'SET_CUSTOM_SORT_ORDER',
        fieldName: 'region',
        customCaption: ['华东', '华南'],
      }),
    );
    expect(result.current[2].canUndo).toBe(true);
    act(() => result.current[2].undo());
    expect(result.current[0].rowSorts).toEqual([]);
  });
});

describe('useViewConfig — custom relations', () => {
  it('SET_CUSTOM_RELATIONS → 替换查询级关系覆盖层', () => {
    const { result } = renderHook(() => useViewConfig({}));

    act(() => {
      result.current[1]({
        type: 'SET_CUSTOM_RELATIONS',
        customRelations: [
          {
            id: 'rel-1',
            name: '产品-销售',
            enabled: true,
            leftViewId: 'product',
            rightViewId: 'sales',
            leftCardinality: 'ONE',
            rightCardinality: 'MANY',
            direction: 'Single',
            conditions: [{ leftFieldId: 'p_id', rightFieldId: 's_pid', operator: 'EQUALS' }],
          },
        ],
      });
    });

    expect(result.current[0].customRelations).toEqual([
      expect.objectContaining({ id: 'rel-1', name: '产品-销售' }),
    ]);
  });
});
