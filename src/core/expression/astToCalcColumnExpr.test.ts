/**
 * astToCalcColumnExpr — AST → CalcColumn.expr 字符串
 *
 * 翻译规则:
 *   - [field name] → resolveColumnName 解析后的物理列名(`[col]` 形态)
 *   - num / +-* / 一元负 / 括号 — 同 astToMdx 的算术处理
 *   - **resolveColumnName 返回 null/undefined → throw**(找不到对应物理列)
 *
 * 跟 astToMdx 的 sibling 镜像;后端 schema 由 probe-calc-column.ts 实测确认 `[col]` 形态可用。
 */
import { describe, expect, it } from 'vitest';

import { astToCalcColumnExpr } from './astToCalcColumnExpr.js';
import { parseExpression } from './parseExpression.js';

/** identity resolver — 测试用,直接把 measure name 当 column name 透传 */
const identity = (n: string) => n;

describe('astToCalcColumnExpr', () => {
  it('字段 → [col_name](由 resolver 解析)', () => {
    expect(astToCalcColumnExpr({ type: 'field', name: '销售额' }, identity)).toBe('[销售额]');
  });

  it('数字直接输出', () => {
    expect(astToCalcColumnExpr({ type: 'num', value: 100 }, identity)).toBe('100');
    expect(astToCalcColumnExpr({ type: 'num', value: 0.5 }, identity)).toBe('0.5');
  });

  it('简单算术:[A] / [B](resolver 透传)', () => {
    const ast = parseExpression('[A] / [B]');
    expect(astToCalcColumnExpr(ast, identity)).toBe('[A] / [B]');
  });

  it('优先级括号:[A] + [B] * [C] → [B]*[C] 加括号', () => {
    const ast = parseExpression('[A] + [B] * [C]');
    expect(astToCalcColumnExpr(ast, identity)).toBe('[A] + ([B] * [C])');
  });

  it('均价场景:[销售额] / [数量]', () => {
    const ast = parseExpression('[销售额] / [数量]');
    expect(astToCalcColumnExpr(ast, identity)).toBe('[销售额] / [数量]');
  });

  it('一元负:-[X]', () => {
    const ast = parseExpression('-[X]');
    expect(astToCalcColumnExpr(ast, identity)).toBe('-[X]');
  });

  it('字符串函数:SUBSTRING / LEFT / RIGHT / LENGTH / TRIM', () => {
    expect(astToCalcColumnExpr(parseExpression('SUBSTRING([名称], 1, 3)'), identity)).toBe(
      'SUBSTRING([名称], 1, 3)',
    );
    expect(astToCalcColumnExpr(parseExpression('LEFT([名称], 2)'), identity)).toBe(
      'LEFT([名称], 2)',
    );
    expect(astToCalcColumnExpr(parseExpression('RIGHT([名称], 2)'), identity)).toBe(
      'RIGHT([名称], 2)',
    );
    expect(astToCalcColumnExpr(parseExpression('LENGTH([名称])'), identity)).toBe(
      'LENGTH([名称])',
    );
    expect(astToCalcColumnExpr(parseExpression('TRIM([名称])'), identity)).toBe(
      'TRIM([名称])',
    );
  });

  it('字符串函数里的字段引用也走 resolver', () => {
    const ast = parseExpression('LEFT([产品名称], 2)');
    expect(astToCalcColumnExpr(ast, (n) => (n === '产品名称' ? 'product_name' : null))).toBe(
      'LEFT([product_name], 2)',
    );
  });

  it('resolver 把 measure name 翻译成 column name', () => {
    // 模拟 customElements 的真实路径:resolver 用 metadata 把 [m_name] → [field_name]
    const resolver = (n: string) => {
      if (n === '销售额_m') return '销售额';
      if (n === '数量_m') return '数量';
      return null;
    };
    const ast = parseExpression('[销售额_m] / [数量_m]');
    expect(astToCalcColumnExpr(ast, resolver)).toBe('[销售额] / [数量]');
  });

  it('resolver 返回 null → throw(找不到对应物理列)', () => {
    const ast = parseExpression('[未知字段]');
    expect(() => astToCalcColumnExpr(ast, () => null)).toThrow(
      /找不到对应物理列/,
    );
  });

  it('resolver 返回 undefined → throw', () => {
    const ast = parseExpression('[X]');
    expect(() => astToCalcColumnExpr(ast, () => undefined)).toThrow(
      /找不到对应物理列/,
    );
  });

  it('部分 resolver 失败:多 ref 中任一返回 null → throw', () => {
    const ast = parseExpression('[A] + [B]');
    const resolver = (n: string) => (n === 'A' ? 'col_A' : null);
    expect(() => astToCalcColumnExpr(ast, resolver)).toThrow(/B.*找不到/);
  });

  it('SUM/AVG/COUNT/MAX/MIN 在 parser 层不再支持', () => {
    expect(() => parseExpression('SUM([X])')).toThrow(/未知函数/);
  });
});
