/**
 * buildChartSeries — RenderModel → ChartData 纯函数测试
 *
 * 不变量:
 *   I1. xAxis.length === rowHeader.length(总计行不在 model.matrix,自然排除)
 *   I2. series.length === columnHeader.length(每列一个系列)
 *   I3. masked/empty cell → null(图表渲染缺口,不当 0)
 *   I4. 饼图取第一列(单系列扁平),非正数跳过
 */
import { describe, expect, it } from 'vitest';

import type { RenderModel, RenderCell, RowHeaderNode, ColumnHeaderCell } from '../../types/renderModel.js';

import { buildChartSeries } from './buildChartSeries.js';

function cell(value: number | null, opts: Partial<RenderCell> = {}): RenderCell {
  return {
    value,
    formattedValue: value === null ? '' : String(value),
    isEmpty: value === null,
    isMasked: false,
    ...opts,
  };
}

function rowNode(name: string, fullPath?: string[]): RowHeaderNode {
  return {
    member: { name, uniqueName: [name], level: 'L', dimension: 'D', fieldName: 'F' },
    depth: 0,
    rowIndex: 0,
    fullPath: fullPath ?? [name],
    hierarchyFieldName: null,
    canDrillDown: false,
    canDrillUp: false,
  };
}

function colHeader(alias: string, fieldName = alias): ColumnHeaderCell {
  return { fieldName, alias, dataFormat: '', isMeasure: true };
}

function makeModel(opts: {
  rows: RowHeaderNode[];
  columns: ColumnHeaderCell[];
  matrix: RenderCell[][];
}): RenderModel {
  return {
    rowHeader: opts.rows,
    columnHeader: opts.columns,
    matrix: opts.matrix,
    grandTotalRow: null,
    columnMeta: [],
    pagination: { totalRowCount: opts.rows.length },
  };
}

describe('buildChartSeries — bar/line 多系列', () => {
  it('单 row + 单 column → 1 系列 1 数据点', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('江苏')],
        columns: [colHeader('销售额')],
        matrix: [[cell(1000)]],
      }),
      chartType: 'bar',
    });
    expect(data.type).toBe('bar');
    if (data.type === 'pie') return;
    expect(data.xAxis).toEqual(['江苏']);
    expect(data.series).toEqual([{ name: '销售额', data: [1000] }]);
  });

  it('多 row + 多 column → X 轴 N 标签 + M 系列(每系列 N 个数据点)', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('江苏'), rowNode('浙江')],
        columns: [colHeader('销售额'), colHeader('销售成本')],
        matrix: [
          [cell(1000), cell(700)],
          [cell(800), cell(500)],
        ],
      }),
      chartType: 'line',
    });
    if (data.type === 'pie') throw new Error('expected line');
    expect(data.xAxis).toEqual(['江苏', '浙江']);
    expect(data.series).toEqual([
      { name: '销售额', data: [1000, 800] },
      { name: '销售成本', data: [700, 500] },
    ]);
  });

  it('多级行(hierarchy fullPath)→ X 轴用 fullPath join 分隔', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [
          rowNode('Q1', ['2023', 'Q1']),
          rowNode('Q2', ['2023', 'Q2']),
        ],
        columns: [colHeader('销售额')],
        matrix: [[cell(100)], [cell(200)]],
      }),
      chartType: 'bar',
    });
    if (data.type === 'pie') throw new Error('expected bar');
    expect(data.xAxis).toEqual(['2023 / Q1', '2023 / Q2']);
  });

  it('I3: 脱敏/空 cell → series.data 中是 null', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('A'), rowNode('B'), rowNode('C')],
        columns: [colHeader('销售额')],
        matrix: [
          [cell(100)],
          [cell(null, { isMasked: true, value: '***' })],
          [cell(null)],
        ],
      }),
      chartType: 'line',
    });
    if (data.type === 'pie') throw new Error('expected line');
    expect(data.series[0]!.data).toEqual([100, null, null]);
  });

  it('字符串数字 cell.value → 转 number;非数字字符串 → null', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('A'), rowNode('B')],
        columns: [colHeader('销售额')],
        matrix: [
          // 后端可能返回数字字符串(尤其 BIGINT 转 string 防溢出)
          [{ value: '1234.5', formattedValue: '1234.5', isEmpty: false, isMasked: false }],
          [{ value: 'N/A', formattedValue: 'N/A', isEmpty: false, isMasked: false }],
        ],
      }),
      chartType: 'bar',
    });
    if (data.type === 'pie') throw new Error('expected bar');
    expect(data.series[0]!.data).toEqual([1234.5, null]);
  });

  it('空 model(0 行)→ xAxis=[],series=[每列空 data 数组]', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [],
        columns: [colHeader('销售额')],
        matrix: [],
      }),
      chartType: 'bar',
    });
    if (data.type === 'pie') throw new Error('expected bar');
    expect(data.xAxis).toEqual([]);
    expect(data.series).toEqual([{ name: '销售额', data: [] }]);
  });
});

describe('buildChartSeries — pie 单系列扁平', () => {
  it('单度量 + N 行 → N 个 {name,value} 切片', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('白色家电'), rowNode('黑色家电'), rowNode('厨电')],
        columns: [colHeader('销售额')],
        matrix: [[cell(1000)], [cell(800)], [cell(500)]],
      }),
      chartType: 'pie',
    });
    expect(data.type).toBe('pie');
    if (data.type !== 'pie') return;
    expect(data.series).toEqual([
      { name: '白色家电', value: 1000 },
      { name: '黑色家电', value: 800 },
      { name: '厨电', value: 500 },
    ]);
  });

  it('多列 → 仅取第一列(避免多系列饼图歧义)', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('A'), rowNode('B')],
        columns: [colHeader('销售额'), colHeader('销售成本')],
        matrix: [
          [cell(1000), cell(800)],
          [cell(500), cell(300)],
        ],
      }),
      chartType: 'pie',
    });
    if (data.type !== 'pie') throw new Error('expected pie');
    // 销售成本(800/300)被忽略,只用第一列
    expect(data.series).toEqual([
      { name: 'A', value: 1000 },
      { name: 'B', value: 500 },
    ]);
  });

  it('饼图忽略非正数 / null(几何无意义)', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [rowNode('A'), rowNode('B'), rowNode('C'), rowNode('D')],
        columns: [colHeader('利润')],
        matrix: [
          [cell(100)],
          [cell(-50)], // 负值跳过
          [cell(0)], // 0 跳过
          [cell(null)], // 空跳过
        ],
      }),
      chartType: 'pie',
    });
    if (data.type !== 'pie') throw new Error('expected pie');
    expect(data.series).toEqual([{ name: 'A', value: 100 }]);
  });

  it('饼图 0 行 → 空 series', () => {
    const data = buildChartSeries({
      model: makeModel({
        rows: [],
        columns: [colHeader('销售额')],
        matrix: [],
      }),
      chartType: 'pie',
    });
    if (data.type !== 'pie') throw new Error('expected pie');
    expect(data.series).toEqual([]);
  });
});
