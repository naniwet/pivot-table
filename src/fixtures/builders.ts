/**
 * 测试数据构造器
 * 用法：在测试里 buildViewConfig({ rows: [...] }) 而不是硬编码完整对象
 */

import type {
  ClientFilter,
  ColumnField,
  CustomField,
  MeasureFilter,
  PageState,
  RowField,
  Sort,
  ValueField,
  ViewConfig,
} from '../types/index.js';

export const defaultPageState: PageState = {
  rowPageNo: 1,
  rowPageSize: 50,
  columnPageNo: 1,
  columnPageSize: 50,
};

export function buildViewConfig(overrides: Partial<ViewConfig> = {}): ViewConfig {
  return {
    rows: [],
    columns: [],
    values: [],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageState: { ...defaultPageState },
    customFields: [],
    extensions: null,
    ...overrides,
  };
}

export function buildHierarchyRow(overrides: Partial<RowField> = {}): RowField {
  return {
    fieldName: 'custom1624587732438', // 发货区域 hierarchy
    type: 'Hierarchy',
    drillDepth: 1,
    ...overrides,
  };
}

export function buildDimensionRow(overrides: Partial<RowField> = {}): RowField {
  return {
    fieldName: 'ShipProvince',
    type: 'Dimension',
    ...overrides,
  };
}

export function buildColumnField(overrides: Partial<ColumnField> = {}): ColumnField {
  return {
    fieldName: 'OrderDate_Year2',
    type: 'Dimension',
    ...overrides,
  };
}

export function buildValueField(overrides: Partial<ValueField> = {}): ValueField {
  return {
    measureName: '销售额_1624531356707',
    aggregator: null,
    quickCalc: null,
    ...overrides,
  };
}

export function buildSort(overrides: Partial<Sort> = {}): Sort {
  // 判别式 union：按 overrides.type 分支构造，避免把 ByMeasure 字段
  // 漏到 ByDimension 上（造成"已知字段不存在"的类型错误）
  if (overrides.type === 'ByDimension') {
    return {
      type: 'ByDimension',
      fieldName: 'ShipProvince',
      direction: 'DESC',
      ...overrides,
    };
  }
  return {
    type: 'ByMeasure',
    measureName: '销售额_1624531356707',
    direction: 'DESC',
    ...(overrides as Partial<Extract<Sort, { type: 'ByMeasure' }>>),
  };
}

export function buildLeafFilter(overrides: Partial<Extract<ClientFilter, { kind: 'leaf' }>> = {}): ClientFilter {
  return {
    kind: 'leaf',
    field: 'ShipProvince',
    operator: 'In',
    value: ['江苏'],
    ...overrides,
  };
}

export function buildMeasureFilter(overrides: Partial<MeasureFilter> = {}): MeasureFilter {
  return {
    measureName: '销售额_1624531356707',
    operator: 'GreaterThan',
    value: 1000,
    ...overrides,
  };
}

export function buildCustomFields(): CustomField[] {
  return [];
}
