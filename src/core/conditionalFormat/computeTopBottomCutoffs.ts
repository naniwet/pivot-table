/**
 * 计算每条 topN/bottomN 规则对应的 cutoff 值 — 给 evaluateTopBottom 用。
 *
 * 设计:
 *   - 范围 = 当前页(model.matrix 的所有非空数值 cell),跟 dataBar range='auto' 一致。
 *     副作用:跨页不一致;README/UI tooltip 需明示"按当前页排名"。
 *   - 严格按列(measure)分组:同 measure 跨多列(多 column tuple)合并。
 *   - 并列名次处理:cutoff = 第 N 个值(从大到小或从小到大);evaluateTopBottom 用
 *     `value >= cutoff` (topN) / `value <= cutoff` (bottomN),并列项全部高亮(数量可能 > N)。
 *   - 数据量少于 N → cutoff 取最末值(全部命中,语义上即"全是 topN")。
 *
 * 不变量:
 *   I1. 没有 topN/bottomN 规则 → 返回空 Map(早退)
 *   I2. 某 measure 没有非空数值 cell → 该规则不出现在结果 Map(evaluate 阶段视为 null)
 *   I3. rule.n <= 0 → 视为非法,跳过(不出现在 Map)
 *
 * 复杂度:O(rows × cols + Σ rules.n × log values.length)— rules 通常 < 5,可忽略。
 */
import type { RenderModel } from '../../types/renderModel.js';
import type { ConditionalFormatRule } from '../../types/viewConfig.js';

export interface TopBottomCutoff {
  kind: 'topN' | 'bottomN';
  cutoff: number;
}

export type CutoffsByRuleId = ReadonlyMap<string, TopBottomCutoff>;

/**
 * @param model 当前页 RenderModel
 * @param rules viewConfig.pageState.conditionalFormats(可能含 threshold/dataBar — 自动过滤)
 */
export function computeTopBottomCutoffs(
  model: RenderModel,
  rules: ConditionalFormatRule[],
): CutoffsByRuleId {
  const out = new Map<string, TopBottomCutoff>();
  // 先过滤出 topN/bottomN 规则,按 measure 分桶;无规则直接早退
  const tbRules = rules.filter(
    (r): r is Extract<ConditionalFormatRule, { kind: 'topN' | 'bottomN' }> =>
      (r.kind === 'topN' || r.kind === 'bottomN') && r.n > 0,
  );
  if (tbRules.length === 0) return out;

  const measureNames = new Set(tbRules.map((r) => r.measure));

  // 收集每个相关 measure 的所有非空数值
  const valuesByMeasure = new Map<string, number[]>();
  const cols = model.columnHeader;
  for (let r = 0; r < model.matrix.length; r++) {
    const row = model.matrix[r]!;
    for (let c = 0; c < cols.length; c++) {
      const measure = cols[c]?.fieldName;
      if (!measure || !measureNames.has(measure)) continue;
      const cell = row[c];
      if (!cell || cell.isEmpty || cell.isMasked) continue;
      const v = cell.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      let arr = valuesByMeasure.get(measure);
      if (!arr) {
        arr = [];
        valuesByMeasure.set(measure, arr);
      }
      arr.push(v);
    }
  }

  for (const rule of tbRules) {
    const arr = valuesByMeasure.get(rule.measure);
    if (!arr || arr.length === 0) continue;
    // 排序:topN 降序,bottomN 升序
    // 注意:复制后排序(不动 valuesByMeasure 里的引用,因为可能被多个 rule 共用)
    const sorted = arr.slice().sort((a, b) => (rule.kind === 'topN' ? b - a : a - b));
    // n 超过数据量 → 取最末值(全命中)
    const idx = Math.min(rule.n - 1, sorted.length - 1);
    out.set(rule.id, { kind: rule.kind, cutoff: sorted[idx]! });
  }
  return out;
}
