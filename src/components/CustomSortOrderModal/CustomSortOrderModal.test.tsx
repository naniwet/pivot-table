/**
 * CustomSortOrderModal 测试 — 重点:
 *   - 初始用 currentOrder ⊎ initialMembers 合并保序
 *   - 上下移动 reorder
 *   - "确定" 回传新数组
 *   - "重置为字典序" 回传 null(caller 走 REMOVE)
 *   - "取消" 不调 onApply
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomSortOrderModal } from './CustomSortOrderModal.js';

describe('CustomSortOrderModal — 初始化', () => {
  it('无 currentOrder → 用 initialMembers 顺序', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['华东', '华南', '华北']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('华东');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('华南');
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('华北');
  });

  it('有 currentOrder → 用 currentOrder 顺序;initialMembers 多出来的 append', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['华东', '华南', '华北', '西南']}
        currentOrder={['华南', '华北']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // currentOrder 在前
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('华南');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('华北');
    // initialMembers 多出来的 append(华东 + 西南)
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('华东');
    expect(screen.getByTestId('custom-sort-item-3')).toHaveTextContent('西南');
  });

  it('empty initialMembers → 显示"当前页没有可见的成员"', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('custom-sort-empty')).toBeInTheDocument();
  });
});

describe('CustomSortOrderModal — 重排', () => {
  it('点上移 → 交换 idx 和 idx-1', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('custom-sort-up-1')); // B 上移
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('B');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('A');
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('C');
  });

  it('点下移 → 交换 idx 和 idx+1', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('custom-sort-down-0')); // A 下移
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('B');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('A');
  });

  it('第一项的上移按钮 disabled', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('custom-sort-up-0')).toBeDisabled();
  });

  it('最后一项的下移按钮 disabled', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('custom-sort-down-1')).toBeDisabled();
  });
});

describe('CustomSortOrderModal — 操作', () => {
  it('"确定" → onApply 收到当前 draft 数组', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('custom-sort-down-0')); // A 下移
    fireEvent.click(screen.getByTestId('custom-sort-apply'));
    expect(onApply).toHaveBeenCalledWith(['B', 'A', 'C']);
    expect(onClose).toHaveBeenCalled();
  });

  it('"重置为字典序" → onApply(null) → caller 走 REMOVE', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B']}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('custom-sort-reset'));
    expect(onApply).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('"取消" → 不调 onApply', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B']}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('custom-sort-cancel'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('空成员列表时 "确定" 按钮 disabled', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('custom-sort-apply')).toBeDisabled();
  });
});
