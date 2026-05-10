/**
 * EnumGroupEditor — 枚举分组编辑器（P2 §10.1）
 *
 * 最小可用版本：成员列表 + 多选 → 加入指定组。
 * 不做高级 UX（拖拽归组、组重命名 inline 编辑）— 用按钮操作即可。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnumGroupEditor } from './EnumGroupEditor.js';

describe('EnumGroupEditor', () => {
  it('加载成员列表 + 显示在左侧"未分组"区', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['北京', '上海', '广州', '深圳']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('北京')).toBeInTheDocument());
    expect(screen.getByText('上海')).toBeInTheDocument();
    expect(screen.getByText('广州')).toBeInTheDocument();
  });

  it('选成员 + 创建新组 → 成员移到组里', async () => {
    const loadMembers = vi.fn().mockResolvedValue(['北京', '上海']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('北京')).toBeInTheDocument());
    // 勾选 "北京"
    fireEvent.click(screen.getByLabelText('北京'));
    // 输入新组名 + 创建
    fireEvent.change(screen.getByTestId('enum-editor-new-group-name'), {
      target: { value: '北方' },
    });
    fireEvent.click(screen.getByTestId('enum-editor-add-group'));
    // 北京应该出现在组 "北方" 下
    expect(screen.getByTestId('enum-editor-group-北方')).toHaveTextContent('北京');
    // 未分组里不再显示"北京"作为复选项
    expect(screen.queryByLabelText('北京')).not.toBeInTheDocument();
  });

  it('应用 → onApply 收到完整 CustomEnumGroupField', async () => {
    const onApply = vi.fn();
    const loadMembers = vi.fn().mockResolvedValue(['A', 'B']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    // 输入字段名
    fireEvent.change(screen.getByTestId('enum-editor-name'), {
      target: { value: '区域分组' },
    });
    fireEvent.click(screen.getByLabelText('A'));
    fireEvent.change(screen.getByTestId('enum-editor-new-group-name'), {
      target: { value: '组1' },
    });
    fireEvent.click(screen.getByTestId('enum-editor-add-group'));
    fireEvent.click(screen.getByTestId('enum-editor-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const cf = onApply.mock.calls[0]![0];
    expect(cf.kind).toBe('enum_group');
    expect(cf.name).toBe('区域分组');
    expect(cf.baseField).toBe('City');
    expect(cf.groups).toEqual([{ label: '组1', members: ['A'] }]);
  });

  it('校验：未填字段名 → 显示错误，不调 onApply', async () => {
    const onApply = vi.fn();
    const loadMembers = vi.fn().mockResolvedValue(['A']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('enum-editor-apply'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByTestId('enum-editor-error')).toBeInTheDocument();
  });

  it('未分组处理 切换 → onApply 透传 ungroupedHandling', async () => {
    const onApply = vi.fn();
    const loadMembers = vi.fn().mockResolvedValue(['A']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('enum-editor-name'), {
      target: { value: '组' },
    });
    // 添加一个组(留空成员或加 A)
    fireEvent.click(screen.getByLabelText('A'));
    fireEvent.change(screen.getByTestId('enum-editor-new-group-name'), {
      target: { value: '只有A' },
    });
    fireEvent.click(screen.getByTestId('enum-editor-add-group'));
    // 切换 ungroupedHandling
    const radio = screen.getByLabelText('归为"其他"组') as HTMLInputElement;
    fireEvent.click(radio);
    fireEvent.click(screen.getByTestId('enum-editor-apply'));
    const cf = onApply.mock.calls[0]![0];
    expect(cf.ungroupedHandling).toBe('merge_as_other');
  });

  it('取消 → onClose, 不调 onApply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const loadMembers = vi.fn().mockResolvedValue(['A']);
    render(
      <EnumGroupEditor
        baseField="City"
        baseFieldAlias="城市"
        loadMembers={loadMembers}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('enum-editor-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
