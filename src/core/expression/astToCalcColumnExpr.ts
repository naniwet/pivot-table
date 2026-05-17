/**
 * astToCalcColumnExpr — AST → CalcColumn.expr 字符串 (P5)
 *
 * **跟 astToMdx 区别:**
 *   - astToMdx:`[Measures].[x]` 风格;表达式在 MDX 度量引擎跑(SUM(a)/SUM(b))
 *   - astToCalcColumnExpr:`[x]` 风格(物理列名);表达式在 SQL 行级跑(a/b 每行)
 *
 * 翻译规则:
 *   - field [m_name]  → [field_name]   (resolveColumnName 把 measure name 翻成物理列名)
 *   - num             → 字面量
 *   - binop A op B    → 嵌套时加括号
 *   - unary -e        → -mdx(e)
 *   - strfn           → SUBSTRING/LEFT/RIGHT/LENGTH/TRIM(...)
 *
 * 2026-05-07 probe(scripts/probe-calc-column.ts)实测验证:
 *   - 物理列名形态 `[销售成本]/[销售额]` 后端接受 ✓
 *   - measure name 形态 `[销售成本_m]/[销售额_m]` 后端报"列不存在" ✗
 *   故 resolveColumnName 是必需(不能复用 astToMdx 简单字符串)
 */
import type { Expr } from './parseExpression.js';

/**
 * 把 AST 翻成 CalcColumn 行级 expr。
 *
 * @param ast 表达式 AST
 * @param resolveColumnName 把 AST 里 [name] 引用的 measure name 解析成物理列名
 *   (调用方从 metadata.measures + metadata.fields 查表得出)
 * @throws Error 当 AST 含 agg() 节点(行级表达式不该用聚合);
 *               当 resolveColumnName 返回 null/undefined(measure 找不到对应物理列)
 */
export function astToCalcColumnExpr(
  ast: Expr,
  resolveColumnName: (measureName: string) => string | null | undefined,
): string {
  return emit(ast, false, resolveColumnName);
}

function emit(
  node: Expr,
  parenthesize: boolean,
  resolve: (n: string) => string | null | undefined,
): string {
  switch (node.type) {
    case 'num':
      return String(node.value);
    case 'field': {
      const col = resolve(node.name);
      if (!col) {
        throw new Error(
          `calc_column 表达式引用的 measure "${node.name}" 找不到对应物理列(refDataSetFieldId 解析失败)`,
        );
      }
      return `[${col}]`;
    }
    case 'binop': {
      const inner = `${emit(node.left, true, resolve)} ${node.op} ${emit(node.right, true, resolve)}`;
      return parenthesize ? `(${inner})` : inner;
    }
    case 'unary':
      return `-${emit(node.expr, false, resolve)}`;
    case 'strfn':
      return `${node.fn}(${node.args.map((arg) => emit(arg, false, resolve)).join(', ')})`;
  }
}
