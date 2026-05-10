/**
 * FieldExpressionEditor — 字段表达式编辑器 (P2 §9)
 *
 * 最小可用版本：textarea + 实时校验 + 应用。
 * 不做：插入字段下拉 / 插入函数下拉（YAGNI；用户直接输 [字段名] 和 SUM/AVG 等）
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FieldExpressionEditor } from './FieldExpressionEditor.js';

describe('FieldExpressionEditor', () => {
  it('合法表达式 → 应用回调收到 calc_measure', async () => {
    const onApply = vi.fn();
    render(<FieldExpressionEditor onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('expr-editor-name'), {
      target: { value: '利润率' },
    });
    fireEvent.change(screen.getByTestId('expr-editor-format'), {
      target: { value: '百分比' },
    });
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: '([销售额] - [成本]) / [销售额]' },
    });
    await userEvent.click(screen.getByTestId('expr-editor-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const cf = onApply.mock.calls[0]![0];
    expect(cf.kind).toBe('calc_measure');
    expect(cf.name).toBe('利润率');
    expect(cf.dataFormat).toBe('百分比');
    expect(cf.expression).toBe('([销售额] - [成本]) / [销售额]');
    expect(cf.ast).toBeDefined();
  });

  it('实时校验：非法表达式 → 显示错误标记 + 不可应用', () => {
    render(<FieldExpressionEditor onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: 'IF([A]>0, 1, 0)' },
    });
    expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
      'data-valid',
      'false',
    );
  });

  it('合法表达式 → 状态显示 valid', () => {
    render(<FieldExpressionEditor onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: '[A] + [B]' },
    });
    expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
      'data-valid',
      'true',
    );
  });

  it('未填字段名 → 不可应用', async () => {
    const onApply = vi.fn();
    render(<FieldExpressionEditor onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: '[A]' },
    });
    await userEvent.click(screen.getByTestId('expr-editor-apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('字段引用校验：[未知字段] 不在 metadata 列表里 → 错误提示', () => {
    render(
      <FieldExpressionEditor
        onApply={vi.fn()}
        onClose={vi.fn()}
        availableFields={['销售额', '成本']}
      />,
    );
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: '[销售额] - [不存在的字段]' },
    });
    expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
      'data-valid',
      'false',
    );
    expect(screen.getByTestId('expr-editor-error')).toHaveTextContent(/不存在的字段/);
  });

  it('availableFields 为空时 → 不做字段引用校验（向后兼容）', () => {
    render(<FieldExpressionEditor onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
      target: { value: '[任意字段名] + 1' },
    });
    expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
      'data-valid',
      'true',
    );
  });

  it('取消 → onClose, 不调 onApply', async () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(<FieldExpressionEditor onApply={onApply} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('expr-editor-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  // ============================================================
  // calc_column 模式 — P5 加,跟 calc_measure 共用编辑器(单选切换 kind)
  // ============================================================
  describe('calc_column kind toggle', () => {
    it('切到"计算列" → onApply 收到 kind=calc_column', async () => {
      const onApply = vi.fn();
      render(<FieldExpressionEditor onApply={onApply} onClose={vi.fn()} />);
      // 切到计算列
      fireEvent.click(screen.getByTestId('expr-editor-kind-column'));
      fireEvent.change(screen.getByTestId('expr-editor-name'), {
        target: { value: '均价' },
      });
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[销售额] / [数量]' },
      });
      await userEvent.click(screen.getByTestId('expr-editor-apply'));
      expect(onApply).toHaveBeenCalledTimes(1);
      const cf = onApply.mock.calls[0]![0];
      expect(cf.kind).toBe('calc_column');
      expect(cf.name).toBe('均价');
      expect(cf.expression).toBe('[销售额] / [数量]');
      expect(cf.ast).toBeDefined();
      expect(cf.id).toMatch(/^cc_/); // calc_column 用 cc 前缀
    });

    it('calc_column 含聚合函数 SUM(...) → 错误提示 + 不可应用', async () => {
      const onApply = vi.fn();
      render(<FieldExpressionEditor onApply={onApply} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('expr-editor-kind-column'));
      fireEvent.change(screen.getByTestId('expr-editor-name'), {
        target: { value: 'X' },
      });
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: 'SUM([销售额])' },
      });
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'false',
      );
      expect(screen.getByTestId('expr-editor-error')).toHaveTextContent(/聚合函数/);
      await userEvent.click(screen.getByTestId('expr-editor-apply'));
      expect(onApply).not.toHaveBeenCalled();
    });

    it('calc_column 引用校验 → 用 availableColumns(不是 availableFields)', () => {
      render(
        <FieldExpressionEditor
          onApply={vi.fn()}
          onClose={vi.fn()}
          // measure 名(用户视角):availableFields 给 calc_measure 用
          availableFields={['销售额_m', '数量_m']}
          // 物理列名:availableColumns 给 calc_column 用
          availableColumns={['销售额', '数量']}
        />,
      );
      // 切到计算列后,只接受物理列名
      fireEvent.click(screen.getByTestId('expr-editor-kind-column'));
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[销售额_m] / [数量_m]' }, // measure 名 → 不在 availableColumns
      });
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'false',
      );
      expect(screen.getByTestId('expr-editor-error')).toHaveTextContent(/销售额_m/);

      // 改成物理列名 → 通过
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[销售额] / [数量]' },
      });
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'true',
      );
    });

    it('编辑既有 calc_column → kind 锁定不能改(避免误改 schema 类别)', () => {
      render(
        <FieldExpressionEditor
          onApply={vi.fn()}
          onClose={vi.fn()}
          initialField={{
            id: 'cc_existing',
            name: '均价',
            kind: 'calc_column',
            dataFormat: '#,##0.00',
            expression: '[销售额] / [数量]',
            ast: {
              type: 'binop', op: '/',
              left: { type: 'field', name: '销售额' },
              right: { type: 'field', name: '数量' },
            },
          }}
        />,
      );
      // 进来就在 calc_column 模式
      expect(screen.getByTestId('expr-editor-kind-column')).toBeChecked();
      // kind 切换控件 disabled
      expect(screen.getByTestId('expr-editor-kind-column')).toBeDisabled();
      expect(screen.getByTestId('expr-editor-kind-measure')).toBeDisabled();
    });

    it('编辑既有 calc_column → onApply 输出 kind=calc_column(保留原 id)', async () => {
      const onApply = vi.fn();
      render(
        <FieldExpressionEditor
          onApply={onApply}
          onClose={vi.fn()}
          initialField={{
            id: 'cc_existing_42',
            name: '均价',
            kind: 'calc_column',
            dataFormat: '#,##0.00',
            expression: '[销售额] / [数量]',
            ast: {
              type: 'binop', op: '/',
              left: { type: 'field', name: '销售额' },
              right: { type: 'field', name: '数量' },
            },
          }}
        />,
      );
      // 改个名字然后保存
      fireEvent.change(screen.getByTestId('expr-editor-name'), {
        target: { value: '均价_新' },
      });
      await userEvent.click(screen.getByTestId('expr-editor-apply'));
      expect(onApply).toHaveBeenCalledTimes(1);
      const cf = onApply.mock.calls[0]![0];
      expect(cf.kind).toBe('calc_column');
      expect(cf.id).toBe('cc_existing_42'); // ← 保留原 id(更新而非新建)
      expect(cf.name).toBe('均价_新');
    });

    it('calc_column 模式不显示 MDX 预览(SQL 行级表达式不走 MDX 引擎)', () => {
      render(<FieldExpressionEditor onApply={vi.fn()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('expr-editor-kind-column'));
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[a] + [b]' },
      });
      // 不该有 MDX 预览(measure 模式才显示)
      expect(screen.queryByText(/MDX 预览/)).not.toBeInTheDocument();
    });
  });
});
