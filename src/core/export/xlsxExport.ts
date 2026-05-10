/**
 * renderModelToXlsxBlob — RenderModel → .xlsx Blob
 *
 * 单一职责(Unix):纯转换 → blob;不下载、不读 DOM、不感知 React。
 * 调用方负责触发下载(URL.createObjectURL + 隐式 <a download>)。
 *
 * 跟 csvExport 区别:
 *   - csv 是字符串(逗号分隔 + 双引号转义);xlsx 是二进制 ZIP(.xlsx 是 zipped XML)
 *   - xlsx 保留数字/字符串类型(Excel 能直接 SUM 数值列;CSV 全是字符串)
 *   - xlsx 文件大小 ~ csv 的 50%(zip 压缩),适合"全量导出"场景
 *
 * 实现走 SheetJS(xlsx 包)的 aoa_to_sheet (二维数组 → worksheet)。
 */
import * as XLSX from 'xlsx';

import type { RenderCell, RenderModel } from '../../types/renderModel.js';

const PATH_HEADER_LABEL = '路径';
const GRAND_TOTAL_LABEL = '总计';

/** 数值 cell → number;空 / masked → 字符串 */
function cellToXlsxValue(cell: RenderCell): string | number {
  if (cell.isEmpty) return '';
  if (cell.isMasked) return '***';
  // 尝试用原始 value(可能是 number);否则用 formattedValue 字符串
  if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return cell.value;
  return cell.formattedValue;
}

/**
 * @param model 渲染模型
 * @param sheetName 工作表名(默认 'Sheet1')
 * @returns .xlsx 二进制 Blob,直接可 createObjectURL 下载
 */
export function renderModelToXlsxBlob(model: RenderModel, sheetName = 'Sheet1'): Blob {
  // aoa = array of arrays:每行一个 array;首行是 header
  const aoa: Array<Array<string | number>> = [];

  // Header row
  aoa.push([PATH_HEADER_LABEL, ...model.columnHeader.map((c) => c.alias)]);

  // Data rows
  for (let r = 0; r < model.rowHeader.length; r++) {
    const rowNode = model.rowHeader[r]!;
    const row: Array<string | number> = [rowNode.fullPath.join(' / ')];
    for (const cell of model.matrix[r]!) {
      row.push(cellToXlsxValue(cell));
    }
    aoa.push(row);
  }

  // Grand total
  if (model.grandTotalRow) {
    aoa.push([GRAND_TOTAL_LABEL, ...model.grandTotalRow.map(cellToXlsxValue)]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // type:'array' 返回 ArrayBuffer-like;包成 Blob
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
