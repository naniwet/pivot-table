/**
 * Aggregator helpers — 给「汇总依据」UI 用
 *
 * 职责(Unix:做一件事):
 *   - 把 ValueType → 适用的 Aggregator 列表(供右键菜单展示)
 *   - 业务 label(中文,UI 显示)
 *
 * 不做:
 *   - 不算实际聚合值(那是后端的事)
 *   - 不持有 viewConfig 状态
 *
 * 规则(2026-05-07 用户确认):
 *   - 数值类型(INTEGER/LONG/DOUBLE/BIGDECIMAL/...)→ 全部聚合都可
 *   - 非数值(STRING/BOOLEAN/DATE/...)→ 只能 COUNT / COUNT_DISTINCT / FIRST / LAST / ATTR
 *
 * 适用对象:
 *   - 度量字段(Measure / CalcMeasure):用来 override metadata 默认 aggregator
 *   - 维度字段(Dimension):"作度量"时把维度落到 value zone,选个聚合
 */

import type { Aggregator } from '../../types/query.js';
import type { ValueType } from '../../types/metadata.js';

/** 数值类 ValueType — 跟其他地方(PivotTable.tsx)保持一致 */
const NUMERIC_VALUE_TYPES: ReadonlySet<ValueType> = new Set<ValueType>([
  'INTEGER',
  'LONG',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'BIGDECIMAL',
  'NUMERIC',
]);

/** 数值类型可用的全套聚合(顺序 = UI 菜单展示顺序) */
const NUMERIC_AGGREGATORS: ReadonlyArray<Aggregator> = [
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COUNT',
  'COUNT_DISTINCT',
  'MEDIAN',
  'STDDEV_POP',
  'STDDEV_SAMP',
  'VAR_POP',
  'VAR_SAMP',
  'FIRST',
  'LAST',
];

/** 非数值类型可用聚合 */
const NON_NUMERIC_AGGREGATORS: ReadonlyArray<Aggregator> = [
  'COUNT',
  'COUNT_DISTINCT',
  'FIRST',
  'LAST',
  'ATTR',
];

const AGGREGATOR_LABELS: Record<Aggregator, string> = {
  SUM: '求和',
  AVG: '平均值',
  MIN: '最小值',
  MAX: '最大值',
  COUNT: '计数',
  COUNT_DISTINCT: '唯一计数',
  ATTR: '属性',
  MEDIAN: '中位数',
  STDDEV_POP: '总体标准差',
  STDDEV_SAMP: '样本标准差',
  VAR_POP: '总体方差',
  VAR_SAMP: '样本方差',
  LIST: '列表',
  LIST_DISTINCT: '唯一列表',
  FIRST: '第一个',
  LAST: '最后一个',
};

export function isNumericValueType(t: ValueType | null | undefined): boolean {
  return t != null && NUMERIC_VALUE_TYPES.has(t);
}

/**
 * 给定字段 ValueType,返回菜单里展示的 aggregator 列表(顺序固定,UI 直接 map)。
 * - null/undefined(未知类型)→ 给非数值集合(保守,避免对字符串字段算 SUM)
 */
export function applicableAggregators(valueType: ValueType | null | undefined): ReadonlyArray<Aggregator> {
  return isNumericValueType(valueType) ? NUMERIC_AGGREGATORS : NON_NUMERIC_AGGREGATORS;
}

export function getAggregatorLabel(agg: Aggregator): string {
  return AGGREGATOR_LABELS[agg];
}

/**
 * 把 metadata 上小写 aggregator(如 'sum')转成 ValueField 用的大写 Aggregator(SUM)。
 * 用来在右键菜单里给"使用默认"项标 ✓:metadata.measure.aggregator(小写)→ Aggregator(大写)。
 */
export function normalizeMetadataAggregator(raw: string | null | undefined): Aggregator | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (
    upper === 'SUM' ||
    upper === 'AVG' ||
    upper === 'MIN' ||
    upper === 'MAX' ||
    upper === 'COUNT' ||
    upper === 'COUNT_DISTINCT' ||
    upper === 'ATTR' ||
    upper === 'MEDIAN' ||
    upper === 'STDDEV_POP' ||
    upper === 'STDDEV_SAMP' ||
    upper === 'VAR_POP' ||
    upper === 'VAR_SAMP' ||
    upper === 'LIST' ||
    upper === 'LIST_DISTINCT' ||
    upper === 'FIRST' ||
    upper === 'LAST'
  ) {
    return upper as Aggregator;
  }
  return null;
}
