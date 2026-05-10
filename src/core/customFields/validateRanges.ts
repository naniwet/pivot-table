/**
 * validateRanges — 范围分组的区间合法性校验
 *
 * PRD §10.2 校验规则:
 *   - 至少 2 个区间
 *   - min < max（min=null 视为 -∞，max=null 视为 +∞）
 *   - 仅首个区间允许 min=null；仅末尾区间允许 max=null
 *   - 区间不重叠（按 min 升序后，下一区间 min ≥ 上一区间 max）
 *   - 标签不重复
 */

export interface RangeRow {
  min: number | null;
  max: number | null;
  label: string;
}

export type ValidateResult = { ok: true; error: null } | { ok: false; error: string };

export function validateRanges(ranges: RangeRow[]): ValidateResult {
  if (ranges.length < 2) {
    return { ok: false, error: '至少 2 个区间' };
  }
  // 标签重复
  const seenLabels = new Set<string>();
  for (const r of ranges) {
    if (seenLabels.has(r.label)) {
      return { ok: false, error: `标签 "${r.label}" 重复` };
    }
    seenLabels.add(r.label);
  }
  // 仅首个 min 允许 null / 仅末尾 max 允许 null
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]!;
    if (r.min === null && i !== 0) {
      return { ok: false, error: `"${r.label}" 区间起点未指定（仅第一个区间允许）` };
    }
    if (r.max === null && i !== ranges.length - 1) {
      return { ok: false, error: `"${r.label}" 区间终点未指定（仅最后一个区间允许）` };
    }
  }
  // min < max 校验
  for (const r of ranges) {
    if (r.min !== null && r.max !== null && r.min >= r.max) {
      return { ok: false, error: `"${r.label}" 区间起点 ${r.min} 不小于终点 ${r.max}` };
    }
  }
  // 重叠校验：按数组顺序检查 r[i].min >= r[i-1].max
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1]!;
    const curr = ranges[i]!;
    // 用上界校验下一个起点
    if (prev.max !== null && curr.min !== null && curr.min < prev.max) {
      return {
        ok: false,
        error: `区间重叠（"${curr.label}" 起点 ${curr.min} < 上一区间终点 ${prev.max}）`,
      };
    }
  }
  return { ok: true, error: null };
}
