/**
 * operatorsForType — 按 ValueType 决定 FilterPanel 上可选的 BinaryOperator + 业务名 label
 *
 * Unix 哲学：单职责纯函数 + 数据驱动表（不写 if-else 链）
 *
 * 不在范围（留给嵌套 And/Or modal）：
 *   - Between / NotBetween / IsEmpty / IsNotEmpty — schema 无原生 enum，
 *     需要 GroupFilter (And + GreaterThanOrEqual + LessThanOrEqual) 表达
 */
import type { BinaryOperator } from '../../types/query.js';
import type { ValueType } from '../../types/metadata.js';

export interface OperatorOption {
  value: BinaryOperator;
  label: string;
}

/** 全部 operator 的中文业务名 — 单一来源，避免散落 */
const LABELS: Record<BinaryOperator, string> = {
  In: '包含',
  NotIn: '不包含',
  Equals: '等于',
  NotEquals: '不等于',
  GreaterThan: '大于',
  GreaterThanOrEqual: '大于等于',
  LessThan: '小于',
  LessThanOrEqual: '小于等于',
  Like: '匹配',
  Contains: '含有',
  StartsWith: '开头是',
  EndsWith: '结尾是',
  NotLike: '不匹配',
  NotLikeStart: '开头不是',
  NotLikeEnd: '结尾不是',
};

/** 数值类（含日期 — 都支持大小比较） */
const NUMERIC_TYPES = new Set<ValueType>([
  'INTEGER',
  'LONG',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'BIGDECIMAL',
  'NUMERIC',
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
]);

/** 字符串类 */
const TEXT_TYPES = new Set<ValueType>(['STRING', 'ASCII_CODE']);

export function isNumericLikeType(t: ValueType | undefined): boolean {
  return t !== undefined && NUMERIC_TYPES.has(t);
}

export function isTextLikeType(t: ValueType | undefined): boolean {
  return t !== undefined && TEXT_TYPES.has(t);
}

/** 数值/日期类支持的 operator 列表 */
const NUMERIC_OPS: BinaryOperator[] = [
  'Equals',
  'NotEquals',
  'GreaterThan',
  'GreaterThanOrEqual',
  'LessThan',
  'LessThanOrEqual',
  'In',
  'NotIn',
];

/** 字符串类支持的 operator 列表 */
const TEXT_OPS: BinaryOperator[] = [
  'In',
  'NotIn',
  'Equals',
  'NotEquals',
  'Contains',
  'StartsWith',
  'EndsWith',
  'Like',
  'NotLike',
];

/** 布尔类支持的 operator 列表 */
const BOOLEAN_OPS: BinaryOperator[] = ['Equals', 'NotEquals'];

/** 未知 / fallback：宽松开放 4 个最常用的，避免阻塞用户 */
const FALLBACK_OPS: BinaryOperator[] = ['In', 'NotIn', 'Equals', 'NotEquals'];

function toOptions(ops: BinaryOperator[]): OperatorOption[] {
  return ops.map((value) => ({ value, label: LABELS[value] }));
}

export function operatorsForType(t: ValueType | undefined): OperatorOption[] {
  if (t === undefined) return toOptions(FALLBACK_OPS);
  if (NUMERIC_TYPES.has(t)) return toOptions(NUMERIC_OPS);
  if (TEXT_TYPES.has(t)) return toOptions(TEXT_OPS);
  if (t === 'BOOLEAN') return toOptions(BOOLEAN_OPS);
  return toOptions(FALLBACK_OPS);
}
