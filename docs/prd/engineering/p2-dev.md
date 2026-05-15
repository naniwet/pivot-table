# P2 开发与测试设计

> **📍 实施状态**：✅ **已交付**，且**超出 PRD 范围**：
> - 字段表达式 ✅（`core/expression/parseExpression.ts` + `astToMdx.ts`）— ADR-007 chevrotain 实际换为手写递归下降 parser，bundle 更小
> - 维度分组 ✅ enum + range（`components/EnumGroupEditor/` + `components/RangeGroupEditor/`，按 ADR-010 独立实现）
> - 时间智能 ✅（`core/timeAxis/detectTimeAxis.ts`）
> - **多做的 2 种自建字段**：`calc_column`（行级计算字段）+ `dim_as_measure`（维度当度量用）
> - 维度成员加载 ✅（`buildMemberQuery.ts`，`probe-metadata-level-lookup.ts` 锁定）

> 实现 [phase-p2.md](../phase-p2.md) 定义的 P2。
> 沿用 P0/P1 建立的 TDD 节奏与文件结构。
> **本文件仅描述增量**。

| 字段 | 内容 |
|---|---|
| 估时 | 3 工程师 × 6-7 周 |
| 关键产出 | 时间智能 quickCalc、字段表达式编辑器、维度分组（枚举 + 范围） |

---

## 1. 关键架构决策（ADR）

### ADR-007：字段表达式 Parser 选 chevrotain（vs nearley/peggy/手写）

**Status**: Proposed
**Decider**: Frontend Tech Lead

**Context**

P2 字段表达式需要解析用户输入的 `([销售额] - [成本]) / [销售额]` 这种表达式，输出 AST，再翻译为 MDX 字符串。需要选择 parser 实现方式。

**Options**

| 选项 | 优点 | 缺点 |
|---|---|---|
| A. **chevrotain**（选定） | 性能好、错误信息丰富、支持增量 lex、TS 友好 | bundle 大约 80kb（gzip） |
| B. nearley | 文法声明清晰 | 性能弱、错误信息差 |
| C. peggy（PEG.js fork） | 学习曲线低 | bundle 大、定制错误信息难 |
| D. 手写递归下降 | 0 依赖、性能极高 | 维护成本高、错误信息要自己写 |

**Decision**

选 **chevrotain**。理由：

1. 字段表达式语法虽小但需要良好错误信息（实时校验需要"在 [销售 处缺少 ] 闭合"这种精确提示）
2. chevrotain 的 lexer/parser 分离设计支持只 lex 不 parse 做语法高亮
3. 80kb 仅在 P2 引入，组件总体 bundle 控制在 < 200kb（gzip）目标内
4. TypeScript 类型生成完善，AST 节点类型安全

**Trade-off**

| 维度 | 评估 |
|---|---|
| 性能 | 高（chevrotain benchmark 接近手写） |
| 错误信息 | 优 |
| Bundle 大小 | 中（80kb gzip） |
| 学习曲线 | 中（DSL 设计 + chevrotain API） |

**反悔成本**：改起来痛但可行。Parser 是封闭模块，外部仅暴露 `parse(text) => Result<AST, ParseError>` 和 `translate(ast) => MDXString`。

---

### ADR-009：表达式 AST 节点类型定义为可辨识联合（discriminated union）

**Status**: Proposed

**Context**

AST 节点类型多样（BinaryOp / FieldRef / Aggregate / NumberLiteral / Negation 等）。

**Decision**

```typescript
// core/expressionParser/ast.ts
export type AstNode =
  | { kind: 'BinaryOp'; op: '+' | '-' | '*' | '/'; left: AstNode; right: AstNode }
  | { kind: 'Aggregate'; func: 'SUM' | 'AVG' | 'COUNT' | 'MAX' | 'MIN'; arg: FieldRef }
  | { kind: 'FieldRef'; alias: string }
  | { kind: 'Number'; value: number }
  | { kind: 'Negation'; operand: AstNode };

export type FieldRef = Extract<AstNode, { kind: 'FieldRef' }>;
```

**理由**：discriminated union 让 TypeScript 在 switch/match 时做穷尽性检查，新增节点类型时编译期发现所有需要更新的地方。

---

### ADR-010：维度分组的两个编辑器**不共享抽象**

**Status**: Proposed

**Context**

EnumGroup 和 RangeGroup 数据形态、UI 完全不同。诱惑：抽个 `BaseGroupEditor` 复用。

**Decision**

**禁止**抽公共基类。两个编辑器（`EnumGroupEditor` / `RangeGroupEditor`）独立实现，独立 props 接口，独立测试。

**理由**

- 按 PRD `phase-p2.md` 第 10 节明确警告："两者完全独立，不要试图复用同一套抽象"
- Unix 哲学：3 处重复才抽，2 处复制粘贴
- 两个编辑器的 UI 复杂度都不大（各 ~200 行），抽象成本 > 复用收益

**Consequences**

- ✅ 各自演进互不影响
- ⚠️ 如果未来有第三种分组（如动态分组），届时再评估抽象

---

## 2. 模块增量

### 2.1 拖拽规则更新

```typescript
export const DROP_RULES = {
  // ... 既有
  UserCalcMeasure: { row: false, column: false, value: true,  filter: false },
  EnumGroup:       { row: true,  column: true,  value: false, filter: true  },
  RangeGroup:      { row: true,  column: true,  value: false, filter: true  },
};
```

仅加表行，主代码不动。

---

### 2.2 时间智能 QuickCalc

> **为何延 P2 而非 P1.0？**
> P1.0 的 5 个 quickCalc 不依赖时间维度，加 quickCalc 字段开关到 query 即可（QuickCalcMenu 框架已建好）。
> 时间智能 4 个 quickCalc 看似类似，但每个都需要 `dateDimension` + `dateLevel` + `offset` 三个参数自动推导，且推导逻辑要识别 metadata 中的 `LEVEL_TIME_*` 字段、判断行/列轴时间维度优先级。
> 实际工程量：推导 ~3 天 + UI 置灰提示 ~2 天 + 4 个 quickCalc 的业务命名/参数 UI ~3 天 + 测试 ~3 天 = 约 1.5 周。
> P1.0 已经满（多 measure + 5 quickCalc + filter UI + 列轴翻页 = 3-4 周），强行塞会撑爆。延 P2 与场景 E（同比环比月报）一起做，需求驱动 + 工程量合理。

**关键挑战**：时间维度 `dateDimension` / `dateLevel` 自动推导。

#### TDD

```typescript
// core/queryBuilder/translators/timeIntelligence.test.ts
describe('inferTimeContext', () => {
  it('should detect LEVEL_TIME_MONTH on row axis', () => {
    const rows: RowField[] = [{ fieldName: 'OrderDate_Month2', type: 'Dimension' }];
    expect(inferTimeContext(rows, [], fixtureMetadata)).toEqual({
      dateDimension: 'custom-OrderDate',
      dateLevel: 'OrderDate_Month2',
    });
  });

  it('should return null when no time field', () => {
    const rows: RowField[] = [{ fieldName: 'ShipProvince', type: 'Dimension' }];
    expect(inferTimeContext(rows, [], fixtureMetadata)).toBeNull();
  });

  it('should prefer the deepest time level (day > month > quarter > year)', () => {
    // 行轴有月，列轴有日 → 用日
  });
});
```

UI 部分（菜单置灰）：

```typescript
describe('QuickCalcMenu time intelligence', () => {
  it('should grey out time-intel options when no time dimension', () => {});
  it('should show tooltip "请先把时间字段拖到行或列" on hover greyed option', () => {});
  it('should populate dateDimension/dateLevel from inferred context', () => {});
});
```

---

### 2.3 字段表达式编辑器（FieldExpressionEditor）

**实现步骤**（严格 TDD 顺序）：

#### Step 1: Lexer

```typescript
// core/expressionParser/lexer.ts
const lexer = new chevrotain.Lexer([
  /* token defs: LSquare, RSquare, Ident, Number, Plus, Minus, ... */
]);
```

**TDD**

```typescript
describe('lexer', () => {
  it('should tokenize field reference', () => {
    const result = lex('[销售额]');
    expect(result.tokens).toEqual([
      expect.objectContaining({ image: '[' }),
      expect.objectContaining({ image: '销售额', tokenType: { name: 'Ident' } }),
      expect.objectContaining({ image: ']' }),
    ]);
  });
  it('should tokenize aggregate', () => {});
  it('should report lexing error on unknown char', () => {});
});
```

#### Step 2: Parser

```typescript
// core/expressionParser/parser.ts
class ExpressionParser extends chevrotain.CstParser { /* ... */ }
```

**TDD**（按 BNF 顺序，每条产生式一个测试）

```typescript
describe('parser', () => {
  describe('expression', () => {
    it('should parse number', () => expectAst('100', { kind: 'Number', value: 100 }));
    it('should parse field ref', () => expectAst('[A]', { kind: 'FieldRef', alias: 'A' }));
    it('should parse simple addition', () =>
      expectAst('[A] + [B]', { kind: 'BinaryOp', op: '+', left: ..., right: ... })
    );
    it('should respect operator precedence', () =>
      expectAst('[A] + [B] * [C]', /* * 比 + 优先 */)
    );
    it('should respect parens', () =>
      expectAst('([A] + [B]) * [C]', /* + 先算 */)
    );
    it('should parse aggregate', () =>
      expectAst('SUM([A])', { kind: 'Aggregate', func: 'SUM', arg: { kind: 'FieldRef', alias: 'A' }})
    );
    it('should parse negation', () =>
      expectAst('-[A]', { kind: 'Negation', operand: { kind: 'FieldRef', alias: 'A' }})
    );
  });

  describe('error recovery', () => {
    it('should report missing closing bracket', () => {
      const result = parse('[A');
      expect(result.errors).toContainEqual(expect.objectContaining({
        message: expect.stringMatching(/缺少 ] 闭合/),
      }));
    });
  });
});
```

#### Step 3: 校验器

```typescript
// core/expressionParser/validate.ts
export function validate(ast: AstNode, metadata: Metadata): ValidationError[];
```

**TDD**

```typescript
describe('validate', () => {
  it('should accept valid expression', () => {
    const ast = parse('[销售额] - [成本]').ast;
    expect(validate(ast, metadata)).toEqual([]);
  });

  it('should reject when field not in metadata', () => {
    const ast = parse('[不存在的字段]').ast;
    expect(validate(ast, metadata)).toContainEqual(expect.objectContaining({
      type: 'UnknownField',
      field: '不存在的字段',
    }));
  });

  it('should reject type mismatch', () => {
    const ast = parse('[销售额] + [产品名]').ast;  // 数值 + 字符串
    expect(validate(ast, metadata)).toContainEqual(expect.objectContaining({
      type: 'TypeMismatch',
    }));
  });

  it('should reject division by zero literal', () => {
    const ast = parse('[A] / 0').ast;
    expect(validate(ast, metadata)).toContainEqual(expect.objectContaining({
      type: 'DivisionByZero',
    }));
  });
});
```

#### Step 4: MDX 翻译器

```typescript
// core/expressionParser/translate.ts
export function translateToMdx(ast: AstNode): string;
```

**TDD**

```typescript
describe('translateToMdx', () => {
  it('should translate field ref', () => {
    expect(translateToMdx({ kind: 'FieldRef', alias: '销售额' })).toBe('[Measures].[销售额]');
  });

  it('should translate binary op', () => {
    const ast: AstNode = {
      kind: 'BinaryOp', op: '-',
      left: { kind: 'FieldRef', alias: '销售额' },
      right: { kind: 'FieldRef', alias: '成本' }
    };
    expect(translateToMdx(ast)).toBe('([Measures].[销售额] - [Measures].[成本])');
  });

  it('should translate aggregate', () => {});
  it('should preserve precedence with parens', () => {});
  it('should translate negation', () => {});
});
```

#### Step 5: 编辑器 UI

**TDD**（集成测试为主）

```typescript
describe('FieldExpressionEditor', () => {
  it('should validate on input and show ✓ when valid', async () => {});
  it('should show error tooltip on invalid syntax', async () => {});
  it('should provide field autocomplete on [', async () => {});
  it('should call onSave with CustomField when clicking 确定', async () => {});
  it('should reject save when validation has errors', async () => {});
});
```

#### Step 6: 暴露组合入口 parseAndValidate

字段表达式编辑器内部需要"一步从字符串到（AST 或 错误清单）"。在 expressionParser 模块导出组合函数：

```typescript
// core/expressionParser/index.ts
export interface ParseAndValidateResult {
  ast: AstNode | null;
  errors: ValidationError[];     // 含 lex / parse / validate 三层错误
}

export function parseAndValidate(
  text: string,
  metadata: Metadata
): ParseAndValidateResult {
  const lexResult = lex(text);
  if (lexResult.errors.length) return { ast: null, errors: lexResult.errors };

  const parseResult = parse(lexResult.tokens);
  if (parseResult.errors.length) return { ast: null, errors: parseResult.errors };

  const validationErrors = validate(parseResult.ast, metadata);
  return { ast: parseResult.ast, errors: validationErrors };
}
```

#### Step 7: PRD 附录 C 反例必须全部拒绝

测试驱动：把附录 C 反例表 5 行直接转成 it.each：

```typescript
it.each([
  ['IF([销售额] > 100, 1, 0)', /不支持条件表达式|UnknownFunction/],
  ['[销售额] + [产品名]', /类型不匹配|TypeMismatch/],
  ['CONCAT([姓], [名])', /不支持字符串函数|UnknownFunction/],
  ['SUM([不存在的字段])', /字段引用校验失败|UnknownField/],
  ['[销售额] +', /语法错误|SyntaxError/],
])('should reject: %s', (input, errorPattern) => {
  const result = parseAndValidate(input, metadata);
  expect(result.errors.some(e => errorPattern.test(e.message))).toBe(true);
  expect(result.ast).toBeNull();
});
```

PRD 附录 C 正例同样有反向测试：

```typescript
it.each([
  '[销售额] - [成本]',
  '([销售额] - [成本]) / [销售额]',
  '[销售额] / [订单量]',
  '[销售额] / 10000',
  'SUM([销售额]) - SUM([成本])',
])('should accept: %s', (input) => {
  const result = parseAndValidate(input, metadata);
  expect(result.errors).toEqual([]);
  expect(result.ast).not.toBeNull();
});
```

---

### 2.4 维度分组编辑器（按 ADR-010 独立实现）

#### EnumGroupEditor

**TDD 测试矩阵**

| # | Case | 验收 |
|---|---|---|
| 1 | 加载维度成员（懒加载 + 搜索） | 调用 onLoadMembers callback |
| 2 | 多选成员 + 拖入某组 | 该组 members 数组追加 |
| 3 | 单成员拖到另一组 | 从原组移除 + 加入新组 |
| 4 | 重命名组 | groups[i].label 更新 |
| 5 | 删除组 | groups.length - 1 |
| 6 | 未分组 = "show_individually" | ungroupedHandling 字段对 |
| 7 | 未分组 = "merge_as_other" + 标签输入 | ungroupedLabel 字段对 |
| 8 | 保存 → 输出 ViewConfig.customFields[i] | 完整结构对 |

**Mock 边界**：维度成员加载接口（[1-product.md](../1-product.md) 阻塞项 10）通过 `onLoadMembers: (fieldName) => Promise<string[]>` 注入。

#### RangeGroupEditor

**TDD 测试矩阵**

| # | Case | 验收 |
|---|---|---|
| 1 | 添加区间 | ranges + 1 |
| 2 | 删除区间 | ranges - 1 |
| 3 | 区间重叠校验 | 拒绝保存 + 错误提示 |
| 4 | 升序自动排序 | 输入乱序也按 min 排 |
| 5 | 第一个区间 min = -∞ | UI 默认 -∞ |
| 6 | 最后一个 max = +∞ | UI 默认 +∞ |
| 7 | 标签重复校验 | 拒绝保存 |
| 8 | < 2 个区间 | 拒绝保存 |
| 9 | 边界值左闭右开 | 翻译输出 minInclusive/maxExclusive |

#### QueryBuilder customElements 翻译器

**TDD**

```typescript
describe('translateCustomElements', () => {
  it('should translate calc_measure to CustomCalcMeasure', () => {
    // 用 parseAndValidate 拿到真实 ast，避免硬编码 placeholder
    const { ast } = parseAndValidate('[销售额] - [成本]', fixtureMetadata);
    expect(ast).not.toBeNull();

    const cf: CustomField = {
      id: 'uf1',
      name: '利润率',
      kind: 'calc_measure',
      dataFormat: '百分比-保留一位小数',
      expression: '[销售额] - [成本]',
      ast: ast!,
    };
    expect(translateCustomElements([cf])).toEqual([
      expect.objectContaining({
        _enum: 'CustomCalcMeasure',
        measure: expect.objectContaining({
          name: 'uf1',
          alias: '利润率',
          dataFormat: '百分比-保留一位小数',
          expr: '([Measures].[销售额] - [Measures].[成本])',
        }),
      }),
    ]);
  });

  it('should translate enum_group to CustomColumn with EnumGroupColumn def', () => {
    // ⚠️ 后端 schema 待对齐（阻塞项 8），下面字段名是推测
    const cf: CustomField = {
      id: 'ug1',
      name: '区域分组',
      kind: 'enum_group',
      baseField: 'ShipProvince',
      groups: [
        { label: '沿海', members: ['广东', '福建'] },
        { label: '长三角', members: ['江苏', '上海'] },
      ],
      ungroupedHandling: 'merge_as_other',
      ungroupedLabel: '其他',
    };
    expect(translateCustomElements([cf])).toEqual([
      expect.objectContaining({
        _enum: 'CustomColumn',
        column: expect.objectContaining({
          name: 'ug1',
          alias: '区域分组',
          define: expect.objectContaining({
            _enum: 'EnumGroupColumn',
            baseColumn: 'ShipProvince',
            groups: expect.any(Array),
            otherHandling: 'MERGE',
            otherLabel: '其他',
          }),
        }),
      }),
    ]);
  });

  it('should translate range_group to CustomColumn with RangeGroupColumn def', () => {
    // 验证字段名映射：ViewConfig.min/max → 后端 minInclusive/maxExclusive
    const cf: CustomField = {
      id: 'ug2',
      name: '年龄段',
      kind: 'range_group',
      baseField: 'Age',
      ranges: [
        { min: null, max: 18, label: '未成年' },
        { min: 18, max: 60, label: '青壮年' },
      ],
    };
    const result = translateCustomElements([cf]);
    const ranges = (result[0] as any).column.define.ranges;
    expect(ranges[0]).toEqual({ minInclusive: null, maxExclusive: 18, label: '未成年' });
    expect(ranges[1]).toEqual({ minInclusive: 18, maxExclusive: 60, label: '青壮年' });
  });
});
```

⚠️ **后端 schema 联调**：P2 启动后第 1 周必须和后端验证 `EnumGroupColumn` / `RangeGroupColumn` 的真实 schema，调整 translator。

---

### 2.5 命名集筛选 + 异步列头

这两个能力**后端已支持**，前端工作量小：

- **NamedSet 筛选**：FilterPanel 加"应用命名集"快捷入口，从 metadata.namedsets 列出可选；翻译为 `query.filters` 中的 `TupleFilter`
- **异步列头**：`pageSettings.isAsyncQueryColumnHeader: true`；usePivotQuery 处理"行先到，列再到"的双阶段返回

测试：

```typescript
describe('AsyncColumnHeader handling', () => {
  it('should render row data first, then column header', async () => {});
  it('should show column header skeleton during second phase', async () => {});
});
```

---

## 3. P2 完成定义

- [ ] 时间智能 4 个 quickCalc 在场景 E 跑通
- [ ] 字段表达式编辑器：附录 C 5 个正例全部可创建并查询，5 个反例全部拒绝
- [ ] 字段表达式 parser/validate/translate 模块覆盖率 ≥ 90%（关键模块）
- [ ] EnumGroupEditor 8 个测试 case 全部通过
- [ ] RangeGroupEditor 9 个测试 case 全部通过
- [ ] customElements 翻译器和后端联调通过
- [ ] 命名集筛选 + 异步列头 在场景 E 端到端可用
- [ ] core/expressionParser 覆盖率 ≥ 80%（含 lexer/parser/validate/translate 各模块）
- [ ] E2E 加场景 E 用例 + 字段表达式创建 + 维度分组创建
- [ ] 至少 1 个种子用户每周用字段表达式 ≥ 2 次（验证产品价值）

---

## 4. 风险登记（P2 增量）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `EnumGroupColumn`/`RangeGroupColumn` schema 实际和推测差异大 | 高 | 中 | P2 W1 联调，translator 隔离设计便于改 |
| 表达式 parser 错误提示对用户不友好 | 中 | 中 | UX 评审 5 个常见错误的提示文案 |
| chevrotain bundle 80kb 影响首屏 | 低 | 低 | 表达式编辑器懒加载（仅打开时加载） |
| 时间维度自动推导歧义（行列都有时间） | 中 | 低 | 默认取列 > 行；UI 显示推导结果让用户确认 |
| 维度成员加载接口性能（成员上万时） | 中 | 中 | 分页 + 搜索；前端虚拟滚动列表 |
