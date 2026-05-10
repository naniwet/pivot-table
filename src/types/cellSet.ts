/**
 * 后端 CellSet 类型
 * 对应 prd 根目录 cellset-schema.json
 *
 * 命名空间：types from backend
 */

import type { DataType } from './metadata.js';

export interface Member {
  name: string;
  /** 从顶到底的成员路径，如 ["Measures", "销售额"] 或 ["江苏", "苏南", "南京"] */
  uniqueName: string[];
  level: string;
  dimension: string;
  fieldName: string;
  value?: unknown;
  formattedValue?: string;
  valueType?: DataType;
  useTransformRule?: boolean;
}

export interface Cell {
  row: number;
  column: number;
  value: unknown;
  formattedValue: string;
  valueType?: DataType;
  useTransformRule?: boolean;
}

export interface RowCell {
  value: unknown;
  formattedValue: string;
  valueType?: DataType;
  useTransformRule?: boolean;
}

export type FieldDefine =
  | { _enum: 'MeasureField'; measureName: string }
  | { _enum: 'LevelField'; dimensionName: string; levelName: string };

export interface CellField {
  name: string;
  define: FieldDefine;
  srcNamedSet?: { srcNamedSetName: string; fieldCaption: string } | null;
  fieldNames: string[];
}

export interface ColumnMetaData {
  fieldId?: string | null;
  name: string;
  alias: string;
  valueType: DataType;
  /**
   * cellset-schema 声明为 `{type: string}` 对象，但真实响应观察到是字符串
   * （如 `"TIME_YEAR"`）。这里用 union 兼容两种形态。
   */
  levelType?: string | { type: string } | null;
  dataFormat: string;
  fieldDataFormat?: string | null;
  transformRuleId?: string | null;
  maskingRuleIdList: string[];
  accessible: boolean;
  queryField?: unknown | null;
  srcNamedSet?: string | null;
  extensions?: Record<string, unknown> | null;
}

/**
 * CellSet — 行/列轴均可放成员的交叉表结果
 */
export interface CellSet {
  rowFields: CellField[];
  columnFields: CellField[];
  columnMetadataArray: ColumnMetaData[];
  /** 列轴成员二维数组：外层按字段拖拽顺序，内层是各成员 */
  columns: Member[][];
  /** 行轴成员二维数组 */
  rows: Member[][];
  /** 单元格数据（稀疏矩阵 — 缺失格不出现） */
  data: Cell[];
  fieldNameToUniqueId: Record<string, string>;
  totalRowCount: number;
}

/**
 * RowSet — 列轴只有度量时退化的简单表格结果
 */
export interface RowSet {
  columnFields: CellField[];
  columnMetadataArray?: ColumnMetaData[];
  data: RowCell[][];
  fieldNameToUniqueId: Record<string, string>;
  totalRowCount: number;
  extensions?: Record<string, unknown> | null;
}
