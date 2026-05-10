/**
 * aggregators 测试 — 核心不变量:
 *   I1. 数值类型返回完整 aggregator 列表(含 SUM/AVG/MIN/MAX/...)
 *   I2. 非数值类型只返回 COUNT/COUNT_DISTINCT/FIRST/LAST/ATTR
 *   I3. null/undefined 走非数值分支(保守,避免对字符串算 SUM)
 *   I4. label 对所有 Aggregator 都有定义(避免渲染 undefined)
 *   I5. normalizeMetadataAggregator 把小写转大写;非法返回 null
 */
import { describe, expect, it } from 'vitest';

import type { Aggregator } from '../../types/query.js';

import {
  applicableAggregators,
  getAggregatorLabel,
  isNumericValueType,
  normalizeMetadataAggregator,
} from './aggregators.js';

describe('applicableAggregators', () => {
  it('I1: 数值类型 → 完整列表(含 SUM)', () => {
    const aggs = applicableAggregators('INTEGER');
    expect(aggs).toContain('SUM');
    expect(aggs).toContain('AVG');
    expect(aggs).toContain('COUNT');
    expect(aggs).toContain('COUNT_DISTINCT');
    expect(aggs.length).toBeGreaterThan(8); // 至少 9 个
  });

  it('I2: 非数值类型 → 只有 COUNT/COUNT_DISTINCT/FIRST/LAST/ATTR', () => {
    const aggs = applicableAggregators('STRING');
    expect([...aggs]).toEqual(['COUNT', 'COUNT_DISTINCT', 'FIRST', 'LAST', 'ATTR']);
  });

  it('I3: null/undefined 按非数值处理', () => {
    expect(applicableAggregators(null)).toEqual(applicableAggregators('STRING'));
    expect(applicableAggregators(undefined)).toEqual(applicableAggregators('STRING'));
  });

  it('I3+: DATE/BOOLEAN 按非数值处理', () => {
    expect(applicableAggregators('DATE')).toEqual(applicableAggregators('STRING'));
    expect(applicableAggregators('BOOLEAN')).toEqual(applicableAggregators('STRING'));
  });
});

describe('isNumericValueType', () => {
  it('数值集合', () => {
    for (const t of ['INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC'] as const) {
      expect(isNumericValueType(t)).toBe(true);
    }
  });
  it('非数值', () => {
    for (const t of ['STRING', 'DATE', 'BOOLEAN', 'TIMESTAMP'] as const) {
      expect(isNumericValueType(t)).toBe(false);
    }
    expect(isNumericValueType(null)).toBe(false);
    expect(isNumericValueType(undefined)).toBe(false);
  });
});

describe('getAggregatorLabel', () => {
  it('I4: 所有 Aggregator 都有 label', () => {
    const all: Aggregator[] = [
      'SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT',
      'ATTR', 'MEDIAN', 'STDDEV_POP', 'STDDEV_SAMP', 'VAR_POP', 'VAR_SAMP',
      'LIST', 'LIST_DISTINCT', 'FIRST', 'LAST',
    ];
    for (const a of all) {
      const label = getAggregatorLabel(a);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeMetadataAggregator', () => {
  it('I5: 小写 → 大写', () => {
    expect(normalizeMetadataAggregator('sum')).toBe('SUM');
    expect(normalizeMetadataAggregator('count_distinct')).toBe('COUNT_DISTINCT');
  });
  it('I5: 大写直接通过', () => {
    expect(normalizeMetadataAggregator('SUM')).toBe('SUM');
  });
  it('I5: 非法/空返回 null', () => {
    expect(normalizeMetadataAggregator(null)).toBeNull();
    expect(normalizeMetadataAggregator('')).toBeNull();
    expect(normalizeMetadataAggregator('FOO')).toBeNull();
  });
});
