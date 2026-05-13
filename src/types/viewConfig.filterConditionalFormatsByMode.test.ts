/**
 * filterConditionalFormatsByMode — P5+ 透视/明细 规则隔离辅助
 *
 * 不变量:
 *   - rule.mode === undefined → 视为 'pivot'(兼容旧序列化)
 *   - rule.mode === 'pivot' → 仅在 mode='pivot' 时入选
 *   - rule.mode === 'adhoc' → 仅在 mode='adhoc' 时入选
 */
import { describe, expect, it } from 'vitest';

import {
  filterConditionalFormatsByMode,
  type ConditionalFormatRule,
} from './viewConfig.js';

const rules: ConditionalFormatRule[] = [
  // 旧 rule:无 mode 字段
  { id: 'r1', measure: 'sales', kind: 'threshold', conditions: [{ op: 'gt', value: 0, style: {} }] },
  // 显式 pivot
  { id: 'r2', mode: 'pivot', measure: 'cost', kind: 'dataBar', color: 'blue', range: 'auto' },
  // adhoc
  { id: 'r3', mode: 'adhoc', measure: 'price', kind: 'topN', n: 3, style: { bg: 'gold' } },
];

describe('filterConditionalFormatsByMode', () => {
  it('mode=pivot → 含旧 rule(无 mode 字段)+ 显式 pivot rule', () => {
    const out = filterConditionalFormatsByMode(rules, 'pivot');
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('mode=adhoc → 仅 mode=adhoc 的 rule', () => {
    const out = filterConditionalFormatsByMode(rules, 'adhoc');
    expect(out.map((r) => r.id)).toEqual(['r3']);
  });

  it('空数组 → 空数组', () => {
    expect(filterConditionalFormatsByMode([], 'pivot')).toEqual([]);
    expect(filterConditionalFormatsByMode([], 'adhoc')).toEqual([]);
  });

  it('返回值不带未匹配 mode 的 rule(防止跨 mode 串味)', () => {
    const pivotOut = filterConditionalFormatsByMode(rules, 'pivot');
    expect(pivotOut.every((r) => (r.mode ?? 'pivot') === 'pivot')).toBe(true);
    const adhocOut = filterConditionalFormatsByMode(rules, 'adhoc');
    expect(adhocOut.every((r) => r.mode === 'adhoc')).toBe(true);
  });
});
