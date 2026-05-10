/**
 * RangeGroupEditor — 范围分组编辑器（P2 §10.2）
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RangeGroupEditor } from './RangeGroupEditor.js';

describe('RangeGroupEditor', () => {
  it('renders 默认 2 个区间起手 + 字段选择', () => {
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('range-editor')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^range-editor-row-\d+$/)).toHaveLength(2);
  });

  it('编辑 row：min/max/label 改变 → 应用时校验通过', async () => {
    const onApply = vi.fn();
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('range-editor-name'), {
      target: { value: '年龄段' },
    });
    // 第 0 行：min=null, max=18, label="未成年"
    fireEvent.change(screen.getByTestId('range-editor-row-max-0'), {
      target: { value: '18' },
    });
    fireEvent.change(screen.getByTestId('range-editor-row-label-0'), {
      target: { value: '未成年' },
    });
    // 第 1 行:min=18, max=null, label="成年"
    fireEvent.change(screen.getByTestId('range-editor-row-min-1'), {
      target: { value: '18' },
    });
    fireEvent.change(screen.getByTestId('range-editor-row-label-1'), {
      target: { value: '成年' },
    });

    await userEvent.click(screen.getByTestId('range-editor-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const cf = onApply.mock.calls[0]![0];
    expect(cf.kind).toBe('range_group');
    expect(cf.name).toBe('年龄段');
    expect(cf.baseField).toBe('Age');
    expect(cf.ranges).toEqual([
      { min: null, max: 18, label: '未成年' },
      { min: 18, max: null, label: '成年' },
    ]);
  });

  it('"+ 添加区间" 增加一行', async () => {
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('range-editor-add'));
    expect(screen.getAllByTestId(/^range-editor-row-\d+$/)).toHaveLength(3);
  });

  it('删除一行（≥3 行时可删；剩 2 行时按钮 disabled）', async () => {
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('range-editor-add'));
    // 现在 3 行，删除第 0 行
    await userEvent.click(screen.getByTestId('range-editor-row-remove-0'));
    expect(screen.getAllByTestId(/^range-editor-row-\d+$/)).toHaveLength(2);
    // 剩 2 行 → remove 按钮 disabled
    expect(screen.getByTestId('range-editor-row-remove-0')).toBeDisabled();
    expect(screen.getByTestId('range-editor-row-remove-1')).toBeDisabled();
  });

  it('校验失败时 — 显示错误信息，不调 onApply', async () => {
    const onApply = vi.fn();
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('range-editor-name'), {
      target: { value: '坏配置' },
    });
    // 都不填 min/max → ranges 都是 null，校验会先卡在标签重复（默认 label 都空）
    await userEvent.click(screen.getByTestId('range-editor-apply'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByTestId('range-editor-error')).toBeInTheDocument();
  });

  it('取消 → onClose, 不调 onApply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <RangeGroupEditor
        baseField="Age"
        baseFieldAlias="年龄"
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByTestId('range-editor-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
