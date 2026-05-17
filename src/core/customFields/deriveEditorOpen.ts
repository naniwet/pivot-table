/**
 * deriveEditorOpenFromExisting — 根据已存在 customField 的 kind 决定打开哪个 editor modal
 *
 * 收益(Unix):原 useCustomFieldEditor.openExistingEditor 内的"按 cf.kind 路由"派生
 *   抽到 core,显式声明 5 个 kind 各自对应的 EditorOpenState 形状。
 *
 * 不变量:
 *   I1. calc_measure / calc_column → expr editor(共享 modal,内部按 cf.kind 决定 form)
 *   I2. enum_group → enum editor;baseField / baseFieldAlias 透传(后者缺省 fallback baseField)
 *   I3. range_group → range editor;同上 baseField 透传
 *   I4. dim_as_measure → null(UI 暂无独立 editor,改聚合方式得先删再建)
 *   I5. 未知 kind(防御 / 将来扩展)→ null
 */
import type { CustomField } from '../../types/viewConfig.js';

export type EditorKind = 'expr' | 'enum' | 'range';

export interface EditorOpenState {
  kind: EditorKind;
  initialField?: CustomField;
  baseField?: string;
  baseFieldAlias?: string;
}

export function deriveEditorOpenFromExisting(
  cf: CustomField,
  baseFieldAlias?: string,
): EditorOpenState | null {
  if (cf.kind === 'calc_measure' || cf.kind === 'calc_column') {
    return { kind: 'expr', initialField: cf }; // I1
  }
  if (cf.kind === 'enum_group' || cf.kind === 'range_group') {
    return {
      kind: cf.kind === 'enum_group' ? 'enum' : 'range', // I2/I3
      initialField: cf,
      baseField: cf.baseField,
      baseFieldAlias: baseFieldAlias ?? cf.baseField,
    };
  }
  // I4 (dim_as_measure) / I5 (其他)— 不开
  return null;
}
