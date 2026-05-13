/**
 * computeTopBottomCutoffs — 给 evaluateTopBottom 用的 per-rule cutoff 预算
 */
import { describe, expect, it } from 'vitest';

import type { RenderModel } from '../../types/renderModel.js';
import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import { computeTopBottomCutoffs } from './computeTopBottomCutoffs.js';

function makeModel(
  rows: Array<Array<number | null>>,
  measureNames: string[],
): RenderModel {
  return {
    rowHeader: rows.map((_, r) => ({
      member: { name: `r${r}`, uniqueName: [`r${r}`], level: '', dimension: '', fieldName: '' },
      depth: 0,
      rowIndex: r,
      fullPath: [`r${r}`],
      hierarchyFieldName: null,
      canDrillDown: false,
      canDrillUp: false,
    })),
    columnHeader: measureNames.map((m) => ({
      fieldName: m,
      alias: m,
      dataFormat: '',
      isMeasure: true,
    })),
    matrix: rows.map((row) =>
      row.map((v) =>
        v === null
          ? { value: '', formattedValue: '', isEmpty: true, isMasked: false }
          : { value: v, formattedValue: String(v), isEmpty: false, isMasked: false },
      ),
    ),
    grandTotalRow: null,
    columnMeta: [],
    pagination: { totalRowCount: rows.length },
  };
}

const topRule = (id: string, measure: string, n: number): ConditionalFormatRule => ({
  id,
  measure,
  kind: 'topN',
  n,
  style: { bg: 'gold' },
});
const bottomRule = (id: string, measure: string, n: number): ConditionalFormatRule => ({
  id,
  measure,
  kind: 'bottomN',
  n,
  style: { bg: 'red' },
});

describe('computeTopBottomCutoffs', () => {
  it('没有 topN/bottomN 规则 → 空 Map(早退,I1)', () => {
    const model = makeModel([[10], [20]], ['sales']);
    expect(computeTopBottomCutoffs(model, []).size).toBe(0);
    // 只有 threshold 规则也算无:
    const thOnly: ConditionalFormatRule = {
      id: 'x',
      measure: 'sales',
      kind: 'threshold',
      conditions: [{ op: 'gt', value: 0, style: { bg: 'red' } }],
    };
    expect(computeTopBottomCutoffs(model, [thOnly]).size).toBe(0);
  });

  it('top-3 → cutoff = 第 3 大值', () => {
    const model = makeModel([[10], [50], [30], [70], [20]], ['sales']);
    // 降序: [70, 50, 30, 20, 10],第 3(idx=2)= 30
    const r = computeTopBottomCutoffs(model, [topRule('t', 'sales', 3)]);
    expect(r.get('t')).toEqual({ kind: 'topN', cutoff: 30 });
  });

  it('bottom-2 → cutoff = 第 2 小值(升序)', () => {
    const model = makeModel([[10], [50], [30], [70], [20]], ['sales']);
    // 升序: [10, 20, 30, 50, 70],第 2(idx=1)= 20
    const r = computeTopBottomCutoffs(model, [bottomRule('b', 'sales', 2)]);
    expect(r.get('b')).toEqual({ kind: 'bottomN', cutoff: 20 });
  });

  it('n 超过数据量 → cutoff 取最末值(全命中)', () => {
    const model = makeModel([[10], [20]], ['sales']);
    // top-10 但只有 2 行 → cutoff = 最小值 10(全命中)
    const r = computeTopBottomCutoffs(model, [topRule('t', 'sales', 10)]);
    expect(r.get('t')).toEqual({ kind: 'topN', cutoff: 10 });
  });

  it('空 cell / NaN 跳过', () => {
    const model = makeModel([[null], [50], [Number.NaN], [10]], ['sales']);
    // 实际值 [50, 10],top-1 → 50
    const r = computeTopBottomCutoffs(model, [topRule('t', 'sales', 1)]);
    expect(r.get('t')).toEqual({ kind: 'topN', cutoff: 50 });
  });

  it('全空列 → 该规则不出现在 Map(I2)', () => {
    const model = makeModel([[null], [null]], ['sales']);
    const r = computeTopBottomCutoffs(model, [topRule('t', 'sales', 3)]);
    expect(r.has('t')).toBe(false);
  });

  it('n <= 0 → 跳过(I3)', () => {
    const model = makeModel([[10], [20]], ['sales']);
    const r = computeTopBottomCutoffs(model, [
      topRule('t0', 'sales', 0),
      { ...topRule('tn', 'sales', -1) },
    ]);
    expect(r.has('t0')).toBe(false);
    expect(r.has('tn')).toBe(false);
  });

  it('多 measure 各算各的', () => {
    const model = makeModel(
      [
        [10, 100],
        [20, 200],
        [30, 300],
      ],
      ['sales', 'cost'],
    );
    const r = computeTopBottomCutoffs(model, [
      topRule('ts', 'sales', 2),
      topRule('tc', 'cost', 1),
    ]);
    // sales 降序 [30, 20, 10],top-2 → 20
    expect(r.get('ts')).toEqual({ kind: 'topN', cutoff: 20 });
    // cost top-1 → 300
    expect(r.get('tc')).toEqual({ kind: 'topN', cutoff: 300 });
  });

  it('同 measure 多条 topN 规则(top-1/top-3)各自算 cutoff', () => {
    const model = makeModel([[10], [20], [30], [40], [50]], ['sales']);
    const r = computeTopBottomCutoffs(model, [
      topRule('t1', 'sales', 1),
      topRule('t3', 'sales', 3),
    ]);
    expect(r.get('t1')).toEqual({ kind: 'topN', cutoff: 50 });
    expect(r.get('t3')).toEqual({ kind: 'topN', cutoff: 30 });
  });

  it('并列值不影响 cutoff 计算 — 重复值正常参与排序', () => {
    const model = makeModel([[100], [100], [100], [50]], ['sales']);
    // 降序 [100, 100, 100, 50],top-2 cutoff = 100
    // evaluateTopBottom 用 value >= 100,所有 100 cell 都命中(预期 3 个,超过 N=2)
    const r = computeTopBottomCutoffs(model, [topRule('t', 'sales', 2)]);
    expect(r.get('t')).toEqual({ kind: 'topN', cutoff: 100 });
  });
});
