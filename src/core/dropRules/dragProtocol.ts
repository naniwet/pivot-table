/**
 * 拖拽协议 — FieldTree（编码端）↔ DropZones（解码端）共用
 *
 * 选用自定义 MIME 而非 'text/plain'，避免与浏览器原生文件/链接拖拽冲突。
 *
 * P3+ value zone 多 chip 共存:同 measureName 不同 aggregator/quickCalc 各占一行。
 *   - 字段树 drag → fieldName=base measureName,sourceZone=undefined → APPEND
 *   - value chip drag → fieldName=base measureName,sourceZone='value',chipKey=encoded full name → REORDER
 */
import type { DropZone, FieldType } from './dropRules.js';

export const PIVOT_FIELD_MIME = 'application/x-pivot-field';

export interface PivotFieldDragPayload {
  fieldName: string;
  fieldType: FieldType;
  /** 拖动来源 zone(value chip 内部 reorder 用,字段树拖入不带) */
  sourceZone?: DropZone;
  /** value chip 的 encoded 唯一标识 — 同 measure 多 chip 时定位 */
  chipKey?: string;
}

export function encodePivotField(payload: PivotFieldDragPayload): string {
  return JSON.stringify(payload);
}

/** 解析失败返回 null（来源不是字段树拖拽，或 payload 损坏）— 调用方应忽略 */
export function decodePivotField(raw: string): PivotFieldDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.fieldName === 'string' &&
      typeof parsed.fieldType === 'string'
    ) {
      return parsed as PivotFieldDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * FilterTree 内部节点拖拽协议 — 同一 FilterTree 内移动 leaf / group 用。
 *
 * 与 PIVOT_FIELD_MIME 区别:
 *   - field: 来自 FieldTree 调色板,目标是"加新 leaf"
 *   - filter-node: 来自 FilterTree 内部,目标是"挪现有节点"
 *
 * treeId 用 FilterTree 的 testidPrefix:防止 dim filter tree 的节点被拖到
 * measure filter tree(类型完全不兼容)。drop 端必须验证 treeId 匹配。
 */
export const PIVOT_FILTER_NODE_MIME = 'application/x-pivot-filter-node';

export interface PivotFilterNodeDragPayload {
  /** 用 testidPrefix 作为 tree 标识,跨 host 防误拖 */
  treeId: string;
  /** 源节点路径(从根开始的索引序列) */
  path: number[];
}

export function encodePivotFilterNode(payload: PivotFilterNodeDragPayload): string {
  return JSON.stringify(payload);
}

export function decodePivotFilterNode(
  raw: string,
): PivotFilterNodeDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.treeId === 'string' &&
      Array.isArray(parsed.path) &&
      parsed.path.every((n: unknown) => typeof n === 'number')
    ) {
      return parsed as PivotFilterNodeDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
