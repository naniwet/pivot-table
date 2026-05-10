/**
 * extractSelectionTsv — 从 RenderModel + 矩形选区抽 TSV 文本
 *
 * UX：用户在透视表里拖选一块矩形，按 Ctrl/Cmd+C 复制 → 这个纯函数生成 TSV
 *
 * 设计：
 *   - 第一行：选中列的 alias（保证粘贴到 Excel 有列头）
 *   - 后续行：行头 fullPath + 选中数据列的 formattedValue
 *   - 不做 row span 合并 — 每行独立（粘贴到 Excel 后用户自己处理）
 */
import { describe, expect, it } from 'vitest';

import type { RenderModel } from '../../types/renderModel.js';

import { extractSelectionTsv } from './extractSelectionTsv.js';

const baseRenderModel = (): RenderModel => ({
  rowHeader: [
    {
      member: { name: '江苏', uniqueName: ['江苏'], level: 'L', dimension: 'd', fieldName: 'f' },
      depth: 0,
      rowIndex: 0,
      fullPath: ['江苏'],
      hierarchyFieldName: 'h1',
      canDrillDown: false,
      canDrillUp: false,
    },
    {
      member: { name: '浙江', uniqueName: ['浙江'], level: 'L', dimension: 'd', fieldName: 'f' },
      depth: 0,
      rowIndex: 1,
      fullPath: ['浙江'],
      hierarchyFieldName: 'h1',
      canDrillDown: false,
      canDrillUp: false,
    },
    {
      member: { name: '上海', uniqueName: ['上海'], level: 'L', dimension: 'd', fieldName: 'f' },
      depth: 0,
      rowIndex: 2,
      fullPath: ['上海'],
      hierarchyFieldName: 'h1',
      canDrillDown: false,
      canDrillUp: false,
    },
  ],
  columnHeader: [
    { fieldName: 'sales', alias: '销售额', dataFormat: '', isMeasure: true },
    { fieldName: 'profit', alias: '利润', dataFormat: '', isMeasure: true },
    { fieldName: 'qty', alias: '数量', dataFormat: '', isMeasure: true },
  ],
  matrix: [
    [
      { value: 100, formattedValue: '100', isEmpty: false, isMasked: false },
      { value: 10, formattedValue: '10', isEmpty: false, isMasked: false },
      { value: 1, formattedValue: '1', isEmpty: false, isMasked: false },
    ],
    [
      { value: 200, formattedValue: '200', isEmpty: false, isMasked: false },
      { value: 20, formattedValue: '20', isEmpty: false, isMasked: false },
      { value: 2, formattedValue: '2', isEmpty: false, isMasked: false },
    ],
    [
      { value: 300, formattedValue: '300', isEmpty: false, isMasked: false },
      { value: 30, formattedValue: '30', isEmpty: false, isMasked: false },
      { value: 3, formattedValue: '3', isEmpty: false, isMasked: false },
    ],
  ],
  pagination: { totalRowCount: 3 },
  grandTotalRow: null,
  columnMeta: [
    { name: 'sales', alias: '销售额', valueType: 'DOUBLE', dataFormat: '', maskingRuleIdList: [], accessible: true },
    { name: 'profit', alias: '利润', valueType: 'DOUBLE', dataFormat: '', maskingRuleIdList: [], accessible: true },
    { name: 'qty', alias: '数量', valueType: 'INTEGER', dataFormat: '', maskingRuleIdList: [], accessible: true },
  ],
});

describe('extractSelectionTsv', () => {
  it('单 cell 选区 → header + 1 行 1 列', () => {
    const tsv = extractSelectionTsv(baseRenderModel(), { rStart: 0, rEnd: 0, cStart: 0, cEnd: 0 });
    expect(tsv).toBe(['销售额', '江苏\t100'].join('\n'));
  });

  it('整行选区（所有 3 列）', () => {
    const tsv = extractSelectionTsv(baseRenderModel(), { rStart: 1, rEnd: 1, cStart: 0, cEnd: 2 });
    expect(tsv).toBe(['销售额\t利润\t数量', '浙江\t200\t20\t2'].join('\n'));
  });

  it('整列选区（所有 3 行）', () => {
    const tsv = extractSelectionTsv(baseRenderModel(), { rStart: 0, rEnd: 2, cStart: 1, cEnd: 1 });
    expect(tsv).toBe(['利润', '江苏\t10', '浙江\t20', '上海\t30'].join('\n'));
  });

  it('矩形选区 (2x2)', () => {
    const tsv = extractSelectionTsv(baseRenderModel(), { rStart: 0, rEnd: 1, cStart: 1, cEnd: 2 });
    expect(tsv).toBe(['利润\t数量', '江苏\t10\t1', '浙江\t20\t2'].join('\n'));
  });

  it('反向拖选（end < start）也能正确还原矩形', () => {
    const tsv = extractSelectionTsv(baseRenderModel(), { rStart: 2, rEnd: 0, cStart: 2, cEnd: 0 });
    // 等价于 (0..2, 0..2)，应为整表
    expect(tsv).toContain('销售额\t利润\t数量');
    expect(tsv).toContain('江苏\t100\t10\t1');
    expect(tsv).toContain('上海\t300\t30\t3');
  });

  it('isMasked → 输出 ***（与 PivotRenderer 显示一致）', () => {
    const m = baseRenderModel();
    m.matrix[0]![0] = { value: null, formattedValue: '', isEmpty: false, isMasked: true };
    const tsv = extractSelectionTsv(m, { rStart: 0, rEnd: 0, cStart: 0, cEnd: 0 });
    expect(tsv).toBe(['销售额', '江苏\t***'].join('\n'));
  });

  it('isEmpty → 空字符串', () => {
    const m = baseRenderModel();
    m.matrix[0]![0] = { value: null, formattedValue: '', isEmpty: true, isMasked: false };
    const tsv = extractSelectionTsv(m, { rStart: 0, rEnd: 0, cStart: 0, cEnd: 0 });
    expect(tsv).toBe(['销售额', '江苏\t'].join('\n'));
  });

  it('多级 fullPath（行头是嵌套 hierarchy）按 \\t 拼接', () => {
    const m = baseRenderModel();
    m.rowHeader[0]!.fullPath = ['江苏', '苏南', '南京'];
    const tsv = extractSelectionTsv(m, { rStart: 0, rEnd: 0, cStart: 0, cEnd: 0 });
    expect(tsv).toBe(['销售额', '江苏\t苏南\t南京\t100'].join('\n'));
  });

  it('选区超出范围 → 跳过缺失格（防御性）', () => {
    const m = baseRenderModel();
    const tsv = extractSelectionTsv(m, { rStart: 0, rEnd: 5, cStart: 0, cEnd: 5 });
    // 不应抛错；超出部分填空
    expect(tsv.split('\n').length).toBeGreaterThan(1);
  });
});
