/**
 * MeasureFilterModal 测试 (P3)
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { MeasureFilterModal } from './MeasureFilterModal.js';

const measures = [
  { name: 'sales', alias: '销售额' },
  { name: 'profit', alias: '利润' },
];

describe('MeasureFilterModal', () => {
  it('initialFilter=null → 默认 1 行,默认操作符 GreaterThan', () => {
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('measure-filter-modal')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^measure-filter-modal-row-\d+$/)).toHaveLength(1);
    expect(screen.getByTestId('measure-filter-modal-row-op-0')).toHaveValue('GreaterThan');
    expect(screen.getByTestId('measure-filter-modal-row-measure-0')).toHaveValue('sales');
  });

  it('单行单度量 → onApply leaf', () => {
    const onApply = vi.fn();
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-val-0'), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByTestId('measure-filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith({
      kind: 'leaf',
      measureName: 'sales',
      operator: 'GreaterThan',
      value: 1000,
    });
  });

  it('跨度量 OR → onApply group with mixed measures', () => {
    const onApply = vi.fn();
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    // 行 0: sales > 10000
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-val-0'), {
      target: { value: '10000' },
    });
    // + 添加 行 1: profit > 5000
    fireEvent.click(screen.getByTestId('measure-filter-modal-add'));
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-measure-1'), {
      target: { value: 'profit' },
    });
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-val-1'), {
      target: { value: '5000' },
    });
    // 切 Or
    fireEvent.change(screen.getByTestId('measure-filter-modal-op'), {
      target: { value: 'Or' },
    });
    fireEvent.click(screen.getByTestId('measure-filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith({
      kind: 'group',
      op: 'Or',
      children: [
        expect.objectContaining({ measureName: 'sales', value: 10000 }),
        expect.objectContaining({ measureName: 'profit', value: 5000 }),
      ],
    });
  });

  it('Between operator → 显示 min/max 输入,onApply value=[min,max]', () => {
    const onApply = vi.fn();
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-op-0'), {
      target: { value: 'Between' },
    });
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-min-0'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByTestId('measure-filter-modal-row-max-0'), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByTestId('measure-filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith({
      kind: 'leaf',
      measureName: 'sales',
      operator: 'Between',
      value: [100, 1000],
    });
  });

  it('全空 → onApply(null)', () => {
    const onApply = vi.fn();
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('measure-filter-modal-apply'));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('initialFilter=group → 预填多行', () => {
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={{
          kind: 'group',
          op: 'Or',
          children: [
            { kind: 'leaf', measureName: 'sales', operator: 'GreaterThan', value: 10000 },
            { kind: 'leaf', measureName: 'profit', operator: 'LessThan', value: 100 },
          ],
        }}
        metadata={orderModelMetadata}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId(/^measure-filter-modal-row-\d+$/)).toHaveLength(2);
    expect(screen.getByTestId('measure-filter-modal-op')).toHaveValue('Or');
  });

  it('取消 → onClose,不调 onApply', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <MeasureFilterModal
        availableMeasures={measures}
        initialFilter={null}
        metadata={orderModelMetadata}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('measure-filter-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
