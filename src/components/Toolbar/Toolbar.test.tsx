/**
 * Toolbar 组件测试 — P0 仅刷新 + CSV 导出
 *
 * 不在 P0 范围（不测）：
 *   - 视图保存/加载（P1.0）
 *   - 字段表达式编辑器入口（P2）
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar.js';

describe('Toolbar — buttons', () => {
  // 2026-05-16:CSV/Excel 两个按钮合并成单一 "导出 ▾" + popover(类型 radio + 行数)
  it('renders refresh and export buttons', () => {
    render(<Toolbar onRefresh={vi.fn()} onExportCsv={vi.fn()} />);
    expect(screen.getByTestId('toolbar-refresh')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-export')).toBeInTheDocument();
  });

  it('calls onRefresh on refresh click', async () => {
    const onRefresh = vi.fn();
    render(<Toolbar onRefresh={onRefresh} onExportCsv={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-refresh'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('点 toolbar-export → 弹 popover → 选 CSV → 点确定调 onExportCsv', async () => {
    const onExportCsv = vi.fn();
    render(<Toolbar onRefresh={vi.fn()} onExportCsv={onExportCsv} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-export'));
    // 没传 onExportExcel → 默认 type 自动落到 csv
    await user.click(screen.getByTestId('toolbar-export-confirm'));
    expect(onExportCsv).toHaveBeenCalled();
  });

  it('disables export button when exportDisabled=true (no data)', () => {
    render(<Toolbar onRefresh={vi.fn()} onExportCsv={vi.fn()} exportDisabled />);
    expect(screen.getByTestId('toolbar-export')).toBeDisabled();
  });

  it('does not call onExportCsv when disabled (button itself disabled,popover 也不能弹)', async () => {
    const onExportCsv = vi.fn();
    render(<Toolbar onRefresh={vi.fn()} onExportCsv={onExportCsv} exportDisabled />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-export'));
    // 按钮 disabled → click 无效,popover 不渲染
    expect(screen.queryByTestId('toolbar-export-popover')).not.toBeInTheDocument();
    expect(onExportCsv).not.toHaveBeenCalled();
  });

  // ============================================================
  // 图表切换在 adhoc(明细)模式下 disabled — 用户反馈"明细是不能切图表的"
  // ============================================================
  describe('chart toggle disabled in adhoc mode', () => {
    it('queryMode=adhoc 时图表切换按钮 disabled', () => {
      render(
        <Toolbar
          onRefresh={vi.fn()}
          onExportCsv={vi.fn()}
          onToggleDisplayMode={vi.fn()}
          queryMode="adhoc"
        />,
      );
      // segmented control wrapper 标了 data-disabled;内部两个 button 都 disabled
      const wrapper = screen.getByTestId('toolbar-toggle-display-mode');
      expect(wrapper.getAttribute('data-disabled')).toBe('true');
      expect(screen.getByTestId('display-mode-table')).toBeDisabled();
      expect(screen.getByTestId('display-mode-chart')).toBeDisabled();
    });

    it('queryMode=adhoc 时点击图表切换不调 onToggleDisplayMode', async () => {
      const onToggleDisplayMode = vi.fn();
      render(
        <Toolbar
          onRefresh={vi.fn()}
          onExportCsv={vi.fn()}
          onToggleDisplayMode={onToggleDisplayMode}
          queryMode="adhoc"
        />,
      );
      const user = userEvent.setup();
      // 点 disabled 的"图表"按钮不应触发回调
      await user.click(screen.getByTestId('display-mode-chart'));
      expect(onToggleDisplayMode).not.toHaveBeenCalled();
    });

    it('queryMode=adhoc 时图表类型选择器不渲染(即使 displayMode=chart)', () => {
      render(
        <Toolbar
          onRefresh={vi.fn()}
          onExportCsv={vi.fn()}
          onToggleDisplayMode={vi.fn()}
          onChangeChartType={vi.fn()}
          displayMode="chart"
          queryMode="adhoc"
        />,
      );
      // chart selector 不应出现
      expect(screen.queryByTestId('toolbar-chart-type')).not.toBeInTheDocument();
    });

    it('queryMode=pivot 时图表切换正常可用(回归)', () => {
      render(
        <Toolbar
          onRefresh={vi.fn()}
          onExportCsv={vi.fn()}
          onToggleDisplayMode={vi.fn()}
          queryMode="pivot"
        />,
      );
      const wrapper = screen.getByTestId('toolbar-toggle-display-mode');
      expect(wrapper.getAttribute('data-disabled')).toBe('false');
      expect(screen.getByTestId('display-mode-table')).not.toBeDisabled();
      expect(screen.getByTestId('display-mode-chart')).not.toBeDisabled();
    });

    it('adhoc 模式 hover tooltip 提示原因', () => {
      render(
        <Toolbar
          onRefresh={vi.fn()}
          onExportCsv={vi.fn()}
          onToggleDisplayMode={vi.fn()}
          queryMode="adhoc"
        />,
      );
      // tooltip 在 segmented wrapper 上
      const wrapper = screen.getByTestId('toolbar-toggle-display-mode');
      expect(wrapper).toHaveAttribute('title', expect.stringContaining('明细'));
    });
  });
});
