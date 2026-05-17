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

  // 2026-05-17 backend probe 实测:ByCustomCaption 必须走 MeasureSortEx + Customize 才生效;
  //   老 DimensionSort + sortBy:ByCustomCaption 后端会忽略 sortBy → 退化字典序
  it('produces MeasureSortEx + Customize for custom sort order', () => {
    const sorts = [
      {
        type: 'ByCustomCaption' as const,
        fieldName: 'ShipProvince',
        direction: 'ASC' as const,
        customCaption: ['华南', '华北', '华东'],
      },
    ];
    const result = translateSorts(sorts);
    expect(result).toEqual([
      {
        _enum: 'MeasureSortEx',
        measure: {
          _enum: 'Customize',
          sortField: 'ShipProvince',
          customCaption: ['华南', '华北', '华东'],
        },
        direction: 'ASC',
      },
    ]);
  });

  it('ByCustomCaption with DESC direction', () => {
    const sorts = [
      {
        type: 'ByCustomCaption' as const,
        fieldName: 'Region',
        direction: 'DESC' as const,
        customCaption: ['华东', '华南'],
      },
    ];
    const result = translateSorts(sorts);
    expect(result[0]).toMatchObject({
      _enum: 'MeasureSortEx',
      direction: 'DESC',
    });
    expect((result[0] as { measure: unknown }).measure).toEqual({
      _enum: 'Customize',
      sortField: 'Region',
      customCaption: ['华东', '华南'],
    });
  });
});

// 2026-05-18:ByMeasure.sortField + ByDimensionAttr 加(probe 实证 backend 真实装,
//   见 scripts/probe-sort-variants.ts C1/C2/D1/D2)
describe('translateSorts — ByMeasure.sortField(可选,控排序上下文)', () => {
  it('不传 sortField → MeasureSortEx.measure 不含该字段(默认上下文)', () => {
    const sorts = [
      { type: 'ByMeasure' as const, measureName: 'sales', direction: 'DESC' as const },
    ];
    const result = translateSorts(sorts);
    expect(result[0]).toMatchObject({
      _enum: 'MeasureSortEx',
      measure: { _enum: 'ByMeasure', name: 'sales' },
      direction: 'DESC',
    });
    // 不传 sortField → measure 上确实没该字段(不发空串/null 避免后端误解)
    expect((result[0] as { measure: Record<string, unknown> }).measure.sortField).toBeUndefined();
  });

  it('传 sortField → 透传给 backend(用于上下文化排序)', () => {
    const sorts = [
      {
        type: 'ByMeasure' as const,
        measureName: 'sales',
        direction: 'DESC' as const,
        sortField: 'ShipRegion2',
      },
    ];
    const result = translateSorts(sorts);
    expect(result[0]).toEqual({
      _enum: 'MeasureSortEx',
      measure: { _enum: 'ByMeasure', name: 'sales', sortField: 'ShipRegion2' },
      direction: 'DESC',
    });
  });
});

describe('translateSorts — ByDimensionAttr(按另一 dim 字段字典序排)', () => {
  it('emit MeasureSortEx + DimensionAttr', () => {
    const sorts = [
      {
        type: 'ByDimensionAttr' as const,
        fieldName: 'ShipProvince2',
        byDimension: 'ShipRegion2',
        direction: 'ASC' as const,
      },
    ];
    const result = translateSorts(sorts);
    expect(result).toEqual([
      {
        _enum: 'MeasureSortEx',
        measure: {
          _enum: 'DimensionAttr',
          sortField: 'ShipProvince2',
          dimension: 'ShipRegion2',
        },
        direction: 'ASC',
      },
    ]);
  });

  it('DESC 方向透传', () => {
    const sorts = [
      {
        type: 'ByDimensionAttr' as const,
        fieldName: 'A',
        byDimension: 'B',
        direction: 'DESC' as const,
      },
    ];
    expect(translateSorts(sorts)[0]).toMatchObject({ direction: 'DESC' });
  });
});
