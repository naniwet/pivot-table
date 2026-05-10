/**
 * useCustomFieldEditor — 自建字段编辑流程的 UI state 集合
 *
 * 流程:
 *   1. 用户点 "+ 度量 / + 范围 / + 分组" 按钮
 *      → 度量(formula 式):直接 setEditorOpen({ kind: 'expr' })
 *      → 范围 / 分组:先 setBaseFieldPicker({ kind })→ picker 弹 modal 选 base field
 *   2. picker 选完 → setEditorOpen({ kind: 'enum'/'range', baseField, baseFieldAlias })
 *   3. editor onApply → dispatch ADD_CUSTOM_FIELD / UPDATE_CUSTOM_FIELD
 *   4. close 重置全部 state
 *
 * 把这一组耦合 state(editorOpen / baseFieldPicker / baseFieldSearch)封装在一起,
 * PivotTable 只需调高级方法(openExpressionEditor / openBasePicker / closeAll 等)。
 */

import { useState, useCallback } from 'react';

import type { CustomField } from '../types/viewConfig.js';

export type EditorKind = 'expr' | 'enum' | 'range';

export interface EditorOpenState {
  kind: EditorKind;
  initialField?: CustomField;
  baseField?: string;
  baseFieldAlias?: string;
}

export interface BaseFieldPickerState {
  kind: 'enum' | 'range';
}

export interface UseCustomFieldEditorResult {
  /** 编辑器 modal 状态(null = 关) */
  editorOpen: EditorOpenState | null;
  setEditorOpen: (s: EditorOpenState | null) => void;
  /** base field picker modal 状态(选 enum/range 的 base 字段) */
  baseFieldPicker: BaseFieldPickerState | null;
  /** picker 内的搜索框输入 */
  baseFieldSearch: string;
  setBaseFieldSearch: (s: string) => void;
  /** 打开 picker(开始 enum/range 流程) */
  openBasePicker: (kind: 'enum' | 'range') => void;
  /** picker 选完 → 打开真编辑器 */
  pickBaseField: (kind: 'enum' | 'range', baseField: string, baseFieldAlias: string) => void;
  /** 直接打开公式编辑器(新建计算度量) */
  openExpressionEditor: (initialField?: CustomField) => void;
  /** 编辑既有自建字段(任意 kind) */
  openExistingEditor: (cf: CustomField, baseFieldAlias?: string) => void;
  /** 关闭 picker + 编辑器 + 清搜索 */
  closeAll: () => void;
}

export function useCustomFieldEditor(): UseCustomFieldEditorResult {
  const [editorOpen, setEditorOpenRaw] = useState<EditorOpenState | null>(null);
  const [baseFieldPicker, setBaseFieldPicker] = useState<BaseFieldPickerState | null>(null);
  const [baseFieldSearch, setBaseFieldSearch] = useState('');

  const setEditorOpen = useCallback((s: EditorOpenState | null) => {
    setEditorOpenRaw(s);
  }, []);

  const openBasePicker = useCallback((kind: 'enum' | 'range') => {
    setBaseFieldPicker({ kind });
    setBaseFieldSearch('');
  }, []);

  const pickBaseField = useCallback(
    (kind: 'enum' | 'range', baseField: string, baseFieldAlias: string) => {
      setEditorOpenRaw({ kind, baseField, baseFieldAlias });
      setBaseFieldPicker(null);
      setBaseFieldSearch('');
    },
    [],
  );

  const openExpressionEditor = useCallback((initialField?: CustomField) => {
    setEditorOpenRaw({ kind: 'expr', initialField });
  }, []);

  const openExistingEditor = useCallback((cf: CustomField, baseFieldAlias?: string) => {
    if (cf.kind === 'calc_measure' || cf.kind === 'calc_column') {
      // 表达式编辑器内部按 cf.kind 决定 calc_measure / calc_column 表单
      setEditorOpenRaw({ kind: 'expr', initialField: cf });
    } else if (cf.kind === 'enum_group' || cf.kind === 'range_group') {
      setEditorOpenRaw({
        kind: cf.kind === 'enum_group' ? 'enum' : 'range',
        initialField: cf,
        baseField: cf.baseField,
        baseFieldAlias: baseFieldAlias ?? cf.baseField,
      });
    }
    // dim_as_measure 暂无独立编辑器:右键"转度量" picker 即创建即用,
    // 修改聚合方式 / 重命名当前要先删除再重建。后续 PR 加 inline 重命名 + aggregator 切换。
  }, []);

  const closeAll = useCallback(() => {
    setEditorOpenRaw(null);
    setBaseFieldPicker(null);
    setBaseFieldSearch('');
  }, []);

  return {
    editorOpen,
    setEditorOpen,
    baseFieldPicker,
    baseFieldSearch,
    setBaseFieldSearch,
    openBasePicker,
    pickBaseField,
    openExpressionEditor,
    openExistingEditor,
    closeAll,
  };
}
