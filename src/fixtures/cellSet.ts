/**
 * CellSet fixture builders — 测试统一构造后端响应 shape
 *
 * 之前散在 PivotTable.test.tsx / parseCellSet.test.ts 各自的 helper(三处重复),
 * 提到这里:CellSet schema 演化时只改一处。
 *
 * 设计:
 *   - 都用 `Partial<X> & 必填字段` 的 overrides 模式 — 灵活又类型安全
 *   - 默认值用 orderModel fixture 的 ID(给已有测试默认 fits)
 *   - 不预设 hierarchy / level 等业务场景 — 由调用方拼装
 *
 * 跟 builders.ts 区分:
 *   - builders.ts:viewConfig / RowField / ValueField 等 **前端配置** shape
 *   - cellSet.ts:Member / Cell / ColumnMetaData / CellSet 等 **后端响应** shape
 */
import type { Cell, CellSet, ColumnMetaData, Member } from '../types/cellSet.js';

import { FIELD_IDS } from './metadata/orderModel.js';

/**
 * 构造一个 Member(行/列轴的成员)。
 *
 * 默认 level=ShipProvince2 / dimension=shipRegionHierarchy(orderModel fixture 默认场景);
 * 跨 hierarchy 测试时显式 override level + dimension + fieldName。
 *
 * @example
 *   makeMember({ uniqueName: ['江苏'] })
 *     → { name: '江苏', level: 'ShipProvince2', dimension: '...', uniqueName: ['江苏'], fieldName: '...' }
 *   makeMember({ uniqueName: ['江苏', '苏州'], level: 'ShipCity2', name: '苏州' })
 *     → 多 level 嵌套
 */
export function makeMember(
  overrides: Partial<Member> & Pick<Member, 'uniqueName'>,
): Member {
  return {
    name: overrides.uniqueName[overrides.uniqueName.length - 1] ?? '',
    level: 'ShipProvince2',
    dimension: FIELD_IDS.shipRegionHierarchy,
    fieldName: FIELD_IDS.shipRegionHierarchy,
    ...overrides,
  };
}

/** Measure tuple 用 Member(度量轴的"销售额"伪成员) */
export function makeMeasureMember(
  measureName: string = FIELD_IDS.salesMeasure,
  alias: string = '销售额',
): Member {
  return {
    name: alias,
    uniqueName: ['Measures', measureName],
    level: 'MeasuresLevel',
    dimension: 'Measures',
    fieldName: measureName,
  };
}

/** 数据列 metadata(度量列) */
export function makeColumnMeta(
  overrides: Partial<ColumnMetaData> = {},
): ColumnMetaData {
  return {
    name: FIELD_IDS.salesMeasure,
    alias: '销售额',
    valueType: 'DOUBLE',
    dataFormat: '无小数点，有千分位',
    maskingRuleIdList: [],
    accessible: true,
    ...overrides,
  };
}

/** 行标签列 metadata(展示行轴成员名,非数据列) */
export function makeRowLabelMeta(name: string, alias: string): ColumnMetaData {
  return {
    name,
    alias,
    valueType: 'STRING',
    dataFormat: '<字符串-默认值>',
    maskingRuleIdList: [],
    accessible: true,
  };
}

/** 数据格 cell — 一个 row × column 交叉点的值 */
export function makeCell(overrides: Partial<Cell> & Pick<Cell, 'row' | 'column'>): Cell {
  return {
    value: 0,
    formattedValue: '0',
    ...overrides,
  };
}

/**
 * 空 CellSet 骨架 — 调用方按场景填 rows / columns / data。
 *
 * 大多数测试只关注子集字段(如只验 rowHeader 解析就只填 rows + 1 个 columnMeta);
 * 用 partial override 让测试代码只表达"我关心什么"。
 */
export function makeCellSet(overrides: Partial<CellSet> = {}): CellSet {
  return {
    rowFields: [],
    columnFields: [],
    columnMetadataArray: [],
    rows: [],
    columns: [],
    data: [],
    fieldNameToUniqueId: {},
    totalRowCount: 0,
    ...overrides,
  };
}
