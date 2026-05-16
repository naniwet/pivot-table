/**
 * translateSorts — 排序翻译器
 *
 * 返回 FieldSort[] 联合类型：
 *   - ByMeasure → MeasureSortEx（点击度量列头触发）
 *   - ByDimension → DimensionSortEx（点击维度列头触发，按维度成员字典序）
 *
 * P2 加 BASC/Customize 等（schema 已支持）。
 *
 * **measureNameToFieldName**:对带 quickCalc 的 measure,query.fields[].name 会带后缀
 * (如 '销售额_m@QC@SamePeriodValue')。sort.measure.name 必须用同一后缀名才能对上 fields,
 * 由 buildQuery 传入这个映射 — 普通 measure 不在 map 里,仍用原 measureName。
 */

import type { Sort } from '../../../types/index.js';
import type { FieldSort } from '../../../types/query.js';

export function translateSorts(
  sorts: Sort[],
  measureNameToFieldName?: ReadonlyMap<string, string>,
): FieldSort[] {
  return sorts.map((s): FieldSort => {
    if (s.type === 'ByMeasure') {
      const name = measureNameToFieldName?.get(s.measureName) ?? s.measureName;
      return {
        _enum: 'MeasureSortEx',
        measure: { _enum: 'ByMeasure', name },
        direction: s.direction,
      };
    }
    if (s.type === 'ByCustomCaption') {
      return {
        _enum: 'DimensionSort',
        dimension: s.fieldName,
        direction: s.direction,
        sortBy: { _enum: 'ByCustomCaption', customCaption: s.customCaption },
      };
    }
    // ByDimension — P1.0 起：按维度成员字典序 ASC/DESC
    return {
      _enum: 'DimensionSortEx',
      dimension: s.fieldName,
      direction: s.direction,
    };
  });
}
