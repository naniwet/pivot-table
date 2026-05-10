/**
 * extractSelectionTsv — 从 RenderModel + 矩形选区抽 TSV
 *
 * 单一职责：纯字符串构造。无 DOM 依赖，无副作用。
 *
 * 输出格式：
 *   <列头 alias> [\t <列头 alias>...]
 *   <行头 path[0]> [\t <path[1]>...] \t <data> [\t <data>...]
 *   ...
 */
import type { RenderModel } from '../../types/renderModel.js';

export interface CellSelection {
  rStart: number;
  cStart: number;
  rEnd: number;
  cEnd: number;
}

function cellTextOf(
  cell: { formattedValue: string; isEmpty: boolean; isMasked: boolean } | undefined,
): string {
  if (!cell) return '';
  if (cell.isMasked) return '***';
  if (cell.isEmpty) return '';
  return cell.formattedValue;
}

export function extractSelectionTsv(model: RenderModel, sel: CellSelection): string {
  const rMin = Math.min(sel.rStart, sel.rEnd);
  const rMax = Math.max(sel.rStart, sel.rEnd);
  const cMin = Math.min(sel.cStart, sel.cEnd);
  const cMax = Math.max(sel.cStart, sel.cEnd);

  // 列头行
  const headerCells: string[] = [];
  for (let c = cMin; c <= cMax; c++) {
    headerCells.push(model.columnHeader[c]?.alias ?? '');
  }
  const lines: string[] = [headerCells.join('\t')];

  // 数据行
  for (let r = rMin; r <= rMax; r++) {
    const rowNode = model.rowHeader[r];
    const rowPath = rowNode?.fullPath ?? [];
    const dataCells: string[] = [];
    for (let c = cMin; c <= cMax; c++) {
      dataCells.push(cellTextOf(model.matrix[r]?.[c]));
    }
    lines.push([...rowPath, ...dataCells].join('\t'));
  }
  return lines.join('\n');
}
