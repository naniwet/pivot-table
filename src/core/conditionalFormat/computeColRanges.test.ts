/**
 * computeColRanges — 给 dataBar range='auto' 用的列 min/max 聚合
 */
import { describe, expect, it } from 'vitest';

import type { RenderModel } from '../../types/renderModel.js';

import { computeColRanges } from './computeColRanges.js';

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

describe('computeColRanges', () => {
  it('空 model → 空 Map', () => {
    expect(computeColRanges(makeModel([], [])).size).toBe(0);
  });

  it('单列单 measure → min=max=value', () => {
    const model = makeModel([[100]], ['sales']);
    const r = computeColRanges(model);
    expect(r.get('sales')).toEqual({ min: 100, max: 100 });
  });

  it('多行单列 → 算 min/max', () => {
    const model = makeModel([[10], [50], [30]], ['sales']);
    expect(computeColRanges(model).get('sales')).toEqual({ min: 10, max: 50 });
  });

  it('空 cell 跳过', () => {
    const model = makeModel([[null], [50], [null], [10]], ['sales']);
    expect(computeColRanges(model).get('sales')).toEqual({ min: 10, max: 50 });
  });

  it('全空列 → 不出现在结果 Map(I1)', () => {
    const model = makeModel([[null], [null]], ['sales']);
    expect(computeColRanges(model).has('sales')).toBe(false);
  });

  it('多列各算各的(2 measure 独立 min/max)', () => {
    const model = makeModel(
      [
        [10, 100],
        [20, 200],
      ],
      ['sales', 'cost'],
    );
    const r = computeColRanges(model);
    expect(r.get('sales')).toEqual({ min: 10, max: 20 });
    expect(r.get('cost')).toEqual({ min: 100, max: 200 });
  });

  it('同 measure 跨多列(列轴重复 measure)→ 跨列合并 min/max', () => {
    const model = makeModel(
      [
        [10, 50],
        [80, 30],
      ],
      ['sales', 'sales'], // 同 measure 出现两次(不同 column tuple)
    );
    expect(computeColRanges(model).get('sales')).toEqual({ min: 10, max: 80 });
  });

  it('全相等 → min===max(I2,evaluateDataBar 会因 max<=min 返回 null)', () => {
    const model = makeModel([[5], [5], [5]], ['sales']);
    expect(computeColRanges(model).get('sales')).toEqual({ min: 5, max: 5 });
  });

  it('NaN / Infinity 跳过', () => {
    const model = makeModel(
      [[Number.NaN], [Number.POSITIVE_INFINITY], [42]],
      ['sales'],
    );
    expect(computeColRanges(model).get('sales')).toEqual({ min: 42, max: 42 });
  });
});
