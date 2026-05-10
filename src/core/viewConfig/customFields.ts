/**
 * customFields 操作 — 添加/删除/更新用户自建字段（P2）
 *
 * 单一职责：对 viewConfig.customFields 数组的 CRUD，不感知 customField kind 内部结构。
 * 编辑器 UI 用这些操作把用户输入转换为 ViewConfig 变更。
 */
import type { CustomField, ViewConfig } from '../../types/viewConfig.js';

export function applyAddCustomField(viewConfig: ViewConfig, field: CustomField): ViewConfig {
  if (viewConfig.customFields.some((f) => f.id === field.id)) {
    throw new Error(`[applyAddCustomField] duplicate id "${field.id}"`);
  }
  return { ...viewConfig, customFields: [...viewConfig.customFields, field] };
}

export function applyRemoveCustomField(viewConfig: ViewConfig, id: string): ViewConfig {
  if (!viewConfig.customFields.some((f) => f.id === id)) return viewConfig;
  return {
    ...viewConfig,
    customFields: viewConfig.customFields.filter((f) => f.id !== id),
  };
}

export function applyUpdateCustomField(
  viewConfig: ViewConfig,
  field: CustomField,
): ViewConfig {
  const idx = viewConfig.customFields.findIndex((f) => f.id === field.id);
  if (idx === -1) return viewConfig;
  const next = viewConfig.customFields.slice();
  next[idx] = field;
  return { ...viewConfig, customFields: next };
}
