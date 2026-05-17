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
      // 2026-05-18:加 optional sortField 透传。backend 实测 sortField 控"排序上下文"
      //   (probe-sort-variants.ts C2:sortField=ShipRegion2 → 按 Region 层排,顺序明显不同)。
      //   不传 → backend 默认上下文。
      const measure: { _enum: 'ByMeasure'; name: string; sortField?: string } = {
        _enum: 'ByMeasure',
        name,
      };
      if (s.sortField) measure.sortField = s.sortField;
      return {
        _enum: 'MeasureSortEx',
        measure,
        direction: s.direction,
      };
    }
    if (s.type === 'ByDimensionAttr') {
      // 2026-05-18:按另一个 dim 字段的字典序对此 dim 排序。
      //   实测 backend MeasureSortEx + DimensionAttr 支持(probe-sort-variants.ts D1/D2)。
      //   例:fieldName=ShipProvince2, byDimension=ShipRegion2
      //       → Province 按 Region 字母序分组排,同 region 内 province 字典序。
      return {
        _enum: 'MeasureSortEx',
        measure: {
          _enum: 'DimensionAttr',
          sortField: s.fieldName,
          dimension: s.byDimension,
        },
        direction: s.direction,
      };
    }
    if (s.type === 'ByCustomCaption') {
      // P5+ 自定义排序 — 2026-05-17 backend probe 实测:
      //   - 老 DimensionSort + sortBy:ByCustomCaption(schema 标 deprecated)→ 后端忽略 sortBy
      //   - DimensionSortEx + sortBy:ByCustomCaption                       → 后端忽略 sortBy
      //   - MeasureSortEx + measure:Customize                              → ✓ 真生效
      // 虽然叫 MeasureSortEx,inner measure._enum='Customize' 指向 dim 字段 + customCaption,
      // 这是 Smartbi 当前能用的"按用户指定的成员顺序排序"路径。
      return {
        _enum: 'MeasureSortEx',
        measure: {
          _enum: 'Customize',
          sortField: s.fieldName,
          customCaption: s.customCaption,
        },
        direction: s.direction,
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
