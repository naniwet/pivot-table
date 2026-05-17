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

  // 2026-05-17 测试瘦身:SUM/AVG 等聚合函数 → "未知函数" 报错由 core
  //   parseExpression.test.ts:154 用 for 循环覆盖了 5 个聚合函数,组件层不重复
  //   data-valid + error 的渲染 wiring 由"语法错误 → invalid"(L36)已证

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

  // 2026-05-16:"未知字段"降级 warning,不再 block save —— alias/name 不一致 +
  // dataset 刚加字段没刷 metadata 等情况下,前端不阻挡,让后端最终判断
  it('字段引用校验:[未知字段] 不在 metadata 列表里 → warning 提示,但不阻塞 apply', () => {
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
    // 状态仍 valid(AST 解析成功),但有 warning
    expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
      'data-valid',
      'true',
    );
    expect(screen.getByTestId('expr-editor-warn')).toHaveTextContent(/不存在的字段/);
    expect(screen.queryByTestId('expr-editor-error')).not.toBeInTheDocument();
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

    // 2026-05-17 测试瘦身:
    //   - calc_column SUM → "未知函数" 由 core parseExpression.test.ts:154 覆盖;
    //     apply 在 invalid 时不调的 wiring 由"未填字段名"(L70)已证(同 apply gate)
    //   - SUBSTRING AST 形状由 core parseExpression.test.ts:84 直接断言;
    //     "apply payload 含 ast + kind=calc_column" 由切换 kind toggle 用例(L126)覆盖
    //   两条都是组件层重复 core 的 parser 行为

    it('calc_measure 不支持字符串函数', () => {
      render(<FieldExpressionEditor onApply={vi.fn()} onClose={vi.fn()} />);
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: 'LEFT([产品名称], 2)' },
      });
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'false',
      );
      expect(screen.getByTestId('expr-editor-error')).toHaveTextContent(/字符串函数/);
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
      // 切到计算列后,只接受物理列名(2026-05-16:不在 availableColumns 改 warn 不 block)
      fireEvent.click(screen.getByTestId('expr-editor-kind-column'));
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[销售额_m] / [数量_m]' }, // measure 名 → 不在 availableColumns
      });
      // AST 解析成功 → data-valid='true';warn 提示而非 error
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'true',
      );
      expect(screen.getByTestId('expr-editor-warn')).toHaveTextContent(/销售额_m/);

      // 改成物理列名 → warn 消失
      fireEvent.change(screen.getByTestId('expr-editor-textarea'), {
        target: { value: '[销售额] / [数量]' },
      });
      expect(screen.getByTestId('expr-editor-status')).toHaveAttribute(
        'data-valid',
        'true',
      );
      expect(screen.queryByTestId('expr-editor-warn')).not.toBeInTheDocument();
    });

    it('编辑既有 calc_column → kind row 不渲染(类别由 initialField 决定,标题显示"编辑计算列")', () => {
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
      // 2026-05-16 重构:kind row 在"有 initialField 或 defaultKind"时不渲染
      // (类别已经定了,不让用户在 modal 里再切)
      expect(screen.queryByTestId('expr-editor-kind-row')).not.toBeInTheDocument();
      // 标题显示"编辑计算列"证明 kind 是 calc_column
      expect(screen.getByTestId('expr-editor').textContent).toContain('编辑计算列');
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
