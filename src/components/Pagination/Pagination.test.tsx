/**
 * Pagination 组件测试
 *
 * 范围（P0，[phase-p0.md](../../../prd/phase-p0.md) §6）：
 *   - 仅行轴
 *   - 显示页号、当前/总页数
 *   - 上/下一页按钮（边界禁用）
 *   - 翻页时保留 viewConfig 其余状态由父组件保证（Pagination 只发 pageNo）
 *
 * 不在 P0 范围（不测）：
 *   - 列轴翻页（P1.0 多 measure）
 *   - 页大小可调（P1.0）
 *   - 跳转到指定页（P1.0）
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination.js';

describe('Pagination — display', () => {
  it('shows current/total page numbers', () => {
    render(
      <Pagination
        currentPage={2}
        pageSize={10}
        total={45}
        onPageChange={vi.fn()}
      />,
    );
    // 45 / 10 = 5 pages，当前第 2 页
    expect(screen.getByTestId('pagination-info')).toHaveTextContent(/2.*5/);
  });

  it('rounds totalPages up (45 / 10 = 5, not 4)', () => {
    render(
      <Pagination
        currentPage={1}
        pageSize={10}
        total={45}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('5');
  });

  it('renders nothing when totalPages <= 1 (no need to paginate)', () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        pageSize={50}
        total={3}
        onPageChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('Pagination — buttons', () => {
  it('disables prev on first page', () => {
    render(
      <Pagination
        currentPage={1}
        pageSize={10}
        total={45}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pagination-prev')).toBeDisabled();
    expect(screen.getByTestId('pagination-next')).not.toBeDisabled();
  });

  it('disables next on last page', () => {
    render(
      <Pagination
        currentPage={5}
        pageSize={10}
        total={45}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pagination-next')).toBeDisabled();
    expect(screen.getByTestId('pagination-prev')).not.toBeDisabled();
  });

  it('calls onPageChange(currentPage - 1) on prev', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={3}
        pageSize={10}
        total={45}
        onPageChange={onPageChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pagination-prev'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange(currentPage + 1) on next', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={3}
        pageSize={10}
        total={45}
        onPageChange={onPageChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pagination-next'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('does not call onPageChange when prev clicked at boundary', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        pageSize={10}
        total={45}
        onPageChange={onPageChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pagination-prev'));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
