/**
 * 内部 RenderModel — CellSetParser 输出 → PivotRenderer 输入
 * 把后端稀疏 CellSet 转成渲染友好的稠密结构
 */

import type { ColumnMetaData, Member } from './cellSet.js';

export interface RenderCell {
  value: unknown;
  formattedValue: string;
  /** true = 稀疏矩阵填充的空格，false = 实际数据 */
  isEmpty: boolean;
  /** maskingRuleIdList 非空时为 true，渲染时显示 *** */
  isMasked: boolean;
}

export const EMPTY_CELL: RenderCell = Object.freeze({
  value: null,
  formattedValue: '',
  isEmpty: true,
  isMasked: false,
});

export interface RowHeaderNode {
  /** 该行最深 level 的成员（多 level 行轴 / 单 level 行轴均成立） */
  member: Member;
  /** 缩进深度（= members.length - 1；P0 单 hierarchy 时等于该行 level 索引） */
  depth: number;
  /** 在 matrix 中的行号 */
  rowIndex: number;
  /** 完整路径（每个 level 的 member.name 串联，从顶到底），用于 hover tooltip */
  fullPath: string[];
  /** 该行所属 hierarchy 的 fieldName；非 hierarchy 行为 null（drill action 需要） */
  hierarchyFieldName: string | null;
  /** 该 hierarchy 可向下钻（drillDepth < maxDepth） — 显示 ▶ */
  canDrillDown: boolean;
  /** 该 hierarchy 可向上钻（drillDepth > 1） — 显示 ▼ */
  canDrillUp: boolean;
}

export interface ColumnHeaderCell {
  fieldName: string;
  alias: string;
  dataFormat: string;
  isMeasure: boolean;
}

/**
 * 多级列头一行内的一格（cross-table 用）
 *   colSpan：合并相邻同值 tuple 的列数（典型：上层 dim 同名时合并）
 *   isMeasure：该 level 的成员是否落在度量轴（typically the deepest level）
 */
export interface ColumnHeaderGroupCell {
  fieldName: string;
  label: string;
  colSpan: number;
  isMeasure: boolean;
}

export interface RenderModel {
  rowHeader: RowHeaderNode[];
  /**
   * 平级列头（每个数据列一项）—— 用于 sort 状态查找等场景。
   * 内容 = columnHeaderLevels 最深层（对应 measure 列那一行）。
   */
  columnHeader: ColumnHeaderCell[];
  /**
   * 多级列头（cross-table 用）。每个元素是 thead 的一行 cells，
   * 其中相邻同值的 cell 用 colSpan 合并。
   * - 单 measure 列轴 case：levels 长度 = 1，每个数据列 1 个 cell
   * - dim+measure 多级 case：levels 长度 ≥ 2，每级按 dim 值合并
   *
   * 缺省时（测试 fixture 简化），PivotRenderer 退化按 columnHeader 渲染单级。
   */
  columnHeaderLevels?: ColumnHeaderGroupCell[][];
  /** 稠密二维矩阵 [rowIndex][colIndex]，缺失格 = EMPTY_CELL */
  matrix: RenderCell[][];
  /** 总计行数据（如 showGrandTotal=true） */
  grandTotalRow: RenderCell[] | null;
  columnMeta: ColumnMetaData[];
  pagination: { totalRowCount: number };
}
