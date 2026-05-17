/**
 * parseExpression — 字段表达式 → AST (P2 §9)
 *
 * 文法（最小集，PRD 严格限定）：
 *   expr     := term (('+' | '-') term)*           // 左结合
 *   term     := factor (('*' | '/') factor)*        // 左结合
 *   factor   := num
 *             | field                              // [字段]
 *             | stringCall                         // SUBSTRING / LEFT / RIGHT / LENGTH / TRIM
 *             | '(' expr ')'
 *             | '-' factor                         // 一元负
 *
 * 词法：
 *   - NUMBER：整数或小数
 *   - FIELD：[xxx]（不含 ]）
 *   - IDENT：字母 + 字母/数字/下划线
 *   - 单字符 token：( ) , + - * /
 *   - 空白忽略
 *
 * 错误：lexer/parser 出错抛 Error，UI 层 catch 后 highlight。
 */

export type Expr =
  | { type: 'num'; value: number }
  | { type: 'field'; name: string }
  | { type: 'binop'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { type: 'strfn'; fn: StringFuncName; args: Expr[] }
  | { type: 'unary'; op: '-'; expr: Expr };

export type StringFuncName = 'SUBSTRING' | 'LEFT' | 'RIGHT' | 'LENGTH' | 'TRIM';

const STRING_FUNCS: Record<StringFuncName, number> = {
  SUBSTRING: 3,
  LEFT: 2,
  RIGHT: 2,
  LENGTH: 1,
  TRIM: 1,
};

type Token =
  | { type: 'num'; value: number }
  | { type: 'field'; name: string }
  | { type: 'ident'; name: string }
  | { type: 'punct'; value: '(' | ')' | ',' | '+' | '-' | '*' | '/' };

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i]!;
    // 空白
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // 数字
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < len && /[0-9.]/.test(source[j]!)) j++;
      const numStr = source.slice(i, j);
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        throw new Error(`非法数字 "${numStr}"`);
      }
      out.push({ type: 'num', value });
      i = j;
      continue;
    }
    // 字段引用 [xxx]
    if (ch === '[') {
      const close = source.indexOf(']', i + 1);
      if (close === -1) {
        throw new Error('字段引用未闭合（缺少 ]）');
      }
      const name = source.slice(i + 1, close);
      if (name.trim() === '') {
        throw new Error('空字段名 []');
      }
      out.push({ type: 'field', name });
      i = close + 1;
      continue;
    }
    // 标识符
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < len && /[A-Za-z0-9_]/.test(source[j]!)) j++;
      out.push({ type: 'ident', name: source.slice(i, j) });
      i = j;
      continue;
    }
    // 单字符 punct
    if ('(),+-*/'.includes(ch)) {
      out.push({ type: 'punct', value: ch as '(' });
      i++;
      continue;
    }
    throw new Error(`非法字符 "${ch}" at ${i}`);
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }
  private consume(): Token | null {
    return this.tokens[this.pos++] ?? null;
  }
  private expectPunct(p: '(' | ')' | ',' | '+' | '-' | '*' | '/'): void {
    const t = this.consume();
    if (!t || t.type !== 'punct' || t.value !== p) {
      throw new Error(`预期 "${p}"，实际 ${t ? this.tokenLabel(t) : 'EOF'}`);
    }
  }
  private tokenLabel(t: Token): string {
    if (t.type === 'punct') return `"${t.value}"`;
    if (t.type === 'num') return `数字 ${t.value}`;
    if (t.type === 'field') return `字段 [${t.name}]`;
    return `标识符 ${t.name}`;
  }

  /** 解析整个 expr,要求消费完所有 token */
  parseRoot(): Expr {
    if (this.tokens.length === 0) throw new Error('空表达式');
    const e = this.parseExpr();
    if (this.peek() !== null) {
      throw new Error(`多余的 token：${this.tokenLabel(this.peek()!)}`);
    }
    return e;
  }

  private parseExpr(): Expr {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (t && t.type === 'punct' && (t.value === '+' || t.value === '-')) {
        this.consume();
        const right = this.parseTerm();
        left = { type: 'binop', op: t.value, left, right };
      } else break;
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    while (true) {
      const t = this.peek();
      if (t && t.type === 'punct' && (t.value === '*' || t.value === '/')) {
        this.consume();
        const right = this.parseFactor();
        left = { type: 'binop', op: t.value, left, right };
      } else break;
    }
    return left;
  }

  private parseFactor(): Expr {
    const t = this.peek();
    if (!t) throw new Error('意外的表达式末尾');

    if (t.type === 'num') {
      this.consume();
      return { type: 'num', value: t.value };
    }
    if (t.type === 'field') {
      this.consume();
      return { type: 'field', name: t.name };
    }
    if (t.type === 'punct' && t.value === '(') {
      this.consume();
      const e = this.parseExpr();
      const close = this.peek();
      if (!close || close.type !== 'punct' || close.value !== ')') {
        throw new Error('括号未闭合');
      }
      this.consume();
      return e;
    }
    if (t.type === 'punct' && t.value === '-') {
      this.consume();
      const expr = this.parseFactor();
      return { type: 'unary', op: '-', expr };
    }
    if (t.type === 'ident') {
      this.consume();
      const upper = t.name.toUpperCase();
      if (!(upper in STRING_FUNCS)) {
        throw new Error(
          `未知函数 "${t.name}"（仅支持 SUBSTRING/LEFT/RIGHT/LENGTH/TRIM）`,
        );
      }
      this.expectPunct('(');
      const args: Expr[] = [];
      const close = this.peek();
      if (!close || close.type !== 'punct' || close.value !== ')') {
        while (true) {
          args.push(this.parseExpr());
          const sep = this.peek();
          if (sep && sep.type === 'punct' && sep.value === ',') {
            this.consume();
            continue;
          }
          break;
        }
      }
      this.expectPunct(')');
      const expected = STRING_FUNCS[upper as StringFuncName];
      if (args.length !== expected) {
        throw new Error(`${upper} 参数个数错误：需要 ${expected} 个，实际 ${args.length} 个`);
      }
      return {
        type: 'strfn',
        fn: upper as StringFuncName,
        args,
      };
    }
    throw new Error(`无法解析的 token：${this.tokenLabel(t)}`);
  }
}

export function parseExpression(source: string): Expr {
  if (source.trim() === '') {
    throw new Error('空表达式');
  }
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseRoot();
}
