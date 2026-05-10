/**
 * astToMdx — AST → MDX 表达式字符串 (P2 §9)
 *
 * 翻译规则（按 PRD 描述 + 简单假设；联调后可能小调）：
 *   - field [x]              → [Measures].[x]
 *   - num                    → 字面量
 *   - binop A op B           → A op B（如果是顶层）；嵌套时给二元加括号保优先级
 *   - agg SUM/AVG/COUNT/MAX/MIN(arg) → Sum/Avg/Count/Max/Min({...}, mdx(arg))
 *     ({...} 是 set 占位，后端会用查询轴的成员集替换)
 *   - unary -e               → -mdx(e)
 *
 * 后端 MDX 形态待联调（PRD 阻塞项 8）；本模块按合理假设实现。
 */
import type { Expr } from './parseExpression.js';

const AGG_MAP: Record<string, string> = {
  SUM: 'Sum',
  AVG: 'Avg',
  COUNT: 'Count',
  MAX: 'Max',
  MIN: 'Min',
};

/** 顶层不加括号，binop/unary 进入子表达式时按需加 */
function emit(node: Expr, parenthesize: boolean): string {
  switch (node.type) {
    case 'num':
      return String(node.value);
    case 'field':
      return `[Measures].[${node.name}]`;
    case 'binop': {
      const inner = `${emit(node.left, true)} ${node.op} ${emit(node.right, true)}`;
      return parenthesize ? `(${inner})` : inner;
    }
    case 'agg':
      return `${AGG_MAP[node.fn]}({...}, ${emit(node.arg, false)})`;
    case 'unary':
      return `-${emit(node.expr, false)}`;
  }
}

export function astToMdx(ast: Expr): string {
  return emit(ast, false);
}
