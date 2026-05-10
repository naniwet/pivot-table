/**
 * translateSorts 测试
 *
 * 返回类型：FieldSort[] 联合类型（P0 只产 MeasureSortEx，留扩展位）
 */

import { describe, expect, it } from 'vitest';

import { buildSort } from '../../../fixtures/builders.js';

import { translateSorts } from './sorts.js';

describe('translateSorts', () => {
  it('should return empty array when no sorts', () => {
    expect(translateSorts([])).toEqual([]);
  });

  it('should produce MeasureSortEx for ByMeasure sort (P0)', () => {
    const sorts = [buildSort()];
    const result = translateSorts(sorts);

    expect(result).toEqual([
      {
        _enum: 'MeasureSortEx',
        measure: { _enum: 'ByMeasure', name: '销售额_1624531356707' },
        direction: 'DESC',
      },
    ]);
  });

  it('should respect direction ASC', () => {
    const sorts = [buildSort({ direction: 'ASC' })];
    const result = translateSorts(sorts);
    expect(result[0]).toMatchObject({ direction: 'ASC' });
  });

  it('produces DimensionSortEx for ByDimension sort (P1.0)', () => {
    const sorts = [buildSort({ type: 'ByDimension', fieldName: 'ShipProvince', direction: 'ASC' })];
    const result = translateSorts(sorts);
    expect(result).toEqual([
      { _enum: 'DimensionSortEx', dimension: 'ShipProvince', direction: 'ASC' },
    ]);
  });
});
