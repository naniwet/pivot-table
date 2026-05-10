/**
 * renderModelToCsv — RenderModel → CSV 字符串
 *
 * 单一职责（Unix）：纯转换，不下载文件、不读取 DOM、不感知 React。
 * 调用方负责把字符串包装成 Blob + 触发下载。
 *
 * 格式（RFC 4180）：
 *   - 全部字段双引号包裹（最简单的转义策略）
 *   - 字段内的双引号 → ""
 *   - 行分隔：'\n'（`\r\n` 在 Windows 由文本编辑器处理）
 */
import type { RenderCell, RenderModel } from '../../types/renderModel.js';

const PATH_HEADER_LABEL = '路径';
const GRAND_TOTAL_LABEL = '总计';

function quote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`;
}

function cellToCsvField(cell: RenderCell): string {
  if (cell.isEmpty) return '';
  if (cell.isMasked) return '***';
  return cell.formattedValue;
}

export function renderModelToCsv(model: RenderModel): string {
  const lines: string[] = [];

  // Header row
  const headerCells = [PATH_HEADER_LABEL, ...model.columnHeader.map((c) => c.alias)];
  lines.push(headerCells.map(quote).join(','));

  // Data rows
  for (let r = 0; r < model.rowHeader.length; r++) {
    const rowNode = model.rowHeader[r]!;
    const cells = [rowNode.fullPath.join(' / '), ...model.matrix[r]!.map(cellToCsvField)];
    lines.push(cells.map(quote).join(','));
  }

  // Grand total row
  if (model.grandTotalRow) {
    const cells = [GRAND_TOTAL_LABEL, ...model.grandTotalRow.map(cellToCsvField)];
    lines.push(cells.map(quote).join(','));
  }

  return lines.join('\n');
}
