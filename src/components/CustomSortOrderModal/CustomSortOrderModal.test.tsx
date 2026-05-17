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

// 2026-05-18 加 HTML5 drag-and-drop reorder
// 语义:drop on target → source 占 target 槽位,target 被挤开
describe('CustomSortOrderModal — drag-and-drop reorder', () => {
  function mockDt() {
    return {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(),
    };
  }
  function dragAndDrop(srcEl: HTMLElement, destEl: HTMLElement) {
    const dt = mockDt();
    fireEvent.dragStart(srcEl, { dataTransfer: dt });
    fireEvent.dragOver(destEl, { dataTransfer: dt });
    fireEvent.drop(destEl, { dataTransfer: dt });
    fireEvent.dragEnd(srcEl, { dataTransfer: dt });
  }

  it('往下拖:item 0 → item 2 → [B, C, A](A 占 C 槽位,C 挤上去)', () => {
    const onApply = vi.fn();
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    dragAndDrop(
      screen.getByTestId('custom-sort-item-0'),
      screen.getByTestId('custom-sort-item-2'),
    );
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('B');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('C');
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('A');
    fireEvent.click(screen.getByTestId('custom-sort-apply'));
    expect(onApply).toHaveBeenCalledWith(['B', 'C', 'A']);
  });

  it('往上拖:item 2 → item 0 → [C, A, B](C 占 A 槽位)', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    dragAndDrop(
      screen.getByTestId('custom-sort-item-2'),
      screen.getByTestId('custom-sort-item-0'),
    );
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('C');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('A');
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('B');
  });

  it('drop 到自己上 → 顺序不变(no-op)', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    dragAndDrop(
      screen.getByTestId('custom-sort-item-1'),
      screen.getByTestId('custom-sort-item-1'),
    );
    expect(screen.getByTestId('custom-sort-item-0')).toHaveTextContent('A');
    expect(screen.getByTestId('custom-sort-item-1')).toHaveTextContent('B');
    expect(screen.getByTestId('custom-sort-item-2')).toHaveTextContent('C');
  });

  it('dragStart 标 data-dragging=true,dragEnd 清', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const src = screen.getByTestId('custom-sort-item-0');
    const dt = mockDt();
    fireEvent.dragStart(src, { dataTransfer: dt });
    expect(src.getAttribute('data-dragging')).toBe('true');
    fireEvent.dragEnd(src, { dataTransfer: dt });
    expect(src.getAttribute('data-dragging')).toBeNull();
  });

  it('dragOver target 标 data-drop-target=true;dragLeave 清', () => {
    render(
      <CustomSortOrderModal
        fieldName="region"
        initialMembers={['A', 'B', 'C']}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const src = screen.getByTestId('custom-sort-item-0');
    const dest = screen.getByTestId('custom-sort-item-2');
    const dt = mockDt();
    fireEvent.dragStart(src, { dataTransfer: dt });
    fireEvent.dragOver(dest, { dataTransfer: dt });
    expect(dest.getAttribute('data-drop-target')).toBe('true');
    fireEvent.dragLeave(dest);
    expect(dest.getAttribute('data-drop-target')).toBeNull();
  });
});
