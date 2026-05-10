/**
 * buildDenseMatrix 测试
 *
 * 职责：把后端稀疏 Cell[] + (rowCount, colCount) → 稠密 RenderCell[][]
 * 缺失格统一填 EMPTY_CELL（参见 RenderModel 契约）
 */

import { describe, expect, it } from 'vitest';

import type { Cell } from '../../types/cellSet.js';
import { EMPTY_CELL } from '../../types/renderModel.js';

import { buildDenseMatrix } from './matrixBuilder.js';

describe('buildDenseMatrix', () => {
  it('should produce all-EMPTY matrix for empty cells', () => {
    const matrix = buildDenseMatrix([], 2, 3);

    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(3);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        expect(matrix[r]![c]).toBe(EMPTY_CELL);
      }
    }
  });

  it('should fill cells at correct positions and leave others EMPTY', () => {
    const cells: Cell[] = [
      { row: 0, column: 1, value: 100, formattedValue: '100' },
      { row: 1, column: 2, value: 200, formattedValue: '200' },
    ];

    const matrix = buildDenseMatrix(cells, 2, 3);

    expect(matrix[0]![0]).toBe(EMPTY_CELL);
    expect(matrix[0]![1]).toMatchObject({ value: 100, formattedValue: '100', isEmpty: false });
    expect(matrix[0]![2]).toBe(EMPTY_CELL);
    expect(matrix[1]![0]).toBe(EMPTY_CELL);
    expect(matrix[1]![1]).toBe(EMPTY_CELL);
    expect(matrix[1]![2]).toMatchObject({ value: 200, formattedValue: '200', isEmpty: false });
  });

  it('should mark filled cells as isMasked=false by default (caller decides)', () => {
    const cells: Cell[] = [{ row: 0, column: 0, value: 1, formattedValue: '1' }];
    const matrix = buildDenseMatrix(cells, 1, 1);
    expect(matrix[0]![0]).toMatchObject({ isMasked: false, isEmpty: false });
  });

  it('should produce zero-row matrix when rowCount=0', () => {
    expect(buildDenseMatrix([], 0, 3)).toEqual([]);
  });

  it('should produce zero-col matrix when colCount=0', () => {
    const matrix = buildDenseMatrix([], 2, 0);
    expect(matrix).toEqual([[], []]);
  });

  it('should ignore cells outside the declared grid (defensive)', () => {
    // 后端理论上不会返回越界 cell，但前端要 defensive
    const cells: Cell[] = [
      { row: 5, column: 5, value: 'oob', formattedValue: 'oob' },
      { row: 0, column: 0, value: 'ok', formattedValue: 'ok' },
    ];
    const matrix = buildDenseMatrix(cells, 2, 2);
    expect(matrix[0]![0]).toMatchObject({ value: 'ok' });
    // 越界 cell 不应该崩溃也不应该混进结果
    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
  });

  it('should preserve last write when duplicate (row, col) cells exist (defensive)', () => {
    const cells: Cell[] = [
      { row: 0, column: 0, value: 1, formattedValue: '1' },
      { row: 0, column: 0, value: 2, formattedValue: '2' },
    ];
    const matrix = buildDenseMatrix(cells, 1, 1);
    expect(matrix[0]![0]).toMatchObject({ value: 2, formattedValue: '2' });
  });
});
