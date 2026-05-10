/**
 * translateDimensionFilter — ClientFilter[] → 单一 Filter 嵌套树
 *
 * 后端契约:维度过滤通过 query.dimensionFilter: { filter: Filter } | null
 * Filter union 自带 And/Or/Not,所以不再用 FieldFilter[] 平铺。
 *
 * 翻译规则:
 *   - leaf{field, operator, value} → ByLevel{level: field, operator, value}
 *   - group{op, children} → 二元嵌套 And/Or 树(右结合)
 *   - 多个顶层 filter → 数组级隐式 And(用 Filter.And 嵌套)
 *   - 空 value 跳过;全空 → null
 */
import type { Filter, FilterLiteral } from '../../../types/query.js';
import type { ClientFilter } from '../../../types/index.js';

function isMeaningfulValue(v: FilterLiteral | undefined): v is FilterLiteral {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'string' && v === '') return false;
  return true;
}

/** [a, b, c] + And → And(a, And(b, c)) — 右结合 */
function combineToBinary(op: 'And' | 'Or', items: Filter[]): Filter {
  if (items.length === 0) {
    throw new Error('combineToBinary: items must be non-empty');
  }
  if (items.length === 1) return items[0]!;
  return {
    _enum: op,
    left: items[0]!,
    right: combineToBinary(op, items.slice(1)),
  };
}

/** 把单个 ClientFilter 翻译为 Filter(可能是 ByLevel,也可能是嵌套 And/Or);空跳过返 null */
function translateNode(node: ClientFilter): Filter | null {
  if (node.kind === 'leaf') {
    if (!isMeaningfulValue(node.value)) return null;
    return {
      _enum: 'ByLevel',
      level: node.field,
      operator: node.operator,
      value: node.value,
    };
  }
  // group
  const inner: Filter[] = [];
  for (const c of node.children) {
    const t = translateNode(c);
    if (t) inner.push(t);
  }
  if (inner.length === 0) return null;
  return combineToBinary(node.op, inner);
}

export function translateDimensionFilter(filters: ClientFilter[]): Filter | null {
  const tops: Filter[] = [];
  for (const f of filters) {
    const t = translateNode(f);
    if (t) tops.push(t);
  }
  if (tops.length === 0) return null;
  return combineToBinary('And', tops);
}
