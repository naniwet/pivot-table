/**
 * MemberSelector — 成员选择器（P1.5）
 *
 * 用于 In/NotIn operator 的多选 value：弹出小面板，
 * 显示该字段的全部 distinct member，复选 + 搜索 + 应用。
 *
 * 设计（Unix + DDD）：
 *   - 组件无后端耦合：通过 DI prop `loadMembers: () => Promise<string[]>`
 *   - 加载状态 / 错误 / 重试由组件内部管
 *   - 搜索是前端过滤（不再发请求；distinct 集通常 < 1000）
 *
 * 不在范围（避免 over-engineering）：
 *   - 分页 / 虚拟滚动（distinct 集小，浏览器原生 overflow 即可）
 *   - 服务端搜索（distinct 集小）
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MemberSelector } from './MemberSelector.js';

describe('MemberSelector', () => {
  it('shows loading on mount and renders members after load', async () => {
    let resolveFn: (m: string[]) => void = () => {};
    const loadMembers = vi.fn(
      () =>
        new Promise<string[]>((r) => {
          resolveFn = r;
        }),
    );

    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('member-selector-loading')).toBeInTheDocument();

    resolveFn(['江苏', '浙江', '上海']);
    await waitFor(() =>
      expect(screen.queryByTestId('member-selector-loading')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('江苏')).toBeInTheDocument();
    expect(screen.getByText('浙江')).toBeInTheDocument();
    expect(screen.getByText('上海')).toBeInTheDocument();
  });

  it('shows error message + retry button when loadMembers throws', async () => {
    const loadMembers = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(['A', 'B']);
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('member-selector-error')).toHaveTextContent(/network down/),
    );
    fireEvent.click(screen.getByTestId('member-selector-retry'));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
  });

  it('initial selected items show as checked', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['江苏', '浙江', '上海']);
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={['江苏', '上海']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    expect(screen.getByLabelText('江苏')).toBeChecked();
    expect(screen.getByLabelText('浙江')).not.toBeChecked();
    expect(screen.getByLabelText('上海')).toBeChecked();
  });

  it('toggling checkbox + apply → onApply with selected names', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['江苏', '浙江', '上海']);
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('江苏'));
    fireEvent.click(screen.getByLabelText('上海'));
    fireEvent.click(screen.getByTestId('member-selector-apply'));
    expect(onApply).toHaveBeenCalledWith(['江苏', '上海']);
    expect(onClose).toHaveBeenCalled();
  });

  it('search filters members locally (case-insensitive substring)', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['江苏', '浙江', '上海', 'BeiJing']);
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('member-selector-search'), {
      target: { value: '江' },
    });
    expect(screen.getByText('江苏')).toBeInTheDocument();
    expect(screen.getByText('浙江')).toBeInTheDocument();
    expect(screen.queryByText('上海')).not.toBeInTheDocument();
    expect(screen.queryByText('BeiJing')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('member-selector-search'), {
      target: { value: 'beijing' },
    });
    expect(screen.getByText('BeiJing')).toBeInTheDocument();
  });

  it('cancel → onClose, not onApply', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['A']);
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('member-selector-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('select all / clear all 全选/反全选辅助按钮', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['A', 'B', 'C']);
    const onApply = vi.fn();
    render(
      <MemberSelector
        loadMembers={loadMembers}
        selected={[]}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('member-selector-select-all'));
    fireEvent.click(screen.getByTestId('member-selector-apply'));
    expect(onApply).toHaveBeenCalledWith(['A', 'B', 'C']);
  });
});
