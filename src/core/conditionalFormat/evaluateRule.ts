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
 *   I6. topN/bottomN:cutoff 由 computeTopBottomCutoffs 预算,evaluateTopBottom 仅判定
 *       并列(value === cutoff)算命中
 *   I7. 优先级 threshold > topN/bottomN(renderer 层决定;此模块只各自评估,合并交调用方)
 */
import type {
  ConditionalFormatRule,
  ConditionalFormatScope,
  ConditionalFormatThresholdCondition,
} from '../../types/viewConfig.js';

import type { CutoffsByRuleId } from './computeTopBottomCutoffs.js';

/**
 * 安全取 rule.scope — dataBar 没有 scope 字段(union 里没声明),固定返回 'cell'。
 * threshold / topN / bottomN 的 scope 缺省 → 'cell'(向后兼容旧序列化)。
 */
export function getRuleScope(rule: ConditionalFormatRule): ConditionalFormatScope {
  if (rule.kind === 'dataBar') return 'cell';
  return rule.scope ?? 'cell';
}

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

/**
 * 评估 topN/bottomN rules → 应用的 style(命中第一条 topN/bottomN rule 即返回)。
 *
 * 调用前应先 computeTopBottomCutoffs(model, rules) 拿到 cutoffs。
 *
 * 语义:
 *   - kind='topN'  且 cellValue >= cutoff → 命中
 *   - kind='bottomN' 且 cellValue <= cutoff → 命中
 *   - 同 measure 多条 topN/bottomN rule → 按数组顺序,第一条命中即返回
 *   - cutoffs.get(rule.id) === undefined → 跳过(列全空或 n<=0)
 *
 * 跟 evaluateThreshold 配合:renderer 先 evaluateThreshold,空 style 再 evaluateTopBottom。
 */
export function evaluateTopBottom(
  rules: ConditionalFormatRule[],
  measure: string,
  cellValue: number,
  cutoffs: CutoffsByRuleId,
): CellFormatStyle {
  for (const rule of rules) {
    if (rule.kind !== 'topN' && rule.kind !== 'bottomN') continue;
    if (rule.measure !== measure) continue;
    const cut = cutoffs.get(rule.id);
    if (!cut) continue;
    const hit = rule.kind === 'topN' ? cellValue >= cut.cutoff : cellValue <= cut.cutoff;
    if (hit) return { ...rule.style };
  }
  return {};
}

/**
 * 评估单条 rule 是否命中给定数值 → 命中返回 style,不命中返回空。
 * 给 row-scope 预算用 — 不暴露给 renderer 直接调,只用来 batch 计算。
 *
 * dataBar 不参与(整行高亮里没有 bar 的位置语义)— 调用方过滤。
 */
function evaluateSingleRule(
  rule: ConditionalFormatRule,
  cellValue: number,
  cutoffs: CutoffsByRuleId,
): CellFormatStyle {
  if (rule.kind === 'threshold') {
    for (const cond of rule.conditions) {
      if (matchesCondition(cond, cellValue)) return { ...cond.style };
    }
    return {};
  }
  if (rule.kind === 'topN' || rule.kind === 'bottomN') {
    const cut = cutoffs.get(rule.id);
    if (!cut) return {};
    const hit = rule.kind === 'topN' ? cellValue >= cut.cutoff : cellValue <= cut.cutoff;
    return hit ? { ...rule.style } : {};
  }
  return {};
}

/**
 * 预算 row-scope 规则命中的 styles — Map<rowIdx, CellFormatStyle>
 *
 * 跨 row × scope='row' rule 矩阵扫一遍,命中第一条即记录 row 的 style,跳出。
 * O(rows × rowRules) — 一般 rules < 10,跑一次不显著。
 *
 * 不感知数据形态(pivot/adhoc):caller 注入 `cellValueAt(r, measure)` callback。
 *
 * @param rules 当前 mode 已过滤的 rules(可能含 scope=cell 的,这里再过一遍 scope=row)
 * @param rowCount 表格行数
 * @param cellValueAt 给定行 r + measure 名,返回 raw 数值 或 null(空 / 非数值)
 * @param cutoffs computeTopBottomCutoffs 的结果(给 topN/bottomN rule 用)
 */
export function computeRowScopeStyles(
  rules: ConditionalFormatRule[],
  rowCount: number,
  cellValueAt: (rowIdx: number, measure: string) => number | null,
  cutoffs: CutoffsByRuleId,
): ReadonlyMap<number, CellFormatStyle> {
  const out = new Map<number, CellFormatStyle>();
  // dataBar 没有 row scope,getRuleScope 把它强归 'cell',这里自然过滤掉
  const rowRules = rules.filter((r) => getRuleScope(r) === 'row');
  if (rowRules.length === 0) return out;

  for (let r = 0; r < rowCount; r++) {
    for (const rule of rowRules) {
      const v = cellValueAt(r, rule.measure);
      if (v === null || !Number.isFinite(v)) continue;
      const style = evaluateSingleRule(rule, v, cutoffs);
      if (style.bg || style.fg || style.bold) {
        out.set(r, style); // 同 row 多 rule 命中 → 第一条 wins(数组顺序)
        break;
      }
    }
  }
  return out;
}
