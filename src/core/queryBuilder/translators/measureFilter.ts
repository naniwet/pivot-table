/**
 * translateMeasureFilters — ClientMeasureFilter[] → query.measureFilters: TupleFilter[]
 *
 * 跟 dimensionFilter 对称的"度量过滤树":
 *   - 输出长度 0(无过滤)或 1(单一 TupleFilter,内部 filter 是嵌套 Filter 树)
 *   - leaf{measureName, operator, value} → ByMeasure(或 Between → And(GTE, LTE))
 *   - group{op, children} → 二元嵌套 And/Or 树(右结合,可跨度量)
 *   - 多个顶层 → 数组级隐式 And
 *   - 空 value 跳过
 *
 * 后端契约:`query.measureFilters: TupleFilter[]`,Filter union 自带 And/Or/Not。
 */
import type { Filter, FilterLiteral, TupleFilter } from '../../../types/query.js';
import type {
  ClientMeasureFilter,
  MeasureFilter,
} from '../../../types/viewConfig.js';

function isMeaningfulValue(v: FilterLiteral | undefined): v is FilterLiteral {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'string' && v === '') return false;
  return true;
}

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

function isGroupNode(
  node: ClientMeasureFilter,
): node is Extract<ClientMeasureFilter, { kind: 'group' }> {
  return 'kind' in node && node.kind === 'group';
}

/** 单个 ClientMeasureFilter → Filter;leaf 走 translateLeaf,group 递归;空 → null */
function translateNode(node: ClientMeasureFilter): Filter | null {
  if (isGroupNode(node)) {
    const inner: Filter[] = [];
    for (const c of node.children) {
      const t = translateNode(c);
      if (t) inner.push(t);
    }
    if (inner.length === 0) return null;
    return combineToBinary(node.op, inner);
  }
  return translateLeaf(node);
}

/** 单个 leaf MeasureFilter → Filter(可能是 ByMeasure 或 And(GTE,LTE) 子树),空 value → null */
function translateLeaf(mf: MeasureFilter): Filter | null {
  const ctx = mf.context ?? 'InGlobal';

  if (mf.operator === 'Between') {
    if (!Array.isArray(mf.value) || mf.value.length !== 2) return null;
    const [min, max] = mf.value as [FilterLiteral, FilterLiteral];
    if (!isMeaningfulValue(min) || !isMeaningfulValue(max)) return null;
    return {
      _enum: 'And',
      left: {
        _enum: 'ByMeasure',
        measure: mf.measureName,
        measureContext: ctx,
        operator: 'GreaterThanOrEqual',
        value: min,
      },
      right: {
        _enum: 'ByMeasure',
        measure: mf.measureName,
        measureContext: ctx,
        operator: 'LessThanOrEqual',
        value: max,
      },
    };
  }

  if (!isMeaningfulValue(mf.value)) return null;
  return {
    _enum: 'ByMeasure',
    measure: mf.measureName,
    measureContext: ctx,
    operator: mf.operator,
    value: mf.value,
  };
}

export function translateMeasureFilters(filters: ClientMeasureFilter[]): TupleFilter[] {
  const items: Filter[] = [];
  for (const node of filters) {
    const f = translateNode(node);
    if (f) items.push(f);
  }
  if (items.length === 0) return [];
  return [{ _enum: 'TupleFilter', filter: combineToBinary('And', items) }];
}
