/**
 * xlsxExport — RenderModel → .xlsx Blob(纯函数)
 *
 * 不验证 SheetJS 内部实现;只验证:
 *   - blob mime/size 合理
 *   - 反序列化回 worksheet 后,内容跟 RenderModel 对齐(标题行 + 数据行 + 总计行)
 *   - 数值列保留 number 类型(Excel 能 SUM)
 *   - 空 / masked / empty 单元格按业务规则处理
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { Member } from '../../types/cellSet.js';
import type { RenderModel } from '../../types/renderModel.js';

import { renderModelToXlsxBlob } from './xlsxExport.js';

function makeMember(name: string, uniqueName: string[]): Member {
  return { name, uniqueName, level: 'L', dimension: 'h', fieldName: 'h' };
}

const baseModel: RenderModel = {
  rowHeader: [
    {
      member: makeMember('江苏', ['江苏']),
      depth: 0,
      rowIndex: 0,
      fullPath: ['江苏'],
      hierarchyFieldName: 'h',
      canDrillDown: false,
      canDrillUp: false,
    },
    {
      member: makeMember('广东', ['广东']),
      depth: 0,
      rowIndex: 1,
      fullPath: ['广东'],
      hierarchyFieldName: 'h',
      canDrillDown: false,
      canDrillUp: false,
    },
  ],
  columnHeader: [{ fieldName: 'm1', alias: '销售额', dataFormat: 'fmt', isMeasure: true }],
  matrix: [
    [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: false }],
    [{ value: 2500, formattedValue: '2,500', isEmpty: false, isMasked: false }],
  ],
  grandTotalRow: null,
  columnMeta: [],
  pagination: { totalRowCount: 2 },
};

/** 反序列化 blob → worksheet aoa,便于断言 */
async function decodeBlob(blob: Blob): Promise<unknown[][]> {
  const buf = await blob.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
}

describe('renderModelToXlsxBlob', () => {
  it('生成正确 mime 类型的 Blob', () => {
    const blob = renderModelToXlsxBlob(baseModel);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it('首行 = 路径 + measure aliases', async () => {
    const aoa = await decodeBlob(renderModelToXlsxBlob(baseModel));
    expect(aoa[0]).toEqual(['路径', '销售额']);
  });

  it('数据行 = rowHeader 路径(/ 拼接)+ 数值列(保留 number 类型)', async () => {
    const aoa = await decodeBlob(renderModelToXlsxBlob(baseModel));
    expect(aoa[1]).toEqual(['江苏', 1000]);
    expect(aoa[2]).toEqual(['广东', 2500]);
    // 数值类型保留 — typeof === 'number',Excel 里能 SUM
    expect(typeof aoa[1]![1]).toBe('number');
  });

  it('总计行(若存在)在末尾,标签 = "总计"', async () => {
    const aoa = await decodeBlob(
      renderModelToXlsxBlob({
        ...baseModel,
        grandTotalRow: [
          { value: 3500, formattedValue: '3,500', isEmpty: false, isMasked: false },
        ],
      }),
    );
    const lastRow = aoa[aoa.length - 1];
    expect(lastRow).toEqual(['总计', 3500]);
  });

  it('masked 单元格 → ***;empty → 空字符串', async () => {
    const aoa = await decodeBlob(
      renderModelToXlsxBlob({
        ...baseModel,
        matrix: [
          [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: true }],
          [{ value: null, formattedValue: '', isEmpty: true, isMasked: false }],
        ],
      }),
    );
    expect(aoa[1]).toEqual(['江苏', '***']);
    // empty cell → 不出现(SheetJS 默认跳过空)或为空字符串
    expect(aoa[2]?.[1] === undefined || aoa[2]?.[1] === '').toBe(true);
  });

  it('多行嵌套层级 → / 连接', async () => {
    const aoa = await decodeBlob(
      renderModelToXlsxBlob({
        ...baseModel,
        rowHeader: [
          {
            member: makeMember('苏南', ['江苏', '苏南']),
            depth: 1,
            rowIndex: 0,
            fullPath: ['江苏', '苏南'],
            hierarchyFieldName: 'h',
            canDrillDown: false,
            canDrillUp: true,
          },
        ],
        matrix: [
          [{ value: 600, formattedValue: '600', isEmpty: false, isMasked: false }],
        ],
      }),
    );
    expect(aoa[1]).toEqual(['江苏 / 苏南', 600]);
  });
});
