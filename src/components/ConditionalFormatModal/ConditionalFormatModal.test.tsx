/**
 * ConditionalFormatModal — 条件格式化 modal 测试
 *
 * 范围:
 *   - 增/改/删 rule + condition 的草稿 state 变化
 *   - apply 回调拿到正确 rules 数组
 *   - cancel 不调 apply
 *   - threshold / dataBar 各自的字段绑定
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import { ConditionalFormatModal } from './ConditionalFormatModal.js';

const sales = 'sales';

describe('ConditionalFormatModal — 基础渲染', () => {
  it('空 rules → 显示 empty 提示', () => {
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cond-fmt-empty')).toBeInTheDocument();
  });

  it('measureAlias 显示在标题里', () => {
    render(
      <ConditionalFormatModal
        measure={sales}
        measureAlias="销售额"
        rules={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/销售额/)).toBeInTheDocument();
  });

  it('已有 rules → 渲染对应数量的 rule editor', () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: sales, kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: { bg: '#f00' } }],
      },
      {
        id: 'r2', measure: sales, kind: 'dataBar',
        color: '#00f', range: 'auto',
      },
    ];
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={rules}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('rule-r1')).toBeInTheDocument();
    expect(screen.getByTestId('rule-r2')).toBeInTheDocument();
  });
});

describe('ConditionalFormatModal — 增 rule', () => {
  it('点 "+ 阈值规则" → draft 加一条 threshold,默认 1 个 condition(gt 0)', async () => {
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={[]}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('cond-fmt-add-threshold'));
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('threshold');
    expect(out[0]!.measure).toBe(sales);
    if (out[0]!.kind === 'threshold') {
      expect(out[0]!.conditions).toHaveLength(1);
      expect(out[0]!.conditions[0]!.op).toBe('gt');
      expect(out[0]!.conditions[0]!.value).toBe(0);
    }
  });

  it('点 "+ 数据条" → draft 加一条 dataBar,默认 range=auto', async () => {
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={[]}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('cond-fmt-add-databar'));
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('dataBar');
    if (out[0]!.kind === 'dataBar') {
      expect(out[0]!.range).toBe('auto');
    }
  });
});

describe('ConditionalFormatModal — 改 rule', () => {
  it('改 condition value → apply 后 rules 反映新值', async () => {
    const initial: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: sales, kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: { bg: '#f00' } }],
      },
    ];
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    const valueInput = screen.getByTestId('cond-row-value');
    fireEvent.change(valueInput, { target: { value: '200' } });
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    if (out[0]!.kind === 'threshold') {
      expect(out[0]!.conditions[0]!.value).toBe(200);
    }
  });

  it('切 op 到 between → value 变 [min, max]', async () => {
    const initial: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: sales, kind: 'threshold',
        conditions: [{ op: 'gt', value: 100, style: {} }],
      },
    ];
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    const opSelect = screen.getByTestId('cond-row-op');
    fireEvent.change(opSelect, { target: { value: 'between' } });
    // 现在应该看到两个数值输入
    expect(screen.getByTestId('cond-row-value-min')).toBeInTheDocument();
    expect(screen.getByTestId('cond-row-value-max')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cond-row-value-min'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('cond-row-value-max'), { target: { value: '50' } });
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    if (out[0]!.kind === 'threshold') {
      expect(out[0]!.conditions[0]!.op).toBe('between');
      expect(out[0]!.conditions[0]!.value).toEqual([10, 50]);
    }
  });

  it('dataBar range 切到固定值 → 出现 min/max 输入', async () => {
    const initial: ConditionalFormatRule[] = [
      { id: 'r1', measure: sales, kind: 'dataBar', color: '#00f', range: 'auto' },
    ];
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('databar-range-mode'), { target: { value: 'fixed' } });
    expect(screen.getByTestId('databar-min')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('databar-min'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('databar-max'), { target: { value: '1000' } });
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    if (out[0]!.kind === 'dataBar') {
      expect(out[0]!.range).toEqual({ min: 0, max: 1000 });
    }
  });
});

describe('ConditionalFormatModal — 删 rule / condition', () => {
  it('点 rule × → apply 后 rules 不含该 rule', async () => {
    const initial: ConditionalFormatRule[] = [
      { id: 'r1', measure: sales, kind: 'dataBar', color: '#00f', range: 'auto' },
      { id: 'r2', measure: sales, kind: 'dataBar', color: '#0f0', range: 'auto' },
    ];
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('rule-remove-r1'));
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('r2');
  });

  it('单 condition rule 不显示删条件按钮(canRemove=false 时)', () => {
    const initial: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: sales, kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: {} }],
      },
    ];
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // 单条件时 cond-row-remove 不渲染
    expect(screen.queryByTestId('cond-row-remove')).not.toBeInTheDocument();
  });

  it('多 condition 后能删,删到剩 1 条又隐藏', async () => {
    const initial: ConditionalFormatRule[] = [
      {
        id: 'r1', measure: sales, kind: 'threshold',
        conditions: [
          { op: 'gt', value: 100, style: {} },
          { op: 'lt', value: 0, style: {} },
        ],
      },
    ];
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={initial}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    const removeBtns = screen.getAllByTestId('cond-row-remove');
    expect(removeBtns).toHaveLength(2);
    await userEvent.setup().click(removeBtns[0]!);
    expect(screen.queryAllByTestId('cond-row-remove')).toHaveLength(0);
    await userEvent.setup().click(screen.getByTestId('cond-fmt-apply'));
    const out = onApply.mock.calls[0]![0] as ConditionalFormatRule[];
    if (out[0]!.kind === 'threshold') {
      expect(out[0]!.conditions).toHaveLength(1);
      expect(out[0]!.conditions[0]!.op).toBe('lt');
    }
  });
});

describe('ConditionalFormatModal — cancel / close', () => {
  it('cancel → onClose 调,onApply 不调', async () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={[]}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('cond-fmt-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('改了 draft 后 cancel → 外部 rules 不受影响(由 onApply 不调侧面验证)', async () => {
    const onApply = vi.fn();
    render(
      <ConditionalFormatModal
        measure={sales}
        rules={[]}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('cond-fmt-add-threshold'));
    await userEvent.setup().click(screen.getByTestId('cond-fmt-cancel'));
    expect(onApply).not.toHaveBeenCalled();
  });
});
