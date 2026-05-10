/**
 * conditionalFormat evaluateRule 测试 — 不变量参考 evaluateRule.ts 头部注释
 */
import { describe, expect, it } from 'vitest';

import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import {
  evaluateDataBar,
  evaluateThreshold,
  hasRulesFor,
  matchesCondition,
} from './evaluateRule.js';

const RED = '#ef4444';
const GREEN = '#22c55e';

describe('matchesCondition', () => {
  it.each([
    ['gt', 100, 99, false],
    ['gt', 100, 100, false],
    ['gt', 100, 101, true],
    ['gte', 100, 100, true],
    ['gte', 100, 99, false],
    ['lt', 100, 99, true],
    ['lt', 100, 100, false],
    ['lte', 100, 100, true],
    ['lte', 100, 101, false],
    ['eq', 100, 100, true],
    ['eq', 100, 99, false],
  ] as const)('op=%s value=%s cellValue=%s → %s', (op, value, cellValue, expected) => {
    expect(matchesCondition({ op, value, style: {} }, cellValue)).toBe(expected);
  });

  it('between [10, 20] 闭区间', () => {
    const c = { op: 'between' as const, value: [10, 20] as [number, number], style: {} };
    expect(matchesCondition(c, 10)).toBe(true);
    expect(matchesCondition(c, 15)).toBe(true);
    expect(matchesCondition(c, 20)).toBe(true);
    expect(matchesCondition(c, 9)).toBe(false);
    expect(matchesCondition(c, 21)).toBe(false);
  });

  it('between value 不是数组 → false(防御)', () => {
    expect(
      matchesCondition({ op: 'between', value: 10 as never, style: {} }, 15),
    ).toBe(false);
  });
});

describe('evaluateThreshold', () => {
  const sales = 'sales';
  const cost = 'cost';
  const ruleSalesGt100Red: ConditionalFormatRule = {
    id: 'r1',
    measure: sales,
    kind: 'threshold',
    conditions: [{ op: 'gt', value: 100, style: { bg: RED } }],
  };
  const ruleSalesLt0Green: ConditionalFormatRule = {
    id: 'r2',
    measure: sales,
    kind: 'threshold',
    conditions: [{ op: 'lt', value: 0, style: { bg: GREEN } }],
  };

  it('measure 不匹配 → 空 style', () => {
    expect(evaluateThreshold([ruleSalesGt100Red], cost, 999)).toEqual({});
  });

  it('measure 匹配 + 命中 → 返回 style', () => {
    expect(evaluateThreshold([ruleSalesGt100Red], sales, 200)).toEqual({ bg: RED });
  });

  it('measure 匹配但条件不命中 → 空 style', () => {
    expect(evaluateThreshold([ruleSalesGt100Red], sales, 50)).toEqual({});
  });

  it('多 rule 同 measure → 第一条命中即返回(顺序决定优先级)', () => {
    // 先放 lt0=Green 后放 gt100=Red
    const rules = [ruleSalesLt0Green, ruleSalesGt100Red];
    expect(evaluateThreshold(rules, sales, -10)).toEqual({ bg: GREEN });
    expect(evaluateThreshold(rules, sales, 200)).toEqual({ bg: RED });
    expect(evaluateThreshold(rules, sales, 50)).toEqual({}); // 都不命中
  });

  it('多条件在同一 rule 内,按 conditions 顺序匹配', () => {
    const rule: ConditionalFormatRule = {
      id: 'r',
      measure: sales,
      kind: 'threshold',
      conditions: [
        { op: 'gt', value: 200, style: { bg: 'red', bold: true } },
        { op: 'gt', value: 100, style: { bg: 'orange' } },
      ],
    };
    // 250 命中第一条
    expect(evaluateThreshold([rule], sales, 250)).toEqual({ bg: 'red', bold: true });
    // 150 命中第二条(因为第一条 200 不命中)
    expect(evaluateThreshold([rule], sales, 150)).toEqual({ bg: 'orange' });
  });

  it('dataBar rule 不参与 threshold 评估', () => {
    const dataBar: ConditionalFormatRule = {
      id: 'db',
      measure: sales,
      kind: 'dataBar',
      color: 'blue',
      range: 'auto',
    };
    expect(evaluateThreshold([dataBar], sales, 200)).toEqual({});
  });
});

describe('evaluateDataBar', () => {
  const sales = 'sales';
  const dataBarAuto: ConditionalFormatRule = {
    id: 'db',
    measure: sales,
    kind: 'dataBar',
    color: 'steelblue',
    range: 'auto',
  };

  it('没规则 → null', () => {
    expect(evaluateDataBar([], sales, 100, { min: 0, max: 200 })).toBeNull();
  });

  it('measure 不匹配 → null', () => {
    expect(evaluateDataBar([dataBarAuto], 'cost', 100, { min: 0, max: 200 })).toBeNull();
  });

  it('range=auto 时拿不到 colMinMax → null(全空列防御)', () => {
    expect(evaluateDataBar([dataBarAuto], sales, 100, null)).toBeNull();
  });

  it('range=auto 用 colMinMax 算 percent', () => {
    const r = evaluateDataBar([dataBarAuto], sales, 50, { min: 0, max: 100 });
    expect(r).toEqual({ color: 'steelblue', percent: 0.5 });
  });

  it('range=固定值 时不依赖 colMinMax', () => {
    const ruleFixed: ConditionalFormatRule = {
      id: 'db',
      measure: sales,
      kind: 'dataBar',
      color: 'red',
      range: { min: 0, max: 1 }, // 业务百分比量纲
    };
    const r = evaluateDataBar([ruleFixed], sales, 0.3, null);
    expect(r).toEqual({ color: 'red', percent: 0.3 });
  });

  it('value < min → percent clip 到 0(不画负 bar)', () => {
    const r = evaluateDataBar([dataBarAuto], sales, -10, { min: 0, max: 100 });
    expect(r?.percent).toBe(0);
  });

  it('value > max → percent clip 到 1', () => {
    const r = evaluateDataBar([dataBarAuto], sales, 200, { min: 0, max: 100 });
    expect(r?.percent).toBe(1);
  });

  it('max <= min(退化范围)→ null', () => {
    expect(evaluateDataBar([dataBarAuto], sales, 50, { min: 100, max: 100 })).toBeNull();
    expect(evaluateDataBar([dataBarAuto], sales, 50, { min: 100, max: 50 })).toBeNull();
  });

  it('threshold rule 不参与 dataBar 评估', () => {
    const t: ConditionalFormatRule = {
      id: 't',
      measure: sales,
      kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: { bg: 'red' } }],
    };
    expect(evaluateDataBar([t], sales, 50, { min: 0, max: 100 })).toBeNull();
  });
});

describe('hasRulesFor', () => {
  it('measure 有规则 → true', () => {
    const r: ConditionalFormatRule = {
      id: 'r', measure: 'sales', kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: {} }],
    };
    expect(hasRulesFor([r], 'sales')).toBe(true);
  });

  it('measure 无规则 → false', () => {
    expect(hasRulesFor([], 'sales')).toBe(false);
  });

  it('其他 measure 有规则但目标 measure 没 → false', () => {
    const r: ConditionalFormatRule = {
      id: 'r', measure: 'cost', kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: {} }],
    };
    expect(hasRulesFor([r], 'sales')).toBe(false);
  });
});
