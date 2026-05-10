/**
 * Translator 集合
 *   - translateFilters：P1.0 平铺 leaf；P1.5 嵌套 And/Or（限同字段）
 *   - translateMeasureFilters：P1.0 InGlobal 待做、P3 InGroup
 *   - translateCustomElements：P2 接 customFields
 */

import type { ClientFilter } from '../../../types/index.js';
import type {
  FieldFilter,
  Filter,
  FilterLiteral,
} from '../../../types/query.js';

// translateCustomElements 已抽到 ./customElements.ts（独立文件便于联调时调整）
export { translateCustomElements } from './customElements.js';

function isMeaningfulValue(v: FilterLiteral | undefined): v is FilterLiteral {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'string' && v === '') return false;
  return true;
}

/**
 * 多个 leaf 折成右结合的二元 And/Or 树：
 *   [a, b, c] + And → And(a, And(b, c))
 *
 * schema 的 And/Or 是二元（left/right），多条件必须嵌套表达。
 */
function combineToBinary(op: 'And' | 'Or', filters: Filter[]): Filter {
  if (filters.length === 0) {
    throw new Error('combineToBinary: filters must be non-empty');
  }
  if (filters.length === 1) return filters[0]!;
  return {
    _enum: op,
    left: filters[0]!,
    right: combineToBinary(op, filters.slice(1)),
  };
}

/**
 * P1.5 group 翻译：
 *   - 同字段约束：所有子 leaf 必须 field 相同（否则抛错）
 *   - 子节点中空 value 安静跳过
 *   - 剩 0 个 → 整个 group 跳过；剩 1 个 → 退化为单 ByValue；剩 ≥2 → 嵌套 And/Or
 *   - children 仅支持 leaf；嵌套 group 暂不递归（UI modal 也只暴露一层）
 */
function translateGroupNode(
  group: Extract<ClientFilter, { kind: 'group' }>,
): FieldFilter | null {
  const leafChildren = group.children.filter(
    (c): c is Extract<ClientFilter, { kind: 'leaf' }> => c.kind === 'leaf',
  );
  // 同字段约束（DDD 不变量）：UI modal 只允许同字段嵌套
  const fields = new Set(leafChildren.map((c) => c.field));
  if (fields.size > 1) {
    throw new Error('translateFilters: group children must reference the same field');
  }
  const meaningful = leafChildren.filter((c) => isMeaningfulValue(c.value));
  if (meaningful.length === 0) return null;

  const field = meaningful[0]!.field;
  const inner: Filter[] = meaningful.map((c) => ({
    _enum: 'ByValue',
    operator: c.operator,
    value: c.value,
  }));
  return {
    _enum: 'FieldFilter',
    field,
    filter: combineToBinary(group.op, inner),
  };
}

/**
 * @deprecated P2 起 buildQuery 改用 translateDimensionFilter 输出到 query.dimensionFilter。
 * query.filters 是后端兼容层(始终空)。本函数保留供历史 host 代码引用,但不再被 buildQuery 调用。
 */
export function translateFilters(filters: ClientFilter[]): FieldFilter[] {
  const out: FieldFilter[] = [];
  for (const f of filters) {
    if (f.kind === 'leaf') {
      if (!isMeaningfulValue(f.value)) continue;
      out.push({
        _enum: 'FieldFilter',
        field: f.field,
        filter: { _enum: 'ByValue', operator: f.operator, value: f.value },
      });
      continue;
    }
    // group
    const translated = translateGroupNode(f);
    if (translated) out.push(translated);
  }
  return out;
}

// translateMeasureFilters 已抽到 ./measureFilter.ts (单一 TupleFilter 嵌套树形)
// 旧实现(多 TupleFilter 平铺)已删,统一新实现
export { translateMeasureFilters } from './measureFilter.js';

