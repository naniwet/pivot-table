/**
 * fieldDisplayType — 把 FieldNode 推导成"显示数据类型" key
 *
 * 干嘛用:
 *   - FieldTree 字段图标(Dimension 默认 Aa,但 time level / 数值 dim 要用更准确的 icon)
 *   - DropZones chip 数据类型 badge
 *   - adhoc 条件格式化"数值列"白名单(numeric 的字段才能挂规则)
 *
 * 规则:
 *   - 时间相关节点(HIERARCHY_TIME / LEVEL_TIME_*)→ 'date'(优先,不看 valueType)
 *     原因:LEVEL_TIME_YEAR 的 valueType 是 STRING(年份串),按 valueType 会误标 'text'
 *   - 否则按 ValueType union(types/metadata.ts 定义):
 *       INTEGER / LONG / BIGINT / FLOAT / DOUBLE / BIGDECIMAL / NUMERIC → 'numeric'
 *       STRING / ASCII_CODE → 'text'
 *       DATE / TIME / DATETIME / TIMESTAMP → 'date'
 *       BOOLEAN → 'boolean'
 *   - 其他 / null → null(UI 层不渲染图标)
 *
 * 不动 / 不推导:
 *   - Measure / CalcMeasure / Hierarchy 等结构类节点 — 它们的图标是"用途"语义不是"数据类型"
 *     (Σ 表示 "聚合度量",跟 valueType 无关),不走这条
 */
import type { FieldNode, ValueType } from '../../types/metadata.js';

export type FieldDisplayType = 'numeric' | 'text' | 'date' | 'boolean';

const NUMERIC_VTYPES = new Set<ValueType>([
  'INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC',
]);
const STRING_VTYPES = new Set<ValueType>(['STRING', 'ASCII_CODE']);
const DATE_VTYPES = new Set<ValueType>(['DATE', 'TIME', 'DATETIME', 'TIMESTAMP']);
const BOOL_VTYPES = new Set<ValueType>(['BOOLEAN']);

export function deriveFieldDisplayType(
  node: FieldNode | null,
): FieldDisplayType | null {
  if (!node) return null;
  if (node.type === 'HIERARCHY_TIME') return 'date';
  if (node.type.startsWith('LEVEL_TIME')) return 'date';
  const vt = node.valueType;
  if (!vt) return null;
  // 大小写防御:schema 是大写,但万一上游传小写串
  const VT = vt.toUpperCase() as ValueType;
  if (NUMERIC_VTYPES.has(VT)) return 'numeric';
  if (STRING_VTYPES.has(VT)) return 'text';
  if (DATE_VTYPES.has(VT)) return 'date';
  if (BOOL_VTYPES.has(VT)) return 'boolean';
  return null;
}

/** 数值类 valueType 集合 — 给 adhoc 条件格式化白名单 / 列头菜单数值列判定共用 */
export function isNumericValueType(vt: string | null | undefined): boolean {
  if (!vt) return false;
  return NUMERIC_VTYPES.has(vt.toUpperCase() as ValueType);
}

/** 中文 tooltip(title 属性用) */
export const DISPLAY_TYPE_LABELS: Record<FieldDisplayType, string> = {
  numeric: '数值',
  text: '文本',
  date: '日期',
  boolean: '布尔',
};
