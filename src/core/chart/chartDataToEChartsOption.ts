/**
 * chartDataToEChartsOption — ChartData(库无关) → echarts option(库特定)
 *
 * 拆出来的原因(Unix 哲学:每个文件只做一件事):
 *   - buildChartSeries:CellSet/RenderModel → ChartData(数据映射)
 *   - chartDataToEChartsOption:ChartData → echarts option(渲染适配)
 *   - 换图表库时只需替换此文件,buildChartSeries 不动
 *
 * MVP 不做:
 *   - dataFormat 联动(tooltip 用 echarts 默认数字格式)
 *   - 颜色 / 标题 / 图例位置自定义
 *   - 双 Y 轴 / 组合图
 */
import type { ChartData } from './buildChartSeries.js';

/** echarts option 是 plain object;这里用 unknown 避免硬依赖 echarts 类型 */
export type EChartsOption = Record<string, unknown>;

export function chartDataToEChartsOption(data: ChartData): EChartsOption {
  if (data.type === 'pie') {
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { type: 'scroll', orient: 'horizontal', bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          avoidLabelOverlap: true,
          label: { show: true, formatter: '{b}\n{d}%' },
          data: data.series,
        },
      ],
    };
  }
  // bar / line:多系列共用 X 轴
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 50, right: 20, top: 40, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      // X 标签多于 8 个时旋转 30°,避免拥挤
      axisLabel: { interval: 0, rotate: data.xAxis.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value' },
    series: data.series.map((s) => ({
      name: s.name,
      type: data.type,
      data: s.data,
      // line 图:null 处断线(connectNulls=false);bar 自动跳过 null
      connectNulls: false,
      smooth: data.type === 'line',
    })),
  };
}
