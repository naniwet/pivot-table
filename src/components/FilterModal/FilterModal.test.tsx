/**
 * FilterModal — 高级条件 modal（P1.5）
 *
 * 范围（最小可用）：
 *   - 编辑指定字段的多条件嵌套（同字段 + 一层 group + 多 leaf）
 *   - 切换 op：And / Or
 *   - 添加 leaf / 删除 leaf
 *   - 关闭 / 应用
 *
 * 不在范围（避免 over-engineering）：
 *   - 跨字段嵌套（schema 复杂，translateFilters 也禁止 — 业务需求少）
 *   - 多层递归 group（一层够用，~95% 场景）
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { ClientFilter } from '../../types/viewConfig.js';

import { FilterModal } from './FilterModal.js';

const SALES = FIELD_IDS.salesMeasure;

describe('FilterModal', () => {
  it('renders existing leaf filter as one row', () => {
    const initial: ClientFilter = {
      kind: 'leaf',
      field: SALES,
      operator: 'GreaterThan',
      value: 100,
    };
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('filter-modal')).toBeInTheDocument();
    // 1 个条件行
    expect(screen.getAllByTestId(/^filter-modal-row-\d+$/)).toHaveLength(1);
    // 字段标题（用 alias）
    expect(screen.getByText(/销售额/)).toBeInTheDocument();
  });

  it('renders existing group filter as multiple rows + And/Or toggle', () => {
    const initial: ClientFilter = {
      kind: 'group',
      op: 'And',
      children: [
        { kind: 'leaf', field: SALES, operator: 'GreaterThanOrEqual', value: 100 },
        { kind: 'leaf', field: SALES, operator: 'LessThanOrEqual', value: 1000 },
      ],
    };
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId(/^filter-modal-row-\d+$/)).toHaveLength(2);
    // op 切换器默认 And
    expect(screen.getByTestId('filter-modal-op')).toHaveValue('And');
  });

  it('"+ 添加条件" 添加新 leaf 行', () => {
    render(
      <FilterModal
        field={SALES}
        initialFilter={{ kind: 'leaf', field: SALES, operator: 'GreaterThan', value: 100 }}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-modal-add'));
    expect(screen.getAllByTestId(/^filter-modal-row-\d+$/)).toHaveLength(2);
  });

  it('删除一行后 ≥1 行，删到只剩 1 行后再删按钮置灰（最后一行不可删）', () => {
    const initial: ClientFilter = {
      kind: 'group',
      op: 'And',
      children: [
        { kind: 'leaf', field: SALES, operator: 'GreaterThan', value: 1 },
        { kind: 'leaf', field: SALES, operator: 'LessThan', value: 100 },
      ],
    };
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // 删除第 0 行
    fireEvent.click(screen.getByTestId('filter-modal-row-remove-0'));
    expect(screen.getAllByTestId(/^filter-modal-row-\d+$/)).toHaveLength(1);
    // 只剩一行时删按钮 disabled
    expect(screen.getByTestId('filter-modal-row-remove-0')).toBeDisabled();
  });

  it('"应用" 把单行条件 → onApply 单个 leaf', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <FilterModal
        field={SALES}
        initialFilter={{ kind: 'leaf', field: SALES, operator: 'GreaterThan', value: 100 }}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      kind: 'leaf',
      field: SALES,
      operator: 'GreaterThan',
      value: 100,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('"应用" 把多行条件 → onApply group + And', () => {
    const initial: ClientFilter = {
      kind: 'group',
      op: 'And',
      children: [
        { kind: 'leaf', field: SALES, operator: 'GreaterThanOrEqual', value: 100 },
        { kind: 'leaf', field: SALES, operator: 'LessThanOrEqual', value: 1000 },
      ],
    };
    const onApply = vi.fn();
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith(initial);
  });

  it('切到 Or → onApply 携带 op:"Or"', () => {
    const initial: ClientFilter = {
      kind: 'group',
      op: 'And',
      children: [
        { kind: 'leaf', field: SALES, operator: 'Equals', value: 1 },
        { kind: 'leaf', field: SALES, operator: 'Equals', value: 2 },
      ],
    };
    const onApply = vi.fn();
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-modal-op'), { target: { value: 'Or' } });
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    expect(onApply.mock.calls[0]![0]).toMatchObject({ op: 'Or' });
  });

  it('通用模式 (P3 跨字段) — availableFields 多于 1 → 每行可选字段', async () => {
    const onApply = vi.fn();
    render(
      <FilterModal
        availableFields={[
          { name: 'A', alias: '字段 A', dataType: 'STRING' },
          { name: 'B', alias: '字段 B', dataType: 'DOUBLE' },
        ]}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    // 第 0 行字段下拉应该出现
    expect(screen.getByTestId('filter-modal-row-field-0')).toBeInTheDocument();
    // 默认选第一个 ('A')
    expect(screen.getByTestId('filter-modal-row-field-0')).toHaveValue('A');
    // 标题为通用模式
    expect(screen.getByText(/高级筛选\(跨字段\)/)).toBeInTheDocument();
  });

  it('通用模式跨字段 OR — 应用输出 group with mixed fields', async () => {
    const onApply = vi.fn();
    render(
      <FilterModal
        availableFields={[
          { name: 'province', alias: '省份', dataType: 'STRING' },
          { name: 'sales', alias: '销售额', dataType: 'DOUBLE' },
        ]}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    // 第 0 行: province + Equals + 江苏
    fireEvent.change(screen.getByTestId('filter-modal-row-val-0'), {
      target: { value: '江苏' },
    });
    // + 添加条件
    fireEvent.click(screen.getByTestId('filter-modal-add'));
    // 第 1 行: 切到 sales
    fireEvent.change(screen.getByTestId('filter-modal-row-field-1'), {
      target: { value: 'sales' },
    });
    fireEvent.change(screen.getByTestId('filter-modal-row-val-1'), {
      target: { value: '1000' },
    });
    // 切到 Or
    fireEvent.change(screen.getByTestId('filter-modal-op'), {
      target: { value: 'Or' },
    });
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    // 注意:default operator 是 'Equals',value 跟着 operator 解析
    expect(onApply).toHaveBeenCalledWith({
      kind: 'group',
      op: 'Or',
      children: [
        expect.objectContaining({ kind: 'leaf', field: 'province', value: '江苏' }),
        // sales 数值字段,value 解析为 number
        expect.objectContaining({ kind: 'leaf', field: 'sales', value: 1000 }),
      ],
    });
    // 关键:跨字段了 (province + sales)
  });

  it('通用模式 — 全部空 value → onApply 收到 null', () => {
    const onApply = vi.fn();
    render(
      <FilterModal
        availableFields={[{ name: 'A', alias: '字段 A', dataType: 'STRING' }]}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('"取消" 触发 onClose 不调 onApply', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <FilterModal
        field={SALES}
        initialFilter={{ kind: 'leaf', field: SALES, operator: 'GreaterThan', value: 1 }}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('编辑某行 operator + value → 应用后体现在 onApply', () => {
    const initial: ClientFilter = {
      kind: 'leaf',
      field: SALES,
      operator: 'GreaterThan',
      value: 100,
    };
    const onApply = vi.fn();
    render(
      <FilterModal
        field={SALES}
        initialFilter={initial}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId('filter-modal-row-0');
    fireEvent.change(within(row).getByTestId('filter-modal-row-op-0'), {
      target: { value: 'LessThan' },
    });
    fireEvent.change(within(row).getByTestId('filter-modal-row-val-0'), {
      target: { value: '999' },
    });
    fireEvent.click(screen.getByTestId('filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith({
      kind: 'leaf',
      field: SALES,
      operator: 'LessThan',
      value: 999,
    });
  });
});
