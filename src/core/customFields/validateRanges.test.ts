/**
 * validateRanges — 范围分组的区间合法性校验（纯函数）
 *
 * PRD §10.2 关键校验：
 *   - 区间不能重叠
 *   - 必须按升序（min 升序）
 *   - 第一个区间下界默认 -∞（min=null），最后一个上界默认 +∞（max=null）
 *   - 标签不能重复
 *   - 至少 2 个区间
 */
import { describe, expect, it } from 'vitest';

import { validateRanges } from './validateRanges.js';

const ok = { ok: true, error: null } as const;

describe('validateRanges', () => {
  it('合法：3 个连续不重叠区间，第一个 -∞、最后一个 +∞', () => {
    expect(
      validateRanges([
        { min: null, max: 18, label: '未成年' },
        { min: 18, max: 60, label: '青壮年' },
        { min: 60, max: null, label: '老年' },
      ]),
    ).toEqual(ok);
  });

  it('< 2 个区间 → 不合法', () => {
    expect(validateRanges([])).toEqual({
      ok: false,
      error: '至少 2 个区间',
    });
    expect(validateRanges([{ min: null, max: null, label: 'x' }])).toEqual({
      ok: false,
      error: '至少 2 个区间',
    });
  });

  it('标签重复 → 不合法', () => {
    expect(
      validateRanges([
        { min: null, max: 10, label: 'A' },
        { min: 10, max: null, label: 'A' },
      ]),
    ).toEqual({ ok: false, error: '标签 "A" 重复' });
  });

  it('区间重叠 → 不合法', () => {
    expect(
      validateRanges([
        { min: null, max: 20, label: 'A' },
        { min: 10, max: null, label: 'B' },
      ]),
    ).toEqual({ ok: false, error: '区间重叠（"B" 起点 10 < 上一区间终点 20）' });
  });

  it('min >= max → 不合法（区间为空）', () => {
    expect(
      validateRanges([
        { min: null, max: 10, label: 'A' },
        { min: 20, max: 15, label: 'B' },
        { min: 15, max: null, label: 'C' },
      ]),
    ).toEqual({ ok: false, error: '"B" 区间起点 20 不小于终点 15' });
  });

  it('非首个区间 min=null → 不合法（仅首个允许 -∞）', () => {
    expect(
      validateRanges([
        { min: 0, max: 10, label: 'A' },
        { min: null, max: 20, label: 'B' },
      ]),
    ).toEqual({ ok: false, error: '"B" 区间起点未指定（仅第一个区间允许）' });
  });

  it('非末尾区间 max=null → 不合法（仅末尾允许 +∞）', () => {
    expect(
      validateRanges([
        { min: 0, max: null, label: 'A' },
        { min: 10, max: 20, label: 'B' },
      ]),
    ).toEqual({ ok: false, error: '"A" 区间终点未指定（仅最后一个区间允许）' });
  });
});
