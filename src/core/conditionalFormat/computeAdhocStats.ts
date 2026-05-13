/**
 * computeAdhocStats — 给 DetailRenderer 条件格式化用的"列 min/max + topN/bottomN cutoff"预算
 *
 * 跟 computeColRanges / computeTopBottomCutoffs 的差别:
 *   - 透视:数据在 RenderModel.matrix[r][c],已经是 number | string | null
 *   - 明细:数据在 RenderModel.rowHeader[r].fullPath[c],是 display string,需要 Number() 反解
 *
 * 不在这里复用透视的 compute*  — 因为输入数据结构不同,封装一层不如直接独立函数清楚。
 *
 * 不变量:
 *   I1. 列不在 numericFieldNames → 跳过(字符串/日期列不参与)
 *   I2. fullPath[c] 不可 parse 成有限数(空 / NaN / Infinity)→ 跳过
 *   I3. 列没有任何有效数值 → 不出现在 colRanges Map
 *   I4. 同 fieldName 不会在 adhoc 同时挂多列(adhoc 列 1:1 fieldName);无跨列合并
 */
import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import type { TopBottomCutoff } from './computeTopBottomCutoffs.js';

export interface AdhocStats {
  colRanges: ReadonlyMap<string, { min: number; max: number }>;
  cutoffsByRuleId: ReadonlyMap<string, TopBottomCutoff>;
}

export function computeAdhocStats(args: {
  rows: Array<{ fullPath: ReadonlyArray<string | number | null | undefined> }>;
  /** 列位置 → fieldName(viewConfig.rows[c].fieldName 序列) */
  columnFieldNames: ReadonlyArray<string>;
  /** 哪些 fieldName 是数值列(白名单),仅这些列参与 */
  numericFieldNames: ReadonlySet<string>;
  rules: ConditionalFormatRule[];
}): AdhocStats {
  const { rows, columnFieldNames, numericFieldNames, rules } = args;

  // 收集每个数值列的有效值
  const valuesByField = new Map<string, number[]>();
  for (const row of rows) {
    const path = row.fullPath;
    for (let c = 0; c < columnFieldNames.length; c++) {
      const field = columnFieldNames[c];
      if (!field || !numericFieldNames.has(field)) continue;
      const raw = path[c];
      if (raw === '' || raw == null) continue;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) continue;
      let arr = valuesByField.get(field);
      if (!arr) {
        arr = [];
        valuesByField.set(field, arr);
      }
      arr.push(n);
    }
  }

  // colRanges:per-field min/max
  const colRanges = new Map<string, { min: number; max: number }>();
  for (const [field, arr] of valuesByField) {
    if (arr.length === 0) continue;
    let min = arr[0]!;
    let max = arr[0]!;
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    colRanges.set(field, { min, max });
  }

  // cutoffs:per-rule(只看 topN/bottomN 规则)
  const cutoffsByRuleId = new Map<string, TopBottomCutoff>();
  const tbRules = rules.filter(
    (r): r is Extract<ConditionalFormatRule, { kind: 'topN' | 'bottomN' }> =>
      (r.kind === 'topN' || r.kind === 'bottomN') && r.n > 0,
  );
  for (const rule of tbRules) {
    const arr = valuesByField.get(rule.measure);
    if (!arr || arr.length === 0) continue;
    const sorted = arr.slice().sort((a, b) => (rule.kind === 'topN' ? b - a : a - b));
    const idx = Math.min(rule.n - 1, sorted.length - 1);
    cutoffsByRuleId.set(rule.id, { kind: rule.kind, cutoff: sorted[idx]! });
  }

  return { colRanges, cutoffsByRuleId };
}
