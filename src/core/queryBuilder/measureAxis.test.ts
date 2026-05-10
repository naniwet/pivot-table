/**
 * placeMeasureAxis — 决定度量名(measureNames) 在 query.rows / query.columns 里的位置
 *
 * 默认行为（兼容现有）：append 到 query.columns 末尾
 * 用户在 viewConfig.rows 或 columns 里显式放了 type='MeasureGroupName' 的占位字段时：
 *   按其位置把 measureNames 数组插入到对应轴
 *
 * 输出：{ rows, columns } —— 已替换好的 query 数组
 */
import { describe, expect, it } from 'vitest';

import { placeMeasureAxis } from './measureAxis.js';

describe('placeMeasureAxis', () => {
  it('默认（无 MeasureGroupName 字段）→ 度量 append 到 columns 末尾', () => {
    const result = placeMeasureAxis(
      { rows: ['year'], columns: ['product'] },
      ['sales', 'profit'],
      [],
      [{ fieldName: 'product', type: 'Dimension' }],
    );
    expect(result.rows).toEqual(['year']);
    expect(result.columns).toEqual(['product', 'sales', 'profit']);
  });

  it('viewConfig.columns 含 MeasureGroupName → measureNames 插到该位置', () => {
    const result = placeMeasureAxis(
      { rows: ['year'], columns: ['product'] }, // baseline 已 translate 好的
      ['sales'],
      [],
      [
        { fieldName: 'product', type: 'Dimension' },
        { fieldName: '__measure_axis__', type: 'MeasureGroupName' },
      ],
    );
    expect(result.columns).toEqual(['product', 'sales']);
  });

  it('viewConfig.rows 含 MeasureGroupName → measureNames 插到 rows', () => {
    const result = placeMeasureAxis(
      { rows: ['year'], columns: ['product'] },
      ['sales', 'profit'],
      [
        { fieldName: 'year', type: 'Dimension' },
        { fieldName: '__measure_axis__', type: 'MeasureGroupName' },
      ],
      [{ fieldName: 'product', type: 'Dimension' }],
    );
    expect(result.rows).toEqual(['year', 'sales', 'profit']);
    expect(result.columns).toEqual(['product']);
  });

  it('MeasureGroupName 在 rows 中间位置 → 插入到对应位置', () => {
    const result = placeMeasureAxis(
      { rows: ['a', 'b'], columns: [] },
      ['m1'],
      [
        { fieldName: 'a', type: 'Dimension' },
        { fieldName: '__measure_axis__', type: 'MeasureGroupName' },
        { fieldName: 'b', type: 'Dimension' },
      ],
      [],
    );
    // 原 translatedRows = ['a', 'b']（translateRows 已跳过 MeasureGroupName）
    // 度量应插在 a 之后 b 之前
    expect(result.rows).toEqual(['a', 'm1', 'b']);
  });

  it('measureNames 为空 → rows/columns 原样返回', () => {
    const result = placeMeasureAxis(
      { rows: ['year'], columns: ['product'] },
      [],
      [{ fieldName: 'year', type: 'Dimension' }],
      [{ fieldName: 'product', type: 'Dimension' }],
    );
    expect(result.rows).toEqual(['year']);
    expect(result.columns).toEqual(['product']);
  });
});
