/**
 * buildDenseMatrix — 把后端稀疏 Cell[] 转成稠密 RenderCell[][]
 *
 * ADR-003：行列总数已知，预分配优于 Map 懒加载（数组访问比 Map 快 5-10x，渲染热路径）。
 *
 * 单一职责：纯稀疏→稠密。脱敏 / hierarchy 层级 / total 行不在这里处理。
 */

import type { Cell } from '../../types/cellSet.js';
import { EMPTY_CELL, type RenderCell } from '../../types/renderModel.js';

export function buildDenseMatrix(
  cells: Cell[],
  rowCount: number,
  colCount: number,
): RenderCell[][] {
  const matrix: RenderCell[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => EMPTY_CELL),
  );

  for (const cell of cells) {
    if (cell.row < 0 || cell.row >= rowCount) continue;
    if (cell.column < 0 || cell.column >= colCount) continue;

    matrix[cell.row]![cell.column] = {
      value: cell.value,
      formattedValue: cell.formattedValue,
      isEmpty: false,
      isMasked: false,
    };
  }

  return matrix;
}
