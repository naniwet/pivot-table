/**
 * useCustomFieldEditor — 自建字段编辑流程的 UI state 集合
 *
 * 不变量(本测试钉的契约):
 *   I1. 初始 state:editorOpen=null, baseFieldPicker=null, baseFieldSearch=''
 *   I2. openBasePicker(kind) → baseFieldPicker={kind} + 清 search
 *   I3. pickBaseField → editorOpen={kind, baseField, baseFieldAlias} + 关 picker + 清 search
 *   I4. openExpressionEditor(initial?) → editorOpen={kind:'expr', initialField}(initial 可空)
 *   I5. openExistingEditor 路由(cf.kind 决定开哪个 modal):
 *       - calc_measure / calc_column → expr editor
 *       - enum_group / range_group   → enum/range editor with baseField
 *       - dim_as_measure             → no-op(UI 暂无独立编辑器)
 *   I6. closeAll → 全部 state 重置
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CustomField } from '../types/viewConfig.js';

import { useCustomFieldEditor } from './useCustomFieldEditor.js';

const calcMeasureCf: CustomField = {
  id: 'cm1',
  name: '利润率',
  kind: 'calc_measure',
  dataFormat: '百分比',
  expression: '[a]/[b]',
  ast: null,
};

const calcColumnCf: CustomField = {
  id: 'cc1',
  name: '均价',
  kind: 'calc_column',
  dataFormat: '#,##0.00',
  expression: '[销售额]/[数量]',
  ast: null,
};

const enumGroupCf: CustomField = {
  id: 'eg1',
  name: '区域分组',
  kind: 'enum_group',
  baseField: 'ShipProvince',
  groups: [],
  ungroupedHandling: 'show_individually',
};

const rangeGroupCf: CustomField = {
  id: 'rg1',
  name: '价格分段',
  kind: 'range_group',
  baseField: 'UnitPrice',
  ranges: [],
};

const dimAsMeasureCf: CustomField = {
  id: 'dam1',
  name: '销售员(COUNT_DISTINCT)',
  kind: 'dim_as_measure',
  sourceField: '销售员',
  aggregator: 'COUNT_DISTINCT',
  dataFormat: '',
};

describe('useCustomFieldEditor', () => {
  it('I1: 初始 state — editor/picker null, search 空串', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    expect(result.current.editorOpen).toBeNull();
    expect(result.current.baseFieldPicker).toBeNull();
    expect(result.current.baseFieldSearch).toBe('');
  });

  it('I2: openBasePicker(kind) → picker 打开,search 清空', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    // 先脏一下 search 验证清空效果
    act(() => result.current.setBaseFieldSearch('foo'));
    expect(result.current.baseFieldSearch).toBe('foo');
    act(() => result.current.openBasePicker('enum'));
    expect(result.current.baseFieldPicker).toEqual({ kind: 'enum' });
    expect(result.current.baseFieldSearch).toBe('');
  });

  it('I2: openBasePicker 切 kind(enum → range)', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => result.current.openBasePicker('enum'));
    expect(result.current.baseFieldPicker?.kind).toBe('enum');
    act(() => result.current.openBasePicker('range'));
    expect(result.current.baseFieldPicker?.kind).toBe('range');
  });

  it('I3: pickBaseField → editorOpen 设上,picker 关,search 清', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => result.current.openBasePicker('enum'));
    act(() => result.current.setBaseFieldSearch('province'));
    act(() => result.current.pickBaseField('enum', 'ShipProvince', '省份'));
    expect(result.current.editorOpen).toEqual({
      kind: 'enum',
      baseField: 'ShipProvince',
      baseFieldAlias: '省份',
    });
    expect(result.current.baseFieldPicker).toBeNull();
    expect(result.current.baseFieldSearch).toBe('');
  });

  it('I4: openExpressionEditor 不带 initial → 新建模式', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => result.current.openExpressionEditor());
    expect(result.current.editorOpen).toEqual({ kind: 'expr', initialField: undefined });
  });

  it('I4: openExpressionEditor 带 initial → 编辑模式', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => result.current.openExpressionEditor(calcMeasureCf));
    expect(result.current.editorOpen).toEqual({
      kind: 'expr',
      initialField: calcMeasureCf,
    });
  });

  // ============================================================
  // I5: openExistingEditor 按 cf.kind 路由
  // ============================================================
  describe('I5: openExistingEditor 按 cf.kind 路由', () => {
    it('calc_measure → expr editor', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(calcMeasureCf));
      expect(result.current.editorOpen).toEqual({
        kind: 'expr',
        initialField: calcMeasureCf,
      });
    });

    it('calc_column → expr editor(共享同一个 modal,内部按 kind 切表单)', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(calcColumnCf));
      expect(result.current.editorOpen).toEqual({
        kind: 'expr',
        initialField: calcColumnCf,
      });
    });

    it('enum_group → enum editor 带 baseField', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(enumGroupCf, '省份'));
      expect(result.current.editorOpen).toEqual({
        kind: 'enum',
        initialField: enumGroupCf,
        baseField: 'ShipProvince',
        baseFieldAlias: '省份',
      });
    });

    it('range_group → range editor 带 baseField', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(rangeGroupCf, '单价'));
      expect(result.current.editorOpen).toEqual({
        kind: 'range',
        initialField: rangeGroupCf,
        baseField: 'UnitPrice',
        baseFieldAlias: '单价',
      });
    });

    it('enum_group 没传 baseFieldAlias → fallback 到 baseField 自身', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(enumGroupCf));
      expect(result.current.editorOpen).toMatchObject({
        baseFieldAlias: 'ShipProvince',
      });
    });

    it('dim_as_measure → no-op(UI 暂无独立编辑器,editor 不开)', () => {
      const { result } = renderHook(() => useCustomFieldEditor());
      act(() => result.current.openExistingEditor(dimAsMeasureCf));
      expect(result.current.editorOpen).toBeNull();
    });
  });

  it('I6: closeAll 重置全部 state', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => {
      result.current.openBasePicker('enum');
      result.current.setBaseFieldSearch('hello');
    });
    act(() => result.current.openExpressionEditor(calcMeasureCf));
    expect(result.current.editorOpen).not.toBeNull();
    act(() => result.current.closeAll());
    expect(result.current.editorOpen).toBeNull();
    expect(result.current.baseFieldPicker).toBeNull();
    expect(result.current.baseFieldSearch).toBe('');
  });

  it('setEditorOpen 直接关 editor → state=null', () => {
    const { result } = renderHook(() => useCustomFieldEditor());
    act(() => result.current.openExpressionEditor());
    act(() => result.current.setEditorOpen(null));
    expect(result.current.editorOpen).toBeNull();
  });

  it('callbacks 引用稳定(useCallback,跨 rerender 同身份 — 防 memo 子组件无效 re-render)', () => {
    const { result, rerender } = renderHook(() => useCustomFieldEditor());
    const before = {
      openBasePicker: result.current.openBasePicker,
      pickBaseField: result.current.pickBaseField,
      openExpressionEditor: result.current.openExpressionEditor,
      openExistingEditor: result.current.openExistingEditor,
      closeAll: result.current.closeAll,
    };
    rerender();
    expect(result.current.openBasePicker).toBe(before.openBasePicker);
    expect(result.current.pickBaseField).toBe(before.pickBaseField);
    expect(result.current.openExpressionEditor).toBe(before.openExpressionEditor);
    expect(result.current.openExistingEditor).toBe(before.openExistingEditor);
    expect(result.current.closeAll).toBe(before.closeAll);
  });
});
