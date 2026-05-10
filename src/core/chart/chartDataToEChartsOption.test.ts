/**
 * chartDataToEChartsOption — ChartData → echarts option 适配纯函数测试
 *
 * 不变量:
 *   I1. 饼图:1 个 series(pie),data 直接复用 ChartPieData.series
 *   I2. 柱/线:N 个 series,xAxis.data 复用 ChartCategoryData.xAxis
 *   I3. line.connectNulls=false(null 断线,符合"脱敏缺口"语义)
 *   I4. line.smooth=true(平滑曲线 — MVP 默认)
 *   I5. X 标签 > 8 个 → rotate=30(避免拥挤)
 */
import { describe, expect, it } from 'vitest';

import type { ChartCategoryData, ChartPieData } from './buildChartSeries.js';

import { chartDataToEChartsOption } from './chartDataToEChartsOption.js';

describe('chartDataToEChartsOption — pie', () => {
  it('单系列 pie option', () => {
    const data: ChartPieData = {
      type: 'pie',
      series: [
        { name: '白色家电', value: 1000 },
        { name: '黑色家电', value: 800 },
      ],
    };
    const opt = chartDataToEChartsOption(data);
    expect(opt.series).toEqual([
      expect.objectContaining({
        type: 'pie',
        data: [
          { name: '白色家电', value: 1000 },
          { name: '黑色家电', value: 800 },
        ],
      }),
    ]);
    expect(opt.tooltip).toEqual(expect.objectContaining({ trigger: 'item' }));
  });
});

describe('chartDataToEChartsOption — bar/line', () => {
  it('柱状图:N 系列,共用 xAxis', () => {
    const data: ChartCategoryData = {
      type: 'bar',
      xAxis: ['A', 'B'],
      series: [
        { name: '销售额', data: [100, 200] },
        { name: '成本', data: [50, 80] },
      ],
    };
    const opt = chartDataToEChartsOption(data);
    expect(opt.xAxis).toEqual(
      expect.objectContaining({ type: 'category', data: ['A', 'B'] }),
    );
    expect((opt.series as Array<{ type: string; name: string }>).map((s) => s.name)).toEqual([
      '销售额',
      '成本',
    ]);
    expect((opt.series as Array<{ type: string }>)[0]!.type).toBe('bar');
  });

  it('折线图:smooth=true, connectNulls=false(null 处断线 — 脱敏缺口)', () => {
    const data: ChartCategoryData = {
      type: 'line',
      xAxis: ['A', 'B', 'C'],
      series: [{ name: '销售额', data: [100, null, 300] }],
    };
    const opt = chartDataToEChartsOption(data);
    const series = opt.series as Array<{ type: string; smooth?: boolean; connectNulls?: boolean }>;
    expect(series[0]!.type).toBe('line');
    expect(series[0]!.smooth).toBe(true);
    expect(series[0]!.connectNulls).toBe(false);
  });

  it('X 标签 ≤ 8 → rotate=0(不旋转)', () => {
    const data: ChartCategoryData = {
      type: 'bar',
      xAxis: ['A', 'B', 'C'],
      series: [{ name: 'M', data: [1, 2, 3] }],
    };
    const opt = chartDataToEChartsOption(data);
    expect((opt.xAxis as { axisLabel: { rotate: number } }).axisLabel.rotate).toBe(0);
  });

  it('X 标签 > 8 → rotate=30(避免拥挤)', () => {
    const data: ChartCategoryData = {
      type: 'bar',
      xAxis: Array.from({ length: 12 }).map((_, i) => `M${i}`),
      series: [{ name: 'M', data: Array(12).fill(1) }],
    };
    const opt = chartDataToEChartsOption(data);
    expect((opt.xAxis as { axisLabel: { rotate: number } }).axisLabel.rotate).toBe(30);
  });

  it('空数据:xAxis=[],series=[每系列空 data]', () => {
    const data: ChartCategoryData = {
      type: 'bar',
      xAxis: [],
      series: [{ name: '销售额', data: [] }],
    };
    const opt = chartDataToEChartsOption(data);
    expect((opt.xAxis as { data: string[] }).data).toEqual([]);
    expect((opt.series as Array<{ data: number[] }>)[0]!.data).toEqual([]);
  });
});
