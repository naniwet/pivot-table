/**
 * astToMdx — AST → MDX 表达式字符串 (P2 §9)
 *
 * 翻译规则（按 PRD 描述 + 简单假设；联调后可能小调）：
 *   - field [x]              → [Measures].[resolveName(x)]
 *   - num                    → 字面量
 *   - binop A op B           → A op B（如果是顶层）；嵌套时给二元加括号保优先级
 *   - unary -e               → -mdx(e)
 *   - strfn                  → throw(字符串函数只支持 calc_column)
 *
 * **resolveName 的必要性(2026-05-16 用户澄清)**:
 *   - 用户在 editor 输入 `[销售额]`(中文 alias,用户感知友好)
 *   - 后端 MDX 必须用 measure name `销售额_m`(后端识别 id)
 *   - resolveName 把 alias → name(从 metadata 查 measure.alias→.name)
 *   - 不传 resolveName(向后兼容旧调用方)→ identity,name=用户输入字符串
 */
import type { Expr } from './parseExpression.js';

/** 顶层不加括号，binop/unary 进入子表达式时按需加 */
function emit(
  node: Expr,
  parenthesize: boolean,
  resolve: (alias: string) => string,
): string {
  switch (node.type) {
    case 'num':
      return String(node.value);
    case 'field':
      return `[Measures].[${resolve(node.name)}]`;
    case 'binop': {
      const inner = `${emit(node.left, true, resolve)} ${node.op} ${emit(node.right, true, resolve)}`;
      return parenthesize ? `(${inner})` : inner;
    }
    case 'unary':
      return `-${emit(node.expr, false, resolve)}`;
    case 'strfn':
      throw new Error(`字符串函数 ${node.fn} 仅支持计算列,不支持计算度量 MDX`);
  }
}

/**
 * @param resolveName 把 ast.field.name(alias 形式)解析为后端 measure name;
 *   不传 → identity(向后兼容老调用方;但 alias≠name 时会发错 MDX)
 */
export function astToMdx(
  ast: Expr,
  resolveName?: (alias: string) => string | null | undefined,
): string {
  const resolve = (alias: string): string => {
    if (!resolveName) return alias;
    const resolved = resolveName(alias);
    return resolved || alias; // resolver 没找到 → 用 alias 作 fallback
  };
  return emit(ast, false, resolve);
}
