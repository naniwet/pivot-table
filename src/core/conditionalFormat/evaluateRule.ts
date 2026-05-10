/**
 * conditionalFormat — 给定 cell 的 measure + value,从 rules 里算出该 cell 应用的样式
 *
 * 不变量:
 *   I1. rule.measure !== cell.measure → 不参与该 cell 的评估
 *   I2. threshold rules:多 rule(同 measure)各自 conditions 按顺序匹配,
 *       第一个命中的 style 生效;rules 数组 NOT 按顺序合并(简单语义,后续要 cascade 再升级)
 *   I3. dataBar 规则跟 threshold 互不影响(同 cell 可同时画 bar + 着色)
 *   I4. value=null/undefined/NaN → 不应用任何 style(空 cell)
 *   I5. between 时 value 是 [min, max],闭区间 [min, max](含两端)
 */
import type {
  ConditionalFormatRule,
  ConditionalFormatThresholdCondition,
} from '../../types/viewConfig.js';

export interface CellFormatStyle {
  bg?: string;
  fg?: string;
  bold?: boolean;
}

/** 单条 condition 是否命中 cellValue */
export function matchesCondition(
  cond: ConditionalFormatThresholdCondition,
  cellValue: number,
): boolean {
  const { op, value } = cond;
  if (op === 'between') {
    if (!Array.isArray(value)) return false;
    const [min, max] = value;
    return cellValue >= min && cellValue <= max;
  }
  if (Array.isArray(value)) return false; // 非 between 不应是数组
  switch (op) {
    case 'gt':
      return cellValue > value;
    case 'gte':
      return cellValue >= value;
    case 'lt':
      return cellValue < value;
    case 'lte':
      return cellValue <= value;
    case 'eq':
      return cellValue === value;
  }
}

/**
 * 评估 threshold rules → 应用的 style(命中第一条 condition 即返回)。
 * 没命中任何条件 → 空对象(调用方判断 isEmpty 决定是否设 inline style)。
 */
export function evaluateThreshold(
  rules: ConditionalFormatRule[],
  measure: string,
  cellValue: number,
): CellFormatStyle {
  for (const rule of rules) {
    if (rule.kind !== 'threshold') continue;
    if (rule.measure !== measure) continue;
    for (const cond of rule.conditions) {
      if (matchesCondition(cond, cellValue)) {
        return { ...cond.style };
      }
    }
  }
  return {};
}

/**
 * 该 cell 是否需要画 dataBar — 返回 { color, percent } 或 null。
 * percent ∈ [0, 1]。range='auto' 时由调用方传入 min/max(列实际范围)。
 *
 * @param rules 全部规则(会过滤 kind='dataBar' && measure==该 cell measure)
 * @param measure 该 cell 的 measure name
 * @param cellValue cell 数值
 * @param colMinMax 该 measure 在当前查询返回中的 min/max(给 range='auto' 用)
 */
export function evaluateDataBar(
  rules: ConditionalFormatRule[],
  measure: string,
  cellValue: number,
  colMinMax: { min: number; max: number } | null,
): { color: string; percent: number } | null {
  // 取第一条匹配的 dataBar(同 measure 通常只配 1 条 bar,多条取首)
  const rule = rules.find((r) => r.kind === 'dataBar' && r.measure === measure);
  if (!rule || rule.kind !== 'dataBar') return null;
  const range = rule.range === 'auto' ? colMinMax : rule.range;
  if (!range) return null; // auto 时拿不到列范围(如全空列),不画
  const { min, max } = range;
  if (max <= min) return null; // 退化范围(全相等)— 不画
  // clip 到 [0, 1]
  let pct = (cellValue - min) / (max - min);
  if (!Number.isFinite(pct)) return null;
  if (pct < 0) pct = 0;
  if (pct > 1) pct = 1;
  return { color: rule.color, percent: pct };
}

/**
 * 是否需要对该 cell 评估条件格式(快速跳过没规则的列)。
 * Renderer 渲染每 cell 前先调一次,有规则才跑 evaluate。
 */
export function hasRulesFor(rules: ConditionalFormatRule[], measure: string): boolean {
  return rules.some((r) => r.measure === measure);
}
