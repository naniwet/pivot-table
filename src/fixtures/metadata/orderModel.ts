/**
 * 测试用 metadata fixture — 订单模型简化版(2026-05-06 重写,对齐新 AugmentedDataSet 结构)
 *
 * 真实数据结构参见 src/fixtures/augmentedDataSet.real.json (probe 抓包)。
 *
 * 这里保留 P0 测试需要的最小字段集:
 *   - 发货区域 hierarchy(省→区域→城市)
 *   - 销售额 measure
 *   - 城市分组(CALC_GROUP — 测试 P0 自定义分组)
 *
 * 字段命名约定(跟新接口一致):
 *   - aliasFromDb: 数据库默认显示名
 *   - alias: 用户在 dataset 编辑器自定义名(useFromDb=true 时生效)
 *   - getAlias(node) helper 选择二者之一
 *   - visible: 0|1 (number)
 */

import type {
  DataSetField,
  DataSetLevel,
  DataSetMeasure,
  FieldNode,
  Metadata,
  View,
} from '../../types/metadata.js';

const MODEL_ID = 'Iff808081017e71197119e7d2017e7124d5b70006';

// ============================================================
// views[] — 一张 orders 事实表
// ============================================================

const ordersView: View = {
  id: 'view-orders',
  name: 'orders', // ← 真实表名;customElements 翻译时 viewName 取这个
  aliasFromDb: '订单表',
  descFromDb: '',
  useFromDb: false,
  type: 'BASIC_TABLE',
  storeType: 'DIRECT',
  define: {
    dbtype: 'MYSQL',
    dataSource: 'DS.northwind',
    catalog: 'northwind',
    schema: null,
    tableId: 'TAB.northwind.northwind.null.orders',
    tableName: 'orders',
  },
  fields: [],
  parameters: [],
  dataSource: 'DS.northwind',
  alias: '订单表',
  desc: '',
};

// ============================================================
// levels[] — 发货区域 hierarchy 的三个 levels
// ============================================================

const provinceLevel: DataSetLevel = {
  id: `AUGMENTED_DATASET_LEVEL.${MODEL_ID}.Field-northwind-null-null-orders-ShipProvince-LEVEL-1624589541525`,
  name: 'ShipProvince2',
  aliasFromDb: '省份',
  descFromDb: 'ShipProvince',
  useFromDb: false,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  sqlColumnName: null,
  viewId: ordersView.id,
  viewAlias: null,
  hierName: null,
  expression: null,
  dimName: null,
  maskingRule: null,
  transformRule: null,
  visible: 1,
  extended: null,
  levelType: 'LEVEL',
  refDataSetFieldId: null,
  reportVisible: true,
  alias: '省份',
  desc: 'ShipProvince',
};

const regionLevel: DataSetLevel = {
  ...provinceLevel,
  id: `AUGMENTED_DATASET_LEVEL.${MODEL_ID}.Field-northwind-null-null-orders-ShipRegion-LEVEL-1624587737403`,
  name: 'ShipRegion2',
  aliasFromDb: '区域',
  alias: '区域',
  desc: 'ShipRegion',
};

const cityLevel: DataSetLevel = {
  ...provinceLevel,
  id: `AUGMENTED_DATASET_LEVEL.${MODEL_ID}.Field-northwind-null-null-orders-ShipCity-LEVEL-1624589545924`,
  name: 'ShipCity2',
  aliasFromDb: '发货城市',
  alias: '发货城市',
  desc: 'ShipCity',
};

// ============================================================
// measures[] — 销售额
// ============================================================

const salesMeasure: DataSetMeasure = {
  id: `AUGMENTED_DATASET_MEASURE.${MODEL_ID}.COMBINEDFIELD.8ad67ad48dfb5b71d03e92a84d06c361.销售额_1624531356707`,
  name: '销售额_1624531356707',
  aliasFromDb: '销售额',
  descFromDb: null,
  useFromDb: false,
  valueType: 'DOUBLE',
  dataFormat: '无小数点，有千分位',
  viewId: ordersView.id,
  viewAlias: null,
  visible: 1,
  aggregator: 'sum',
  refDataSetFieldId: null,
  maskingRule: null,
  transformRule: null,
  extended: null,
  alias: '销售额',
  desc: null,
};

// ============================================================
// fields[] — 一个 CALC_GROUP 字段(城市分组)
// ============================================================

const cityCalcGroup: DataSetField = {
  id: `AUGMENTED_DATASET_FIELD.${MODEL_ID}.Field-northwind-null-null-orders-ShipCity-CALC-GROUP-2b3210f0dcba0eda33829647e3b6d814`,
  name: '城市分组',
  aliasFromDb: '城市分组',
  descFromDb: '',
  useFromDb: false,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  sqlColumnName: null,
  viewId: ordersView.id,
  viewAlias: null,
  visible: 1,
  maskingRule: '',
  referenceFieldId: 'Field-northwind-null-null-orders-ShipCity-CALC-GROUP-2b3210f0dcba0eda33829647e3b6d814',
  extended: null,
  transformRule: '',
  needExtract: true,
  alias: '城市分组',
  desc: '',
};

// ============================================================
// nodes[] — 字段树 outline
// ============================================================

/** 通用 FieldNode 工厂(填默认值) */
function makeNode(p: Partial<FieldNode> & Pick<FieldNode, 'id' | 'name' | 'type' | 'parentId'>): FieldNode {
  return {
    aliasFromDb: p.name,
    descFromDb: null,
    useFromDb: false,
    group: null,
    level: 0,
    order: 0,
    visible: 1,
    valueType: null,
    dataFormat: null,
    extended: null,
    refDataSetFieldId: null,
    referenceFieldId: null,
    originalDataType: null,
    aggregator: null,
    businessCaliber: null,
    children: [],
    alias: p.name,
    desc: null,
    creatorId: null,
    ...p,
  };
}

const provinceNode = makeNode({
  id: provinceLevel.id,
  name: provinceLevel.name,
  aliasFromDb: '省份',
  alias: '省份',
  type: 'LEVEL',
  group: 'LEVEL',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.HIERARCHY-1624587732438`,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  refDataSetFieldId: provinceLevel.refDataSetFieldId,
  order: 0,
});

const regionNode = makeNode({
  id: regionLevel.id,
  name: regionLevel.name,
  aliasFromDb: '区域',
  alias: '区域',
  type: 'LEVEL',
  group: 'LEVEL',
  parentId: provinceNode.parentId,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  order: 1,
});

const cityNode = makeNode({
  id: cityLevel.id,
  name: cityLevel.name,
  aliasFromDb: '发货城市',
  alias: '发货城市',
  type: 'LEVEL',
  group: 'LEVEL',
  parentId: provinceNode.parentId,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  order: 2,
});

const shipRegionHierarchy = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.HIERARCHY-1624587732438`,
  name: 'custom1624587732438',
  aliasFromDb: '发货区域',
  alias: '发货区域',
  type: 'HIERARCHY',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.dimension`,
  order: 0,
  children: [provinceNode, regionNode, cityNode],
});

const cityCalcGroupNode = makeNode({
  id: cityCalcGroup.id,
  name: cityCalcGroup.name,
  aliasFromDb: '城市分组',
  alias: '城市分组',
  type: 'CALC_GROUP',
  group: 'DIMENSION',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.bf2426d49bb9eaaa09656eef81159077`,
  valueType: 'STRING',
  dataFormat: '<字符串-默认值>',
  order: 23,
});

const ordersFolderNode = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.bf2426d49bb9eaaa09656eef81159077`,
  name: 'orders',
  aliasFromDb: '订单表',
  alias: '订单表',
  type: 'FOLDER',
  group: 'DIMENSION',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.dimension`,
  order: 4,
  children: [cityCalcGroupNode],
});

const dimensionRootNode = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.dimension`,
  name: 'dimension',
  aliasFromDb: '维度',
  alias: '维度',
  type: 'DIMENSION_FOLDER',
  group: 'DIMENSION',
  parentId: null,
  order: 0,
  children: [shipRegionHierarchy, ordersFolderNode],
});

const salesMeasureNode = makeNode({
  id: salesMeasure.id,
  name: salesMeasure.name,
  aliasFromDb: '销售额',
  alias: '销售额',
  type: 'MEASURE',
  group: 'MEASURE',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.FOLDER_1638934389355`,
  valueType: 'DOUBLE',
  dataFormat: '无小数点，有千分位',
  originalDataType: 'DOUBLE',
  aggregator: 'sum',
  order: 5,
});

const orderMeasureFolderNode = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.FOLDER_1638934389355`,
  name: '订单指标',
  aliasFromDb: '订单明细',
  alias: '订单明细',
  type: 'FOLDER',
  group: 'MEASURE',
  parentId: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.measure`,
  order: 1,
  children: [salesMeasureNode],
});

const measureRootNode = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.measure`,
  name: 'measure',
  aliasFromDb: '度量',
  alias: '度量',
  type: 'MEASURE_FOLDER',
  group: 'MEASURE',
  parentId: null,
  order: 1,
  children: [orderMeasureFolderNode],
});

const namedsetRootNode = makeNode({
  id: `AUGMENTED_DATASET_FOLDER.${MODEL_ID}.namedSet`,
  name: 'namedSet',
  aliasFromDb: '命名集',
  alias: '命名集',
  type: 'NAMEDSET_FOLDER',
  group: 'NAMEDSET',
  parentId: null,
  order: 2,
});

// 扁平化 nodes[](按 parentId/children 同时存在 — 对齐真实接口的冗余表达)
function flatten(roots: FieldNode[]): FieldNode[] {
  const out: FieldNode[] = [];
  function walk(n: FieldNode) {
    out.push(n);
    for (const c of n.children) walk(c);
  }
  for (const r of roots) walk(r);
  return out;
}

const ALL_NODES = flatten([dimensionRootNode, measureRootNode, namedsetRootNode]);

// ============================================================
// 顶层 Metadata
// ============================================================

export const orderModelMetadata: Metadata = {
  id: MODEL_ID,
  name: '订单模型',
  alias: '订单模型',
  desc: '',
  providerName: 'AUGMENTED',

  views: [ordersView],
  fields: [cityCalcGroup],
  levels: [provinceLevel, regionLevel, cityLevel],
  measures: [salesMeasure],
  calcMeasures: [],
  namedSets: [],

  nodes: ALL_NODES,
};

/** 字段标识常量,便于测试引用 */
export const FIELD_IDS = {
  shipRegionHierarchy: 'custom1624587732438',
  provinceLevel: 'ShipProvince2',
  regionLevel: 'ShipRegion2',
  cityLevel: 'ShipCity2',
  cityCalcGroup: '城市分组',
  salesMeasure: '销售额_1624531356707',
} as const;
