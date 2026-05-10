/**
 * parseExpression — 字段表达式 → AST (P2 §9)
 *
 * 支持的最小语法集（PRD 严格限定）：
 *   - 字段引用 [字段名]（alias）
 *   - 数字字面量 123 / 0.5 / -1
 *   - 算术 + - * /  + 括号
 *   - 聚合函数 SUM() AVG() COUNT() MAX() MIN()
 *
 * 明确拒绝：IF / CASE / 字符串/时间函数 / MDX 操作 / 自定义函数
 */
import { describe, expect, it } from 'vitest';

import { parseExpression } from './parseExpression.js';

describe('parseExpression — 数字 / 字段', () => {
  it('数字字面量', () => {
    expect(parseExpression('100')).toEqual({ type: 'num', value: 100 });
    expect(parseExpression('0.5')).toEqual({ type: 'num', value: 0.5 });
  });

  it('字段引用 [销售额]', () => {
    expect(parseExpression('[销售额]')).toEqual({ type: 'field', name: '销售额' });
  });

  it('字段名含英文', () => {
    expect(parseExpression('[Sales]')).toEqual({ type: 'field', name: 'Sales' });
  });

  it('未闭合的字段 → throw', () => {
    expect(() => parseExpression('[销售额')).toThrow(/未闭合/);
  });
});

describe('parseExpression — 二元算术', () => {
  it('[A] + [B]', () => {
    expect(parseExpression('[A] + [B]')).toEqual({
      type: 'binop',
      op: '+',
      left: { type: 'field', name: 'A' },
      right: { type: 'field', name: 'B' },
    });
  });

  it('优先级：[A] + [B] * [C]  应解析为 A + (B*C)', () => {
    const ast = parseExpression('[A] + [B] * [C]');
    expect(ast).toEqual({
      type: 'binop',
      op: '+',
      left: { type: 'field', name: 'A' },
      right: {
        type: 'binop',
        op: '*',
        left: { type: 'field', name: 'B' },
        right: { type: 'field', name: 'C' },
      },
    });
  });

  it('括号改优先级：([A] + [B]) * [C]', () => {
    const ast = parseExpression('([A] + [B]) * [C]');
    expect(ast).toEqual({
      type: 'binop',
      op: '*',
      left: {
        type: 'binop',
        op: '+',
        left: { type: 'field', name: 'A' },
        right: { type: 'field', name: 'B' },
      },
      right: { type: 'field', name: 'C' },
    });
  });

  it('左结合：[A] - [B] - [C]  应为 (A-B) - C', () => {
    const ast = parseExpression('[A] - [B] - [C]') as { right: { type: string } };
    // (A - B) - C → 顶层 op='-', right=C
    expect((ast as { right: { type: string } }).right).toEqual({ type: 'field', name: 'C' });
  });
});

describe('parseExpression — 聚合函数', () => {
  it('SUM([销售额])', () => {
    expect(parseExpression('SUM([销售额])')).toEqual({
      type: 'agg',
      fn: 'SUM',
      arg: { type: 'field', name: '销售额' },
    });
  });

  it('AVG / COUNT / MAX / MIN 各支持', () => {
    expect((parseExpression('AVG([X])') as { fn: string }).fn).toBe('AVG');
    expect((parseExpression('COUNT([X])') as { fn: string }).fn).toBe('COUNT');
    expect((parseExpression('MAX([X])') as { fn: string }).fn).toBe('MAX');
    expect((parseExpression('MIN([X])') as { fn: string }).fn).toBe('MIN');
  });

  it('聚合参数可以是表达式：SUM([A] + [B])', () => {
    const ast = parseExpression('SUM([A] + [B])') as { arg: { type: string } };
    expect(ast.arg.type).toBe('binop');
  });

  it('SUM([A]) - SUM([B])', () => {
    const ast = parseExpression('SUM([A]) - SUM([B])');
    expect(ast).toEqual({
      type: 'binop',
      op: '-',
      left: { type: 'agg', fn: 'SUM', arg: { type: 'field', name: 'A' } },
      right: { type: 'agg', fn: 'SUM', arg: { type: 'field', name: 'B' } },
    });
  });

  it('未知函数 → throw', () => {
    expect(() => parseExpression('FOO([A])')).toThrow(/未知函数/);
  });
});

describe('parseExpression — 业务样例（PRD 附录 C 期望工作）', () => {
  it('利润率：([销售额] - [成本]) / [销售额]', () => {
    const ast = parseExpression('([销售额] - [成本]) / [销售额]');
    expect((ast as { type: string }).type).toBe('binop');
  });

  it('单元价：[销售额] / [数量]', () => {
    expect(parseExpression('[销售额] / [数量]')).toEqual({
      type: 'binop',
      op: '/',
      left: { type: 'field', name: '销售额' },
      right: { type: 'field', name: '数量' },
    });
  });
});

describe('parseExpression — 反例（PRD 附录 C 必须拒绝）', () => {
  it('IF 表达式 → throw', () => {
    expect(() => parseExpression('IF([A] > 0, 1, 0)')).toThrow();
  });

  it('字符串字面量 → throw', () => {
    expect(() => parseExpression('"hello"')).toThrow();
  });

  it('空表达式 → throw', () => {
    expect(() => parseExpression('')).toThrow(/空/);
    expect(() => parseExpression('   ')).toThrow(/空/);
  });

  it('多余 token → throw', () => {
    expect(() => parseExpression('[A] [B]')).toThrow();
  });

  it('未闭合括号 → throw', () => {
    expect(() => parseExpression('([A]')).toThrow(/未闭合/);
  });
});
