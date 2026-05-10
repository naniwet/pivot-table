/**
 * astToMdx — AST → MDX 表达式字符串
 *
 * PRD §9 翻译规则：
 *   - [字段] → [Measures].[字段]
 *   - 算术 +/-/* / 直接拼接 + 括号保证优先级
 *   - SUM([X]) → Sum({...}, [Measures].[X])（实际 set 由后端补，前端仅占位 {...}）
 *   - 数字直接输出
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
    const ast = parseExpression('SUM([销售额])');
    expect(astToMdx(ast)).toBe('Sum({...}, [Measures].[销售额])');
  });

  it('AVG / MAX / MIN 各自首字母大写', () => {
    expect(astToMdx(parseExpression('AVG([X])'))).toBe('Avg({...}, [Measures].[X])');
    expect(astToMdx(parseExpression('MAX([X])'))).toBe('Max({...}, [Measures].[X])');
    expect(astToMdx(parseExpression('MIN([X])'))).toBe('Min({...}, [Measures].[X])');
    expect(astToMdx(parseExpression('COUNT([X])'))).toBe('Count({...}, [Measures].[X])');
  });

  it('一元负：-[X]', () => {
    const ast = parseExpression('-[X]');
    expect(astToMdx(ast)).toBe('-[Measures].[X]');
  });
});
