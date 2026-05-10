/**
 * renderModelToCsv — RenderModel → CSV 字符串（纯函数）
 *
 * P0 验收（[phase-p0.md](../../../prd/phase-p0.md) §9）：
 *   "字段名用 alias、数值带格式、含总计行"
 *
 * 格式约定：
 *   - 第一列：行路径（fullPath joined by " / "）
 *   - 其余列：每个度量的 formattedValue
 *   - 总计行：第一列固定 "总计"
 *   - 含逗号 / 引号 / 换行的字段：套双引号，内层双引号 → ""（RFC 4180）
 *   - 脱敏 cell → ***
 *   - EMPTY_CELL → 空字段（无 formattedValue）
 */
import { describe, expect, it } from 'vitest';

import type { Member } from '../../types/cellSet.js';
import type { RenderModel } from '../../types/renderModel.js';

import { renderModelToCsv } from './csvExport.js';

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
      canDrillDown: true,
      canDrillUp: false,
    },
    {
      member: makeMember('苏南', ['江苏', '苏南']),
      depth: 1,
      rowIndex: 1,
      fullPath: ['江苏', '苏南'],
      hierarchyFieldName: 'h',
      canDrillDown: false,
      canDrillUp: true,
    },
  ],
  columnHeader: [
    { fieldName: 'm1', alias: '销售额', dataFormat: 'fmt', isMeasure: true },
  ],
  matrix: [
    [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: false }],
    [{ value: 600, formattedValue: '600', isEmpty: false, isMasked: false }],
  ],
  grandTotalRow: null,
  columnMeta: [],
  pagination: { totalRowCount: 2 },
};

describe('renderModelToCsv', () => {
  it('renders a header row of "路径" + measure aliases', () => {
    const csv = renderModelToCsv(baseModel);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"路径","销售额"');
  });

  it('quotes the row label and emits formattedValue per measure', () => {
    const csv = renderModelToCsv(baseModel);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"江苏","1,000"');
    expect(lines[2]).toBe('"江苏 / 苏南","600"');
  });

  it('renders grand total row at the end with "总计" label', () => {
    const model: RenderModel = {
      ...baseModel,
      grandTotalRow: [
        { value: 9999, formattedValue: '9,999', isEmpty: false, isMasked: false },
      ],
    };
    const csv = renderModelToCsv(model);
    const lines = csv.split('\n');
    expect(lines[lines.length - 1]).toBe('"总计","9,999"');
  });

  it('renders masked cells as ***', () => {
    const model: RenderModel = {
      ...baseModel,
      matrix: [
        [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: true }],
        baseModel.matrix[1]!,
      ],
    };
    const csv = renderModelToCsv(model);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"江苏","***"');
  });

  it('renders EMPTY_CELL as an empty quoted field', () => {
    const model: RenderModel = {
      ...baseModel,
      matrix: [
        [{ value: null, formattedValue: '', isEmpty: true, isMasked: false }],
        baseModel.matrix[1]!,
      ],
    };
    const csv = renderModelToCsv(model);
    expect(csv.split('\n')[1]).toBe('"江苏",""');
  });

  it('escapes embedded quotes in a value (RFC 4180: " → "")', () => {
    const model: RenderModel = {
      ...baseModel,
      matrix: [
        [{ value: 'a', formattedValue: 'has "quote"', isEmpty: false, isMasked: false }],
        baseModel.matrix[1]!,
      ],
    };
    const csv = renderModelToCsv(model);
    expect(csv.split('\n')[1]).toBe('"江苏","has ""quote"""');
  });

  it('returns header-only CSV when rowHeader is empty', () => {
    const model: RenderModel = {
      ...baseModel,
      rowHeader: [],
      matrix: [],
      grandTotalRow: null,
    };
    expect(renderModelToCsv(model)).toBe('"路径","销售额"');
  });

  it('handles multiple measures in column header', () => {
    const model: RenderModel = {
      ...baseModel,
      columnHeader: [
        { fieldName: 'm1', alias: '销售额', dataFormat: 'fmt', isMeasure: true },
        { fieldName: 'm2', alias: '订单数', dataFormat: 'fmt', isMeasure: true },
      ],
      matrix: [
        [
          { value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: false },
          { value: 5, formattedValue: '5', isEmpty: false, isMasked: false },
        ],
        [
          { value: 600, formattedValue: '600', isEmpty: false, isMasked: false },
          { value: 3, formattedValue: '3', isEmpty: false, isMasked: false },
        ],
      ],
    };
    const lines = renderModelToCsv(model).split('\n');
    expect(lines[0]).toBe('"路径","销售额","订单数"');
    expect(lines[1]).toBe('"江苏","1,000","5"');
  });
});
