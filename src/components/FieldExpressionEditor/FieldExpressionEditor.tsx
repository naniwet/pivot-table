/**
 * FieldExpressionEditor — 字段表达式编辑器 (P2 §9 + P5 calc_column)
 *
 * 支持两种 kind:
 *   - calc_measure(MDX 度量级)— 表达式引用 measure name(`[销售额_m]/[销售成本_m]`)
 *     语义 = SUM(a)/SUM(b);后端 1 个 CustomCalcMeasure。
 *   - calc_column(SQL 行级计算列)— 表达式引用物理列名(`[销售额]/[数量]`)
 *     语义 = 行级 a/b 列;后端 CustomColumn(CalcColumn) + CustomDimension(作维度用)。
 *     想做"对均价再求和/平均",右键 chip → 转度量(独立机制)。
 *
 * 实时校验:
 *   - AST 解析:每次输入 parse 一次(<200 chars 性能可忽略)
 *   - 引用校验:calc_measure 用 availableMeasures,calc_column 用 availableColumns;
 *     不传对应列表则跳过校验(用户自负)
 *   - 校验通过才能"确定"
 *
 * 不做(YAGNI):
 *   - 插入字段下拉 / 插入函数下拉(用户直接打字)
 *   - 表达式 lint / 性能提示
 *   - 表达式版本历史
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { astToMdx } from '../../core/expression/astToMdx.js';
import { parseExpression, type Expr } from '../../core/expression/parseExpression.js';
import type {
  CustomCalcColumnField,
  CustomCalcMeasureField,
} from '../../types/viewConfig.js';

/**
 * 编辑器接受 / 输出的字段 union。
 * 调用方传 initialField(无时是新建)→ apply 出对应 kind 的字段。
 */
export type ExpressionField = CustomCalcMeasureField | CustomCalcColumnField;

export interface FieldExpressionEditorProps {
  /**
   * @deprecated 用 availableMeasures + availableColumns 替代。保留是为了兼容旧调用方;
   * 当前实现:availableFields 当 calc_measure 模式的引用校验用(保留以避免破坏旧测试)
   */
  availableFields?: string[];
  /** calc_measure 模式下的合法 [字段] 引用(即 measure 字段名);不传则跳过校验 */
  availableMeasures?: string[];
  /** calc_column 模式下的合法 [字段] 引用(即物理列名);不传则跳过校验 */
  availableColumns?: string[];
  initialField?: ExpressionField;
  onApply: (field: ExpressionField) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

const COMMON_FORMATS = [
  '通用',
  '百分比',
  '百分比-保留一位小数',
  '千分位',
  '货币 ¥',
  '日期 yyyy-MM-dd',
];

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 收集 AST 里所有 field 引用 */
function collectFieldRefs(node: Expr, out: Set<string>): void {
  switch (node.type) {
    case 'field':
      out.add(node.name);
      return;
    case 'binop':
      collectFieldRefs(node.left, out);
      collectFieldRefs(node.right, out);
      return;
    case 'agg':
      collectFieldRefs(node.arg, out);
      return;
    case 'unary':
      collectFieldRefs(node.expr, out);
      return;
    case 'num':
      return;
  }
}

interface ParseState {
  ast: Expr | null;
  error: string | null;
  unknownRefs: string[];
}

function validate(source: string, available?: string[]): ParseState {
  if (source.trim() === '') {
    return { ast: null, error: null, unknownRefs: [] };
  }
  let ast: Expr;
  try {
    ast = parseExpression(source);
  } catch (e) {
    return {
      ast: null,
      error: e instanceof Error ? e.message : String(e),
      unknownRefs: [],
    };
  }
  if (available && available.length > 0) {
    const refs = new Set<string>();
    collectFieldRefs(ast, refs);
    const unknown = Array.from(refs).filter((r) => !available.includes(r));
    if (unknown.length > 0) {
      return {
        ast,
        error: `字段 [${unknown.join('], [')}] 不在 metadata 中`,
        unknownRefs: unknown,
      };
    }
  }
  return { ast, error: null, unknownRefs: [] };
}

export function FieldExpressionEditor({
  availableFields,
  availableMeasures,
  availableColumns,
  initialField,
  onApply,
  onClose,
  className,
  style,
}: FieldExpressionEditorProps): ReactNode {
  // initialField 推断 kind:有就用它的,否则默认 calc_measure(向后兼容旧入口)
  const [kind, setKind] = useState<ExpressionField['kind']>(
    initialField?.kind ?? 'calc_measure',
  );
  const [name, setName] = useState(initialField?.name ?? '');
  const [dataFormat, setDataFormat] = useState(initialField?.dataFormat ?? '通用');
  const [expression, setExpression] = useState(initialField?.expression ?? '');

  // 引用校验列表按 kind 切:
  //   calc_measure → availableMeasures(优先) ?? availableFields(兼容旧 prop)
  //   calc_column  → availableColumns
  const referenceList =
    kind === 'calc_measure'
      ? (availableMeasures ?? availableFields)
      : availableColumns;

  const parsed = useMemo(
    () => validate(expression, referenceList),
    [expression, referenceList],
  );
  const isValid = parsed.ast !== null && parsed.error === null;
  const isEmpty = expression.trim() === '';
  // MDX 预览仅 calc_measure 有意义(calc_column 是 SQL 行级,不走 MDX 引擎)
  const mdxPreview = useMemo(
    () => (parsed.ast && kind === 'calc_measure' ? astToMdx(parsed.ast) : ''),
    [parsed.ast, kind],
  );

  // calc_column 不允许聚合函数(行级表达式无聚合上下文)
  const hasAgg = parsed.ast ? containsAgg(parsed.ast) : false;
  const aggRejected = kind === 'calc_column' && hasAgg;

  const apply = () => {
    if (!name.trim() || !isValid || isEmpty || aggRejected) return;
    if (kind === 'calc_measure') {
      const cf: CustomCalcMeasureField = {
        id: initialField?.id ?? genId('cm'),
        name: name.trim(),
        kind: 'calc_measure',
        dataFormat,
        expression,
        ast: parsed.ast,
      };
      onApply(cf);
    } else {
      const cf: CustomCalcColumnField = {
        id: initialField?.id ?? genId('cc'),
        name: name.trim(),
        kind: 'calc_column',
        dataFormat,
        expression,
        ast: parsed.ast,
      };
      onApply(cf);
    }
    onClose();
  };

  const canApply = name.trim() !== '' && isValid && !isEmpty && !aggRejected;
  const isEditingExisting = !!initialField;

  return (
    <div
      className={className ? `expr-editor-overlay ${className}` : 'expr-editor-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="expr-editor"
      style={style}
    >
      <div className="expr-editor">
        <div className="expr-editor__header">
          <span className="expr-editor__title">
            {isEditingExisting
              ? kind === 'calc_measure'
                ? '编辑计算度量'
                : '编辑计算列'
              : kind === 'calc_measure'
                ? '新建计算度量'
                : '新建计算列'}
          </span>
        </div>
        {/* kind 切换 — 编辑已有字段时锁住(避免误改 schema 类别) */}
        <div className="expr-editor__row" data-testid="expr-editor-kind-row">
          <label>类别</label>
          <div className="expr-editor__kind-group" role="radiogroup">
            <label className="expr-editor__kind-option">
              <input
                type="radio"
                data-testid="expr-editor-kind-measure"
                name="expr-editor-kind"
                value="calc_measure"
                checked={kind === 'calc_measure'}
                disabled={isEditingExisting}
                onChange={() => setKind('calc_measure')}
              />
              计算度量(MDX 聚合后)
            </label>
            <label className="expr-editor__kind-option">
              <input
                type="radio"
                data-testid="expr-editor-kind-column"
                name="expr-editor-kind"
                value="calc_column"
                checked={kind === 'calc_column'}
                disabled={isEditingExisting}
                onChange={() => setKind('calc_column')}
              />
              计算列(SQL 行级)
            </label>
          </div>
        </div>
        <div className="expr-editor__row">
          <label>字段名称</label>
          <input
            type="text"
            data-testid="expr-editor-name"
            placeholder={kind === 'calc_measure' ? '例如:利润率' : '例如:均价'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="expr-editor__row">
          <label>数据格式</label>
          <select
            data-testid="expr-editor-format"
            value={dataFormat}
            onChange={(e) => setDataFormat(e.target.value)}
          >
            {COMMON_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="expr-editor__row">
          <label>表达式</label>
          <textarea
            data-testid="expr-editor-textarea"
            rows={4}
            placeholder={
              kind === 'calc_measure'
                ? '例如:([销售额] - [成本]) / [销售额](引用 measure)'
                : '例如:[销售额] / [数量](引用物理列)'
            }
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
          />
        </div>
        <div className="expr-editor__hint">
          {kind === 'calc_measure'
            ? '支持:[度量] / 数字 / + - * / / 括号 / SUM AVG COUNT MAX MIN'
            : '支持:[物理列] / 数字 / + - * / / 括号(行级,不能用聚合函数)'}
        </div>
        <div
          className="expr-editor__status"
          data-testid="expr-editor-status"
          data-valid={isValid && !isEmpty && !aggRejected ? 'true' : 'false'}
        >
          {isEmpty ? (
            <span className="expr-editor__status--idle">请输入表达式</span>
          ) : aggRejected ? (
            <span
              className="expr-editor__status--err"
              data-testid="expr-editor-error"
            >
              ✗ 计算列不能用聚合函数(SUM/AVG/...);要聚合请用计算度量
            </span>
          ) : isValid ? (
            <>
              <span className="expr-editor__status--ok">✓ 表达式有效</span>
              {mdxPreview && (
                <details className="expr-editor__mdx-preview">
                  <summary>MDX 预览(联调用)</summary>
                  <pre>{mdxPreview}</pre>
                </details>
              )}
            </>
          ) : (
            <span
              className="expr-editor__status--err"
              data-testid="expr-editor-error"
            >
              ✗ {parsed.error}
            </span>
          )}
        </div>
        <div className="expr-editor__footer">
          <button
            type="button"
            className="expr-editor__cancel"
            data-testid="expr-editor-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="expr-editor__apply"
            data-testid="expr-editor-apply"
            disabled={!canApply}
            onClick={apply}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

/** AST 是否含 agg() 节点 */
function containsAgg(node: Expr): boolean {
  switch (node.type) {
    case 'agg':
      return true;
    case 'binop':
      return containsAgg(node.left) || containsAgg(node.right);
    case 'unary':
      return containsAgg(node.expr);
    case 'field':
    case 'num':
      return false;
  }
}
