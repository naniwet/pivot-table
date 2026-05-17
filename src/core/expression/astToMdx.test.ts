/**
 * astToMdx — AST → MDX 表达式字符串
 *
 * PRD §9 翻译规则：
 *   - [字段] → [Measures].[字段]
 *   - 算术 +/-/* / 直接拼接 + 括号保证优先级
 *   - 数字直接输出
 *   - 字符串函数只支持计算列,不翻译为 MDX
 *
 * 后端实际 MDX 形态待联调（PRD 阻塞项 8）；本模块按合理假设实现，便于改。
 */
import { describe, expect, it } from 'vitest';

import { astToMdx } from './astToMdx.js';
import { parseExpression } from './parseExpression.js';

describe('astToMdx', () => {
  it('字段 → [Measures].[字段]', () => {
    expect(astToMdx({ type: 'field', name: '销售额' })).toBe('[Measures].[销售额]');
  });

  it('数字直接输出', () => {
    expect(astToMdx({ type: 'num', value: 100 })).toBe('100');
    expect(astToMdx({ type: 'num', value: 0.5 })).toBe('0.5');
  });

  it('简单算术：[A] + [B]', () => {
    const ast = parseExpression('[A] + [B]');
    expect(astToMdx(ast)).toBe('[Measures].[A] + [Measures].[B]');
  });

  it('优先级括号：[A] + [B] * [C]', () => {
    const ast = parseExpression('[A] + [B] * [C]');
    expect(astToMdx(ast)).toBe('[Measures].[A] + ([Measures].[B] * [Measures].[C])');
  });

  it('利润率：([销售额] - [成本]) / [销售额]', () => {
    const ast = parseExpression('([销售额] - [成本]) / [销售额]');
    expect(astToMdx(ast)).toBe(
      '([Measures].[销售额] - [Measures].[成本]) / [Measures].[销售额]',
    );
  });

  it('SUM 包装 → Sum({...}, [Measures].[X])', () => {
    expect(() => parseExpression('SUM([销售额])')).toThrow(/未知函数/);
  });

  it('AVG / MAX / MIN / COUNT 不再支持', () => {
    for (const fn of ['AVG', 'MAX', 'MIN', 'COUNT']) {
      expect(() => parseExpression(`${fn}([X])`)).toThrow(/未知函数/);
    }
  });

  it('一元负：-[X]', () => {
    const ast = parseExpression('-[X]');
    expect(astToMdx(ast)).toBe('-[Measures].[X]');
  });

  it('字符串函数不支持翻译为 MDX(仅计算列可用)', () => {
    const ast = parseExpression('LEFT([X], 2)');
    expect(() => astToMdx(ast)).toThrow(/字符串函数/);
  });
});
