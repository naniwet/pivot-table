/**
 * buildChartSeries — RenderModel → 标准 ChartData(图表库无关)
 *
 * 设计:
 *   - 纯函数,不依赖 echarts/recharts;输出 ChartData 由 ChartRenderer 适配到具体图表库
 *   - 数据映射:
 *       - 行字段 fullPath → X 轴标签(category)
 *       - 列字段(列头每一项)→ 一个系列
 *       - 矩阵 [r][c] → 该 (X 标签, 系列) 的 Y 值
 *   - 排除总计行(grandTotalRow)— 否则一根柱比其他高 N 倍,比例失真
 *   - 脱敏(isMasked) / 空(isEmpty) → null(图表渲染缺口,不当 0)
 *
 * 三种 chart type 共用同一份数据,只是 ChartData.type 字段标识用法:
 *   - bar / line:    ChartCategoryData(xAxis + multi series)
 *   - pie:           ChartPieData(单系列 [{name, value}],只取第一列数据避免歧义)
 */

import type { RenderModel } from '../../types/renderModel.js';

export type ChartType = 'bar' | 'line' | 'pie';

/** 柱状图 / 折线图 — 多系列共用 X 轴 */
export interface ChartCategoryData {
  type: 'bar' | 'line';
  xAxis: string[];
  series: Array<{
    /** 系列名(列头 alias / 度量名) */
    name: string;
    /** Y 值数组,长度 = xAxis.length;null = 空/脱敏单元 */
    data: Array<number | null>;
  }>;
}

/** 饼图 — 单系列扁平 */
export interface ChartPieData {
  type: 'pie';
  series: Array<{ name: string; value: number }>;
}

export type ChartData = ChartCategoryData | ChartPieData;

/** 把 RenderCell.value 转 number;字符串数字也接受;empty/masked → null */
function cellToNumber(value: unknown, isEmpty: boolean, isMasked: boolean): number | null {
  if (isEmpty || isMasked) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** rowHeader 转 X 轴标签:fullPath join '/'(多级时显示 "2023 / Q1") */
function rowToLabel(node: RenderModel['rowHeader'][number]): string {
  if (node.fullPath.length === 0) return node.member.name;
  return node.fullPath.join(' / ');
}

export interface BuildChartSeriesInput {
  model: RenderModel;
  chartType: ChartType;
}

export function buildChartSeries(input: BuildChartSeriesInput): ChartData {
  const { model, chartType } = input;
  const xLabels = model.rowHeader.map(rowToLabel);
  const colCount = model.columnHeader.length;

  if (chartType === 'pie') {
    // 饼图:用第一列(colIndex=0)数据,X 标签当作 name
    // 多列时只取第一列(避免多系列饼图的语义歧义);用户多列想看比例应切柱图
    const series: ChartPieData['series'] = [];
    for (let r = 0; r < model.rowHeader.length; r++) {
      const cell = model.matrix[r]?.[0];
      if (!cell) continue;
      const v = cellToNumber(cell.value, cell.isEmpty, cell.isMasked);
      if (v === null || v <= 0) continue; // 饼图忽略非正数(无几何意义)
      series.push({ name: xLabels[r] ?? `行${r}`, value: v });
    }
    return { type: 'pie', series };
  }

  // bar / line:多系列共用 X 轴
  const series: ChartCategoryData['series'] = [];
  for (let c = 0; c < colCount; c++) {
    const colHeader = model.columnHeader[c];
    if (!colHeader) continue;
    const data: Array<number | null> = [];
    for (let r = 0; r < model.rowHeader.length; r++) {
      const cell = model.matrix[r]?.[c];
      if (!cell) {
        data.push(null);
        continue;
      }
      data.push(cellToNumber(cell.value, cell.isEmpty, cell.isMasked));
    }
    series.push({ name: colHeader.alias, data });
  }

  return { type: chartType, xAxis: xLabels, series };
}
