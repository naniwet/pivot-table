/**
 * parseExpression — 字段表达式 → AST (P2 §9)
 *
 * 支持的最小语法集（PRD 严格限定）：
 *   - 字段引用 [字段名]（alias）
 *   - 数字字面量 123 / 0.5 / -1
 *   - 算术 + - * /  + 括号
 *   - 计算列字符串函数 SUBSTRING() LEFT() RIGHT() LENGTH() TRIM()
 *
 * 明确拒绝：IF / CASE / 字符串字面量 / 时间函数 / 聚合函数 / MDX 操作 / 自定义函数
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

describe('parseExpression — 字符串函数', () => {
  it('SUBSTRING([名称], 1, 3)', () => {
    expect(parseExpression('SUBSTRING([名称], 1, 3)')).toEqual({
      type: 'strfn',
      fn: 'SUBSTRING',
      args: [
        { type: 'field', name: '名称' },
        { type: 'num', value: 1 },
        { type: 'num', value: 3 },
      ],
    });
  });

  it('LEFT / RIGHT / LENGTH / TRIM 各支持', () => {
    expect((parseExpression('left([X], 2)') as { fn: string }).fn).toBe('LEFT');
    expect((parseExpression('RIGHT([X], 2)') as { fn: string }).fn).toBe('RIGHT');
    expect((parseExpression('LENGTH([X])') as { fn: string }).fn).toBe('LENGTH');
    expect((parseExpression('TRIM([X])') as { fn: string }).fn).toBe('TRIM');
  });

  it('字符串函数参数可以是表达式', () => {
    const ast = parseExpression('SUBSTRING([A], 1 + 1, 3)') as { args: { type: string }[] };
    expect(ast.args[1]).toEqual({
      type: 'binop',
      op: '+',
      left: { type: 'num', value: 1 },
      right: { type: 'num', value: 1 },
    });
  });

  it('字符串函数可参与表达式:LENGTH([A]) - LENGTH([B])', () => {
    const ast = parseExpression('LENGTH([A]) - LENGTH([B])');
    expect(ast).toEqual({
      type: 'binop',
      op: '-',
      left: { type: 'strfn', fn: 'LENGTH', args: [{ type: 'field', name: 'A' }] },
      right: { type: 'strfn', fn: 'LENGTH', args: [{ type: 'field', name: 'B' }] },
    });
  });

  it('函数参数个数不对 → throw', () => {
    expect(() => parseExpression('SUBSTRING([A], 1)')).toThrow(/参数个数/);
    expect(() => parseExpression('LEFT([A])')).toThrow(/参数个数/);
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

  it('聚合函数不再支持 → throw', () => {
    for (const fn of ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN']) {
      expect(() => parseExpression(`${fn}([A])`)).toThrow(/未知函数/);
    }
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
