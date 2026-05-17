/**
 * SettingsModal 测试 —
 *   R1. open=false → 不渲染
 *   R2. open=true → 渲染所有设置项
 *   R3. 点关闭按钮 → onClose
 *   R4. 点 overlay backdrop → onClose
 *   R5. adhoc 模式 → 冻结行头/压缩/小计/树状等 disabled
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';

import { SettingsModal, type PanelVisibility } from './SettingsModal.js';

const defaultPanel: PanelVisibility = { toolbar: true, fieldPanel: true, fieldTree: true };

describe('SettingsModal', () => {
  it('R1: open=false → 不渲染', () => {
    const { container } = render(
      <SettingsModal
        open={false}
        onClose={vi.fn()}
        viewConfig={buildViewConfig()}
        dispatch={vi.fn()}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );
    expect(container.querySelector('[data-testid="settings-modal"]')).toBeNull();
  });

  it('R2: open=true → 渲染所有设置组', () => {
    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        viewConfig={buildViewConfig()}
        dispatch={vi.fn()}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    // 5 个 checkbox (freezeHeader / freezeRowHeader / compressEmptyRows / compressEmptyColumns / showTotalRowCount)
    expect(screen.getByTestId('settings-freezeHeader')).toBeInTheDocument();
    expect(screen.getByTestId('settings-freezeRowHeader')).toBeInTheDocument();
    expect(screen.getByTestId('settings-compressEmptyRows')).toBeInTheDocument();
    expect(screen.getByTestId('settings-compressEmptyColumns')).toBeInTheDocument();
    expect(screen.getByTestId('settings-showTotalRowCount')).toBeInTheDocument();
    // 全表总计 + 小计位置
    expect(screen.getByTestId('settings-showGrandTotal')).toBeInTheDocument();
    expect(screen.getByTestId('settings-subTotalAtEnd')).toBeInTheDocument();
    // 空值显示
    expect(screen.getByTestId('settings-emptyValueText')).toBeInTheDocument();
    // 翻页模式
    expect(screen.getByTestId('settings-paginationMode')).toBeInTheDocument();
    // 显示模式
    expect(screen.getByTestId('settings-displayMode')).toBeInTheDocument();
  });

  it('R3: 点关闭按钮 → onClose', () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={onClose}
        viewConfig={buildViewConfig()}
        dispatch={vi.fn()}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('R4: 点 overlay backdrop → onClose', () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={onClose}
        viewConfig={buildViewConfig()}
        dispatch={vi.fn()}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('R5: adhoc 模式 → 冻结行头/压缩空列/小计/树状 disabled', () => {
    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        viewConfig={buildViewConfig()}
        dispatch={vi.fn()}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={true}
      />,
    );
    // 冻结行头在 adhoc 下 disabled
    expect(screen.getByTestId('settings-freezeRowHeader').querySelector('input')).toBeDisabled();
    // 压缩空列在 adhoc 下 disabled
    expect(screen.getByTestId('settings-compressEmptyColumns').querySelector('input')).toBeDisabled();
    // 全表总计 disabled
    expect(screen.getByTestId('settings-showGrandTotal').querySelector('input')).toBeDisabled();
    // 树状模式 button disabled
    expect(screen.getByTestId('settings-mode-tree')).toBeDisabled();
  });

  it('check 切换 → dispatch SET_DISPLAY_OPTIONS', () => {
    const dispatch = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        viewConfig={buildViewConfig({ pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50, freezeHeader: false } })}
        dispatch={dispatch}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );
    // freezeHeader 当前是 false(unchecked)→ 点一下变成 true
    const cb = screen.getByTestId('settings-freezeHeader').querySelector('input')!;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DISPLAY_OPTIONS', freezeHeader: true });
  });

  it('空值显示使用组件化下拉并能选择预设', () => {
    const dispatch = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        viewConfig={buildViewConfig()}
        dispatch={dispatch}
        panelVisibility={defaultPanel}
        onTogglePanel={vi.fn()}
        isAdhoc={false}
      />,
    );

    const row = screen.getByTestId('settings-emptyValueText');
    expect(row.querySelector('select')).toBeNull();

    fireEvent.click(screen.getByTestId('settings-emptyValueText-trigger'));
    fireEvent.click(screen.getByRole('option', { name: '无数据' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_DISPLAY_OPTIONS',
      emptyValueText: '无数据',
    });
  });

  // 2026-05-16:"面板显示"行删了(冗余)— 工具栏/字段树各自的 × 已能收起,
  // panelVisibility / onTogglePanel props 仍在(向后兼容 hook caller),但 UI 不再渲染
});
