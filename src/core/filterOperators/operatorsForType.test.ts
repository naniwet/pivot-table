/**
 * operatorsForType — 按 ValueType 决定 FilterPanel 上出现哪些 BinaryOperator。
 *
 * 设计:
 *   - 纯函数(dataType → operator 列表 + 业务名 label),无副作用
 *   - 不做 Between / IsEmpty(等 P1.5 嵌套 group modal 表达)
 *
 * 业务约定:
 *   - 数值/日期类:>, >=, <, <= + 等于/不等于/包含/不包含
 *   - 字符串类:等于/不等于/包含/不包含/Like/Contains/StartsWith/EndsWith
 *   - 布尔:仅等于/不等于
 *   - 未知/fallback:宽松开放(避免阻塞用户)
 *
 * 测试粒度:**按 ValueType 一个 it**(11 个),用 `arrayContaining` / `not arrayContaining`
 * 一次性 assert 一组操作符 — 不做 cross-product 扁平化(那只是 spec restatement,熵增无收益)。
 */
import { describe, expect, it } from 'vitest';

import { operatorsForType, isNumericLikeType, isTextLikeType } from './operatorsForType.js';

const NUMERIC_TYPES = ['INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC'] as const;
const DATE_TYPES = ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP'] as const;

describe('operatorsForType', () => {
  it('STRING → 含文本类全部 8 个操作符,不含数值比较', () => {
    const ops = operatorsForType('STRING').map((o) => o.value);
    expect(ops).toEqual(
      expect.arrayContaining([
        'In', 'NotIn', 'Equals', 'NotEquals', 'Like', 'Contains', 'StartsWith', 'EndsWith',
      ]),
    );
    expect(ops).not.toEqual(expect.arrayContaining(['GreaterThan', 'LessThan']));
  });

  it.each(NUMERIC_TYPES)('%s → 含数值比较 + 等于,不含 Like/Contains', (vt) => {
    const ops = operatorsForType(vt).map((o) => o.value);
    expect(ops).toEqual(
      expect.arrayContaining([
        'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual',
        'Equals', 'NotEquals', 'In', 'NotIn',
      ]),
    );
    expect(ops).not.toEqual(expect.arrayContaining(['Like', 'Contains']));
  });

  it.each(DATE_TYPES)('%s → 类似数值,含 GreaterThan/LessThan/Equals,不含 Like', (vt) => {
    const ops = operatorsForType(vt).map((o) => o.value);
    expect(ops).toEqual(expect.arrayContaining(['GreaterThan', 'LessThan', 'Equals']));
    expect(ops).not.toContain('Like');
  });

  it('BOOLEAN → 仅 Equals / NotEquals', () => {
    expect(operatorsForType('BOOLEAN').map((o) => o.value)).toEqual(['Equals', 'NotEquals']);
  });

  it('undefined / 未知 → 宽松回退(含基础 4 个)', () => {
    const ops = operatorsForType(undefined).map((o) => o.value);
    expect(ops).toEqual(expect.arrayContaining(['In', 'NotIn', 'Equals', 'NotEquals']));
  });

  it('每个 option 都有 label(中文业务名,UI 显示)', () => {
    const opts = operatorsForType('DOUBLE');
    expect(opts.every((o) => o.label.length > 0)).toBe(true);
  });
});

describe('isNumericLikeType / isTextLikeType', () => {
  it('isNumericLikeType: 数值 + 日期为 true,STRING/BOOLEAN/undefined 为 false', () => {
    expect(isNumericLikeType('DOUBLE')).toBe(true);
    expect(isNumericLikeType('INTEGER')).toBe(true);
    expect(isNumericLikeType('DATE')).toBe(true);
    expect(isNumericLikeType('STRING')).toBe(false);
    expect(isNumericLikeType('BOOLEAN')).toBe(false);
    expect(isNumericLikeType(undefined)).toBe(false);
  });

  it('isTextLikeType: STRING / ASCII_CODE 为 true', () => {
    expect(isTextLikeType('STRING')).toBe(true);
    expect(isTextLikeType('ASCII_CODE')).toBe(true);
    expect(isTextLikeType('DOUBLE')).toBe(false);
  });
});
