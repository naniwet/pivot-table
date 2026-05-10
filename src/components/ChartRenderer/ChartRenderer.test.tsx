/**
 * ChartRenderer 组件测试
 *
 * 范围(jsdom 限制):
 *   - error / 空数据 / loading 状态分支
 *   - data-chart-type 属性反映 ChartData.type
 *   - canvas 容器存在(echarts 真渲染依赖 SVG/canvas,jsdom 不测)
 *
 * **echarts 真渲染由集成手测覆盖**(jsdom 跑不动 echarts canvas)
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChartData } from '../../core/chart/buildChartSeries.js';

// mock echarts(否则 jsdom canvas 报错)
vi.mock('echarts', () => ({
  init: () => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}));

import { ChartRenderer } from './ChartRenderer.js';

const barData: ChartData = {
  type: 'bar',
  xAxis: ['A', 'B'],
  series: [{ name: 'M', data: [10, 20] }],
};

describe('ChartRenderer — 状态分支', () => {
  it('error prop → 显示 error 文字,不渲染 canvas instance', () => {
    render(<ChartRenderer data={barData} error={new Error('网络挂了')} />);
    expect(screen.getByTestId('chart-renderer-error')).toHaveTextContent('网络挂了');
  });

  it('空 ChartData(bar 全 null)→ 显示 暂无数据', async () => {
    const empty: ChartData = {
      type: 'bar',
      xAxis: ['A'],
      series: [{ name: 'M', data: [null] }],
    };
    render(<ChartRenderer data={empty} />);
    // dynamic import echarts → waitFor 轮询(自带 timeout 兜底,不依赖单 tick)
    await waitFor(() =>
      expect(screen.getByTestId('chart-renderer-empty')).toBeInTheDocument(),
    );
  });

  it('空 pie series → 显示 暂无数据', async () => {
    const empty: ChartData = { type: 'pie', series: [] };
    render(<ChartRenderer data={empty} />);
    await waitFor(() =>
      expect(screen.getByTestId('chart-renderer-empty')).toBeInTheDocument(),
    );
  });

  it('正常数据 → 渲染 canvas + data-chart-type 属性', async () => {
    render(<ChartRenderer data={barData} />);
    await waitFor(() => {
      expect(screen.getByTestId('chart-renderer')).toHaveAttribute(
        'data-chart-type',
        'bar',
      );
    });
    expect(screen.getByTestId('chart-renderer-canvas')).toBeInTheDocument();
  });

  it('loading=true → 显示 加载中 overlay', async () => {
    render(<ChartRenderer data={barData} loading />);
    await waitFor(() =>
      expect(screen.getByTestId('chart-renderer-loading')).toBeInTheDocument(),
    );
  });
});
