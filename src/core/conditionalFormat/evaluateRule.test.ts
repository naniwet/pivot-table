/**
 * conditionalFormat evaluateRule 测试 — 不变量参考 evaluateRule.ts 头部注释
 */
import { describe, expect, it } from 'vitest';

import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import type { CutoffsByRuleId } from './computeTopBottomCutoffs.js';
import {
  computeRowScopeStyles,
  evaluateDataBar,
  evaluateThreshold,
  evaluateTopBottom,
  getRuleScope,
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

describe('evaluateTopBottom', () => {
  const sales = 'sales';
  const cost = 'cost';
  const GOLD = '#facc15';
  const RED = '#ef4444';
  const topSalesRule: ConditionalFormatRule = {
    id: 't1',
    measure: sales,
    kind: 'topN',
    n: 3,
    style: { bg: GOLD },
  };
  const bottomSalesRule: ConditionalFormatRule = {
    id: 'b1',
    measure: sales,
    kind: 'bottomN',
    n: 2,
    style: { bg: RED },
  };
  const cutoffs: CutoffsByRuleId = new Map([
    ['t1', { kind: 'topN', cutoff: 30 }], // top-3 cutoff
    ['b1', { kind: 'bottomN', cutoff: 20 }], // bottom-2 cutoff
  ]);

  it('measure 不匹配 → 空 style', () => {
    expect(evaluateTopBottom([topSalesRule], cost, 100, cutoffs)).toEqual({});
  });

  it('topN: cellValue >= cutoff → 命中(并列也命中)', () => {
    expect(evaluateTopBottom([topSalesRule], sales, 50, cutoffs)).toEqual({ bg: GOLD });
    expect(evaluateTopBottom([topSalesRule], sales, 30, cutoffs)).toEqual({ bg: GOLD }); // 并列
    expect(evaluateTopBottom([topSalesRule], sales, 29, cutoffs)).toEqual({});
  });

  it('bottomN: cellValue <= cutoff → 命中(并列也命中)', () => {
    expect(evaluateTopBottom([bottomSalesRule], sales, 10, cutoffs)).toEqual({ bg: RED });
    expect(evaluateTopBottom([bottomSalesRule], sales, 20, cutoffs)).toEqual({ bg: RED }); // 并列
    expect(evaluateTopBottom([bottomSalesRule], sales, 21, cutoffs)).toEqual({});
  });

  it('cutoff 没出现在 Map(列全空)→ 跳过该 rule', () => {
    const emptyCutoffs: CutoffsByRuleId = new Map();
    expect(evaluateTopBottom([topSalesRule], sales, 50, emptyCutoffs)).toEqual({});
  });

  it('threshold / dataBar rule 不参与 topBottom 评估', () => {
    const t: ConditionalFormatRule = {
      id: 'x',
      measure: sales,
      kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: { bg: 'pink' } }],
    };
    const db: ConditionalFormatRule = {
      id: 'd',
      measure: sales,
      kind: 'dataBar',
      color: 'blue',
      range: 'auto',
    };
    expect(evaluateTopBottom([t, db], sales, 100, cutoffs)).toEqual({});
  });

  it('多 topN/bottomN rule 同 measure → 按数组顺序第一条命中即返回', () => {
    // 用户配 top-1(gold) + top-3(green);value=50 同时落在两个范围,top-1 优先
    const top1: ConditionalFormatRule = {
      id: 't1',
      measure: sales,
      kind: 'topN',
      n: 1,
      style: { bg: 'gold' },
    };
    const top3: ConditionalFormatRule = {
      id: 't3',
      measure: sales,
      kind: 'topN',
      n: 3,
      style: { bg: 'green' },
    };
    const cuts: CutoffsByRuleId = new Map([
      ['t1', { kind: 'topN', cutoff: 50 }], // 仅 50 入选
      ['t3', { kind: 'topN', cutoff: 30 }], // 30/40/50 入选
    ]);
    // 50 → 命中 top1
    expect(evaluateTopBottom([top1, top3], sales, 50, cuts)).toEqual({ bg: 'gold' });
    // 40 → top1 miss(40<50),top3 hit(40>=30)
    expect(evaluateTopBottom([top1, top3], sales, 40, cuts)).toEqual({ bg: 'green' });
    // 20 → 都 miss
    expect(evaluateTopBottom([top1, top3], sales, 20, cuts)).toEqual({});
  });

  it('topN + bottomN 共存,顺序决定优先级', () => {
    const cuts: CutoffsByRuleId = new Map([
      ['t1', { kind: 'topN', cutoff: 30 }],
      ['b1', { kind: 'bottomN', cutoff: 20 }],
    ]);
    // 25 在中间区,都不命中
    expect(evaluateTopBottom([topSalesRule, bottomSalesRule], sales, 25, cuts)).toEqual({});
    // 100 命中 topN(在 bottomN 之前)
    expect(evaluateTopBottom([topSalesRule, bottomSalesRule], sales, 100, cuts)).toEqual({ bg: GOLD });
    // 5 命中 bottomN
    expect(evaluateTopBottom([topSalesRule, bottomSalesRule], sales, 5, cuts)).toEqual({ bg: RED });
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

describe('getRuleScope', () => {
  it('threshold 默认 cell', () => {
    expect(
      getRuleScope({
        id: 'r', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: {} }],
      }),
    ).toBe('cell');
  });

  it('threshold scope=row 取 row', () => {
    expect(
      getRuleScope({
        id: 'r', scope: 'row', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: {} }],
      }),
    ).toBe('row');
  });

  it('topN scope=row 取 row', () => {
    expect(
      getRuleScope({
        id: 't', scope: 'row', measure: 'sales', kind: 'topN', n: 3, style: { bg: 'red' },
      }),
    ).toBe('row');
  });

  it('dataBar 没 scope 字段 → 强归 cell', () => {
    expect(
      getRuleScope({
        id: 'd', measure: 'sales', kind: 'dataBar', color: 'blue', range: 'auto',
      }),
    ).toBe('cell');
  });
});

describe('computeRowScopeStyles', () => {
  const RED = '#ef4444';
  const YELLOW = '#fde047';

  it('没 row-scope 规则 → 空 Map', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: { bg: RED } }],
      },
    ];
    const valueAt = () => 200;
    expect(computeRowScopeStyles(rules, 5, valueAt, new Map()).size).toBe(0);
  });

  it('row-scope threshold 命中 → 该 row 入 Map', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'r1', scope: 'row', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: { bg: RED } }],
      },
    ];
    // row 0 = 50(不命中), row 1 = 200(命中), row 2 = 150(命中)
    const valueAt = (r: number, _m: string) => [50, 200, 150][r] ?? null;
    const out = computeRowScopeStyles(rules, 3, valueAt, new Map());
    expect(out.size).toBe(2);
    expect(out.get(0)).toBeUndefined();
    expect(out.get(1)).toEqual({ bg: RED });
    expect(out.get(2)).toEqual({ bg: RED });
  });

  it('row-scope topN 命中 → 该 row 入 Map', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 't1', scope: 'row', measure: 'sales', kind: 'topN', n: 2,
        style: { bg: YELLOW },
      },
    ];
    const cutoffs: CutoffsByRuleId = new Map([['t1', { kind: 'topN', cutoff: 100 }]]);
    // row 0 = 200(>=100), row 1 = 50(<100), row 2 = 100(>=100)
    const valueAt = (r: number) => [200, 50, 100][r] ?? null;
    const out = computeRowScopeStyles(rules, 3, valueAt, cutoffs);
    expect(out.get(0)).toEqual({ bg: YELLOW });
    expect(out.get(1)).toBeUndefined();
    expect(out.get(2)).toEqual({ bg: YELLOW });
  });

  it('多 row-scope rule 同 row 命中 → 第一条 wins', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'r1', scope: 'row', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: { bg: RED } }],
      },
      {
        id: 'r2', scope: 'row', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 50, style: { bg: YELLOW } }],
      },
    ];
    const valueAt = () => 200;
    const out = computeRowScopeStyles(rules, 1, valueAt, new Map());
    expect(out.get(0)).toEqual({ bg: RED });
  });

  it('dataBar(无 scope)即使数组里也不参与 row-scope', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'd', measure: 'sales', kind: 'dataBar', color: 'blue', range: 'auto',
      },
    ];
    const valueAt = () => 999;
    expect(computeRowScopeStyles(rules, 3, valueAt, new Map()).size).toBe(0);
  });

  it('cellValueAt 返回 null → 跳过该 row', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'r1', scope: 'row', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: { bg: RED } }],
      },
    ];
    const valueAt = () => null;
    expect(computeRowScopeStyles(rules, 5, valueAt, new Map()).size).toBe(0);
  });

  it('cell-scope rule(scope=cell 或 undefined)不进 row-scope 结果', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'c1', measure: 'sales', kind: 'threshold', // scope 缺省=cell
        conditions: [{ op: 'gt', value: 0, style: { bg: RED } }],
      },
      {
        id: 'c2', scope: 'cell', measure: 'sales', kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: { bg: YELLOW } }],
      },
    ];
    const valueAt = () => 100;
    expect(computeRowScopeStyles(rules, 3, valueAt, new Map()).size).toBe(0);
  });
});
