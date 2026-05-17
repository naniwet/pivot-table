/**
 * Metadata — Smartbi AugmentedDataSet 数据集元数据(2026-05-06 重写)
 *
 * 数据来源:`/api/augmentedDataSet/{id}` 接口完整返回。
 *
 * 设计:
 *   - **顶层扁平 + nodes[] 树形 outline 双视图**(后端冗余设计,前端两种用法都能用):
 *     - `views[]` / `fields[]` / `levels[]` / `measures[]` / `calcMeasures[]` / `namedSets[]`
 *       — 各类型字段定义(扁平,by id/name 索引)
 *     - `nodes[]` — 字段树 outline(118 个节点都在,每个含 parentId + children[])
 *     - root nodes 是 `DIMENSION_FOLDER` / `MEASURE_FOLDER` / `NAMEDSET_FOLDER` 三个 group folder
 *
 *   - **viewName 解析**:`level/measure.viewId → views[].name`(精确反查,不用 fieldId 正则)
 *
 * 跟旧 Metadata 的兼容映射:
 *   - 旧 `dimensions/measures/namedsets`(三棵 FieldNode 树) → 新 `nodes[]` 中按 root.type 区分
 *   - 旧 `FieldNode.alias` → 新 helper `getAlias(node)`(`useFromDb ? alias : aliasFromDb`,符合后端语义)
 *   - 旧 `FieldNode.visible: boolean` → 新 `node.visible: 0 | 1`(消费时用 helper 转 boolean)
 */

// ============================================================
// 共享类型
// ============================================================

/** 字段值类型 — 对应 cellset-schema.json `definitions.ValueType` */
export type ValueType =
  | 'STRING'
  | 'INTEGER'
  | 'LONG'
  | 'BIGINT'
  | 'FLOAT'
  | 'DOUBLE'
  | 'BIGDECIMAL'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'BOOLEAN'
  | 'ASCII_CODE'
  | 'NUMERIC'
  | 'TIMESTAMP';

/** @deprecated 历史名称,新代码用 ValueType */
export type DataType = ValueType;

/**
 * 字段聚合方式(metadata 返回的是小写,如 'sum';跟 query.ts 的 Aggregator(大写 SUM)同语义,
 * 命名区分避免 import * 冲突)。string 兜底未列出值。
 */
export type MetadataAggregator =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'count_distinct'
  | 'first'
  | 'last'
  | 'attr'
  | 'median'
  | 'list'
  | 'list_distinct'
  | string;

/** group 字段 — 节点所属类别;原 FieldNode.group */
export type FieldGroup = 'DIMENSION' | 'MEASURE' | 'NAMEDSET' | 'LEVEL' | null;

/**
 * 节点类型枚举 — 跟新接口 nodes[i].type 对齐。
 *
 * 2026-05-16 更新:除了时间 LEVEL_TIME_*,后端还会返回 LEVEL_GEO(地理层次的 level)
 * 以及未来可能新增的 LEVEL_* 子类;union 加了 `LEVEL_GEO` 显式标识 + 末尾 `string`
 * 兜底,让 nodeKind 通过 startsWith('LEVEL_') 一并归到 Dimension。
 */
export type FieldNodeType =
  | 'DIMENSION_FOLDER'
  | 'MEASURE_FOLDER'
  | 'NAMEDSET_FOLDER'
  | 'FOLDER'
  | 'HIERARCHY'
  | 'HIERARCHY_TIME'
  | 'LEVEL'
  | 'LEVEL_TIME_YEAR'
  | 'LEVEL_TIME_QUARTER'
  | 'LEVEL_TIME_MONTH'
  | 'LEVEL_TIME_DAY'
  | 'LEVEL_GEO'
  | 'FIELD'
  | 'CALC'
  | 'CALC_GROUP'
  | 'MEASURE'
  | 'CALC_MEASURE'
  | 'NAMEDSET'
  | 'MEASURE_GROUP_NAME'
  | 'MEASURE_GROUP_VALUE'
  // 兜底 — 后端将来加新 LEVEL_* / HIERARCHY_* 等都能通过(渲染层 nodeKind 用 prefix 识别)
  | (string & {});

// ============================================================
// nodes[] 节点(字段树 outline)
// ============================================================

/**
 * 字段树节点 — 跟旧 FieldNode 同构,但字段命名跟新接口对齐。
 * 用 helper `getAlias(node)` 屏蔽 useFromDb / aliasFromDb / alias 的差异。
 */
export interface FieldNode {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string | null;
  /** 是否覆盖数据库默认 alias/desc — true 时用 alias/desc 字段,false 时用 aliasFromDb/descFromDb */
  useFromDb: boolean;
  type: FieldNodeType;
  group: FieldGroup;
  /** 节点所在层级深度(从 root=0) */
  level: number;
  order: number;
  /** 1=可见, 0=隐藏(后端 number,前端用 visibleAsBoolean helper 转) */
  visible: 0 | 1;
  parentId: string | null;
  /** 数据类型(level/field 才有,folder 类型为 null) */
  valueType: ValueType | null;
  dataFormat: string | null;
  /** JSON 字符串 — 扩展信息(calcField / actualFormat 等) */
  extended: string | null;
  refDataSetFieldId: string | null;
  referenceFieldId: string | null;
  originalDataType: ValueType | null;
  aggregator: MetadataAggregator | null;
  businessCaliber: string | null;
  /** 该节点的子节点(树形遍历用);冗余于 parentId(扁平索引用) */
  children: FieldNode[];
  /** useFromDb=true 时这个值才被使用 — 用户在 dataset 编辑器自定义的 alias */
  alias?: string;
  desc?: string | null;
  creatorId?: string | null;
}

// ============================================================
// 各类型字段(扁平数组)
// ============================================================

export interface View {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string;
  useFromDb: boolean;
  /** 表类型,如 'BASIC_TABLE' */
  type: string;
  /** 数据存储类型,如 'DIRECT' */
  storeType: string;
  define: {
    dbtype: string;
    dataSource: string;
    catalog: string | null;
    schema: string | null;
    tableId: string;
    tableName: string;
    [key: string]: unknown;
  };
  /** 该 view 下的字段(子集,有些字段不会被 dataset 引用) */
  fields: ViewField[];
  parameters: unknown[];
  dataSource: string;
  alias: string;
  desc: string;
  enable?: boolean;
  [key: string]: unknown;
}

export interface ViewField {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string;
  useFromDb: boolean;
  valueType: ValueType;
  dataFormat: string;
  sqlColumnName: string | null;
  viewId: string | null;
  viewAlias: string | null;
  alias: string;
  desc: string;
  resType?: string | null;
  creatorId?: string | null;
}

/** 数据集级字段(包含跨表 join 后的所有字段) */
export interface DataSetField extends ViewField {
  visible: 0 | 1;
  maskingRule: string;
  referenceFieldId: string;
  extended: string | null;
  transformRule: string;
  needExtract?: boolean;
}

/** Level 字段(维度的 level,可能是 hierarchy 的子级) */
export interface DataSetLevel {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string;
  useFromDb: boolean;
  valueType: ValueType;
  dataFormat: string;
  sqlColumnName: string | null;
  viewId: string | null;
  viewAlias: string | null;
  hierName: string | null;
  expression: string | null;
  dimName: string | null;
  maskingRule: string | null;
  transformRule: string | null;
  visible: 0 | 1;
  extended: string | null;
  /** 'LEVEL' / 'LEVEL_TIME_YEAR' 等 — 区分时间 level 类型 */
  levelType: string;
  refDataSetFieldId: string | null;
  reportVisible: boolean;
  alias: string;
  desc: string;
  resType?: string | null;
  creatorId?: string | null;
}

export interface DataSetMeasure {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string | null;
  useFromDb: boolean;
  valueType: ValueType;
  dataFormat: string;
  viewId: string | null;
  viewAlias: string | null;
  visible: 0 | 1;
  /** SUM/AVG/MIN/MAX/COUNT/COUNT_DISTINCT 等(后端可能小写) */
  aggregator: MetadataAggregator;
  refDataSetFieldId: string | null;
  maskingRule: string | null;
  transformRule: string | null;
  extended: string | null;
  alias: string;
  desc: string | null;
  resType?: string | null;
  creatorId?: string | null;
}

export interface DataSetCalcMeasure {
  id: string;
  name: string;
  aliasFromDb: string;
  descFromDb: string | null;
  useFromDb: boolean;
  valueType: ValueType;
  dataFormat: string;
  hierName: string | null;
  expression: string;
  dimName: string | null;
  maskingRule: string;
  visible: 0 | 1;
  extended: string | null;
  /** 'Advance' / 'Wizard' */
  extendedType?: string;
  reportVisible: boolean;
  alias: string;
  desc: string | null;
  creatorId?: string | null;
}

export interface DataSetNamedSet {
  id: string;
  name: string;
  aliasFromDb: string;
  alias: string;
  expression: string;
  /** 其他字段按需扩展;namedSets[] 当前 fixture 是空数组 */
  [key: string]: unknown;
}

// ============================================================
// 顶层 Metadata
// ============================================================

export interface Metadata {
  id: string;
  name: string;
  alias: string;
  desc: string;
  /** 数据集来源,如 'AUGMENTED' */
  providerName: string;

  // 各类型字段(扁平数组)
  views: View[];
  fields: DataSetField[];
  levels: DataSetLevel[];
  measures: DataSetMeasure[];
  calcMeasures: DataSetCalcMeasure[];
  namedSets: DataSetNamedSet[];

  /** 字段树 outline — 118 个节点扁平 + children[] 树双视图 */
  nodes: FieldNode[];

  /**
   * 其他能力:parameters / preAggregates / relationGraph / smartCubeSetting / 等等
   * 大部分字段当前不消费,用 unknown 兜底避免类型噪音
   */
  parameters?: unknown[];
  preAggregates?: unknown[];
  calcMembers?: unknown[];
  fieldTreeSetting?: unknown;
  relationGraph?: unknown;
  relationSetting?: unknown;
  smartCubeSetting?: unknown;
  duckDbSetting?: unknown;
  cacheSetting?: unknown;
  augmentedDataSetSetting?: unknown;
  extractSetting?: unknown;
  extractStatus?: unknown;
  storeType?: string;
  directPartitions?: unknown[];
  deletedViews?: unknown[];
  previewType?: string | null;
  previewExpression?: string | null;
  previewCalcMeasure?: unknown;
  previewCalcMember?: unknown;
  previewNamedSet?: unknown;
  aliasFromDb?: string;
  descFromDb?: string;
  useFromDb?: boolean;
  creatorId?: string | null;
  capability?: unknown;
  forbidChangeGroup?: boolean;
  forbidUseAggregation?: unknown[];
  createPrivateGroupField?: boolean;
  extensions?: unknown;
  requestId?: string;
}

// ============================================================
// helpers
// ============================================================

/**
 * 取节点的显示名:useFromDb=true 时用 alias(用户自定义),否则 aliasFromDb(数据库默认)。
 * 兜底 fallback 到 name。
 */
export function getAlias(node: {
  alias?: string;
  aliasFromDb?: string;
  useFromDb?: boolean;
  name?: string;
}): string {
  if (node.useFromDb && node.aliasFromDb) return node.aliasFromDb;
  if (node.alias) return node.alias;
  return node.aliasFromDb ?? node.name ?? '';
}

/** 取节点的 desc(同 alias 选择规则) */
export function getDesc(node: {
  desc?: string | null;
  descFromDb?: string | null;
  useFromDb?: boolean;
}): string {
  if (node.useFromDb) return node.descFromDb ?? '';
  return node.desc ?? node.descFromDb ?? '';
}

/** visible 字段从 0|1 转 boolean */
export function isVisible(node: { visible?: 0 | 1 | boolean }): boolean {
  if (typeof node.visible === 'boolean') return node.visible;
  return node.visible === 1;
}
