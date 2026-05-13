/**
 * computeAdhocStats — DetailRenderer 用的 per-column min/max + topN/bottomN cutoff
 *
 * 不变量参见 computeAdhocStats.ts 头部注释
 */
import { describe, expect, it } from 'vitest';

import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import { computeAdhocStats } from './computeAdhocStats.js';

function rows(...paths: ReadonlyArray<ReadonlyArray<string | number | null>>) {
  return paths.map((fullPath) => ({ fullPath }));
}

const TOP_RULE = (id: string, measure: string, n: number): ConditionalFormatRule => ({
  id,
  mode: 'adhoc',
  measure,
  kind: 'topN',
  n,
  style: { bg: 'gold' },
});
const BOTTOM_RULE = (id: string, measure: string, n: number): ConditionalFormatRule => ({
  id,
  mode: 'adhoc',
  measure,
  kind: 'bottomN',
  n,
  style: { bg: 'red' },
});

describe('computeAdhocStats — colRanges', () => {
  it('空数据 → 空 Map', () => {
    const r = computeAdhocStats({
      rows: [],
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [],
    });
    expect(r.colRanges.size).toBe(0);
    expect(r.cutoffsByRuleId.size).toBe(0);
  });

  it('数值列 → min/max', () => {
    const r = computeAdhocStats({
      rows: rows([10], [50], [30]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [],
    });
    expect(r.colRanges.get('sales')).toEqual({ min: 10, max: 50 });
  });

  it('非数值列不参与(白名单严格)', () => {
    // sales 在白名单,name 不在 → name 列虽然有"数字字符串"也跳过
    const r = computeAdhocStats({
      rows: rows([10, '100'], [20, '200']),
      columnFieldNames: ['sales', 'name'],
      numericFieldNames: new Set(['sales']),
      rules: [],
    });
    expect(r.colRanges.get('sales')).toEqual({ min: 10, max: 20 });
    expect(r.colRanges.has('name')).toBe(false);
  });

  it('字符串数字会被 Number() 解析', () => {
    const r = computeAdhocStats({
      rows: rows(['41642282'], ['40835910']),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [],
    });
    expect(r.colRanges.get('sales')).toEqual({ min: 40835910, max: 41642282 });
  });

  it('null / 空串 / NaN / Infinity 跳过', () => {
    const r = computeAdhocStats({
      rows: rows([null], [''], [Number.NaN], [Number.POSITIVE_INFINITY], [42]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [],
    });
    expect(r.colRanges.get('sales')).toEqual({ min: 42, max: 42 });
  });
});

describe('computeAdhocStats — cutoffs', () => {
  it('top-3 cutoff = 第 3 大值', () => {
    const r = computeAdhocStats({
      rows: rows([10], [50], [30], [70], [20]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [TOP_RULE('t', 'sales', 3)],
    });
    // 降序 [70,50,30,20,10],top-3 cutoff=30
    expect(r.cutoffsByRuleId.get('t')).toEqual({ kind: 'topN', cutoff: 30 });
  });

  it('bottom-2 cutoff = 第 2 小值', () => {
    const r = computeAdhocStats({
      rows: rows([10], [50], [30], [70], [20]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [BOTTOM_RULE('b', 'sales', 2)],
    });
    // 升序 [10,20,30,50,70],bottom-2 cutoff=20
    expect(r.cutoffsByRuleId.get('b')).toEqual({ kind: 'bottomN', cutoff: 20 });
  });

  it('n 超过数据量 → cutoff 取末值(全命中)', () => {
    const r = computeAdhocStats({
      rows: rows([10], [20]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [TOP_RULE('t', 'sales', 10)],
    });
    expect(r.cutoffsByRuleId.get('t')).toEqual({ kind: 'topN', cutoff: 10 });
  });

  it('threshold / dataBar 不参与 cutoff 算',  () => {
    const th: ConditionalFormatRule = {
      id: 'x',
      mode: 'adhoc',
      measure: 'sales',
      kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: { bg: 'red' } }],
    };
    const r = computeAdhocStats({
      rows: rows([10], [20]),
      columnFieldNames: ['sales'],
      numericFieldNames: new Set(['sales']),
      rules: [th],
    });
    expect(r.cutoffsByRuleId.size).toBe(0);
  });

  it('多列各算各 cutoff', () => {
    const r = computeAdhocStats({
      rows: rows(
        [10, 100],
        [20, 200],
        [30, 300],
      ),
      columnFieldNames: ['sales', 'cost'],
      numericFieldNames: new Set(['sales', 'cost']),
      rules: [TOP_RULE('ts', 'sales', 2), TOP_RULE('tc', 'cost', 1)],
    });
    expect(r.cutoffsByRuleId.get('ts')).toEqual({ kind: 'topN', cutoff: 20 });
    expect(r.cutoffsByRuleId.get('tc')).toEqual({ kind: 'topN', cutoff: 300 });
  });
});
