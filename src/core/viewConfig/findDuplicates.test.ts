/**
 * findDuplicates — 重复 chip 检测 + buildQuery 翻译前 dedup
 * 不变量参见 findDuplicates.ts 头部
 */
import { describe, expect, it } from 'vitest';

import type { RowField, ValueField } from '../../types/viewConfig.js';

import {
  dedupRowFields,
  dedupValueFields,
  findDuplicateColumnIndices,
  findDuplicateRowIndices,
  findDuplicateValueIndices,
  valueDedupKey,
} from './findDuplicates.js';

const row = (fieldName: string, type: RowField['type'] = 'Dimension'): RowField => ({
  fieldName,
  type,
});

const value = (
  measureName: string,
  aggregator: ValueField['aggregator'] = null,
  quickCalc: ValueField['quickCalc'] = null,
): ValueField => ({ measureName, aggregator, quickCalc });

describe('findDuplicateRowIndices', () => {
  it('空数组 → 空 Set', () => {
    expect(findDuplicateRowIndices([])).toEqual(new Set());
  });

  it('全 unique → 空 Set', () => {
    expect(findDuplicateRowIndices([row('a'), row('b'), row('c')])).toEqual(new Set());
  });

  it('一对重复 → index 1 进集合(first wins)', () => {
    expect(findDuplicateRowIndices([row('a'), row('a')])).toEqual(new Set([1]));
  });

  it('多对重复 + 多次出现 → 第 2 次及以后都进集合', () => {
    // [a, b, a, c, a, b] → idx 2(a 第 2 次), 4(a 第 3 次), 5(b 第 2 次)
    expect(
      findDuplicateRowIndices([row('a'), row('b'), row('a'), row('c'), row('a'), row('b')]),
    ).toEqual(new Set([2, 4, 5]));
  });

  it('Hierarchy / Dimension 不同 type 但同 fieldName → 仍算重复', () => {
    // 不太可能出现,但语义上 fieldName 是唯一性 key
    expect(
      findDuplicateRowIndices([row('a', 'Hierarchy'), row('a', 'Dimension')]),
    ).toEqual(new Set([1]));
  });
});

describe('findDuplicateColumnIndices', () => {
  it('跟 row 逻辑一致(共用 keyOf)', () => {
    expect(findDuplicateColumnIndices([row('x'), row('y'), row('x')])).toEqual(new Set([2]));
  });
});

describe('valueDedupKey', () => {
  it('(measureName, agg=null, qc=null)', () => {
    expect(valueDedupKey(value('sales'))).toBe('sales||');
  });

  it('agg 给值 → 进 key', () => {
    expect(valueDedupKey(value('sales', 'AVG'))).toBe('sales|AVG|');
  });

  it('quickCalc(无 dateLevel)→ enum 进 key', () => {
    expect(
      valueDedupKey(value('sales', null, { _enum: 'YearOnYear' } as never)),
    ).toBe('sales||YearOnYear');
  });

  it('quickCalc(带 dateLevel)→ enum:level 进 key(同 enum 不同 level 不冲突)', () => {
    const k1 = valueDedupKey(
      value('sales', null, { _enum: 'YearOnYear', dateLevel: 'Year' } as never),
    );
    const k2 = valueDedupKey(
      value('sales', null, { _enum: 'YearOnYear', dateLevel: 'Quarter' } as never),
    );
    expect(k1).not.toBe(k2);
  });

  // 2026-05-16 回归:quickCalc 现在两种形态 — 字符串('GlobalPercent' 等简单 _enum
  // 的实际 wire format)+ 对象(time intelligence)。dedup key 必须两种都识别,
  // 否则 "销售额" 跟 "销售额(占总计%)" 会被错算成重复 → 渲染层警告 + buildQuery
  // 把后者过滤掉 → 切快速计算后查询不发出。
  it('quickCalc 字符串形态(简单 _enum)→ enum 进 key', () => {
    expect(valueDedupKey(value('sales', null, 'GlobalPercent' as never))).toBe(
      'sales||GlobalPercent',
    );
  });

  it('同 measure 一个无 qc 一个字符串 qc → key 不同(防止 dedup 误杀)', () => {
    const k1 = valueDedupKey(value('sales', null, null));
    const k2 = valueDedupKey(value('sales', null, 'GlobalPercent' as never));
    expect(k1).not.toBe(k2);
  });
});

describe('findDuplicateValueIndices', () => {
  it('空 → 空 Set', () => {
    expect(findDuplicateValueIndices([])).toEqual(new Set());
  });

  it('同 measure 同 agg 同 qc → 重复', () => {
    expect(
      findDuplicateValueIndices([value('sales'), value('sales')]),
    ).toEqual(new Set([1]));
  });

  it('同 measure 不同 agg → 不重复', () => {
    expect(
      findDuplicateValueIndices([value('sales', 'SUM'), value('sales', 'AVG')]),
    ).toEqual(new Set());
  });

  it('同 measure 同 agg 不同 qc → 不重复', () => {
    expect(
      findDuplicateValueIndices([
        value('sales', null, null),
        value('sales', null, { _enum: 'YearOnYear' } as never),
      ]),
    ).toEqual(new Set());
  });

  it('多对重复混合 unique', () => {
    // [sales,sales,cost,sales(AVG),cost] → idx 1(sales 重), 4(cost 重)
    expect(
      findDuplicateValueIndices([
        value('sales'),
        value('sales'),
        value('cost'),
        value('sales', 'AVG'),
        value('cost'),
      ]),
    ).toEqual(new Set([1, 4]));
  });
});

describe('dedupRowFields / dedupValueFields(给 buildQuery 用)', () => {
  it('dedupRowFields 保留 first occurrence', () => {
    const result = dedupRowFields([row('a'), row('b'), row('a'), row('c')]);
    expect(result.map((r) => r.fieldName)).toEqual(['a', 'b', 'c']);
  });

  it('dedupValueFields 三元组重复才去', () => {
    const out = dedupValueFields([
      value('sales'),
      value('sales', 'AVG'),
      value('sales'), // 跟 idx 0 撞
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.aggregator).toBeNull();
    expect(out[1]!.aggregator).toBe('AVG');
  });

  it('全 unique → 原样返回(可能不同引用,但内容一致)', () => {
    const input = [value('a'), value('b'), value('c')];
    const out = dedupValueFields(input);
    expect(out).toHaveLength(3);
    expect(out.map((v) => v.measureName)).toEqual(['a', 'b', 'c']);
  });
});
