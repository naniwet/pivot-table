# 条件格式化设计 (P5+)

> Status: ✅ Active — 2026-05-13 落地完成,1158 单测全过

可视化高亮规则系统:把符合条件的 cell / row 套样式(bg/fg/bold/dataBar)。

---

## 1. 形态总览

```
┌──────── 4 种规则 ──────────┐    ┌── 2 种 mode ──┐    ┌── 2 种 scope ──┐
│ threshold(阈值/区间)       │  × │ pivot         │  × │ cell           │
│ dataBar(数据条)            │    │ adhoc         │    │ row(整行)     │
│ topN(前 N 名,当前页范围)  │    └───────────────┘    └────────────────┘
│ bottomN(后 N 名)          │
└────────────────────────────┘

dataBar 不支持 row scope(bar 是单 cell 内的进度条,无整行语义)
```

---

## 2. 数据模型

### 2.1 viewConfig 字段

`viewConfig.pageState.conditionalFormats: ConditionalFormatRule[]`

```ts
type ConditionalFormatRule =
  | { id; mode?; scope?; measure; kind: 'threshold'; conditions: ConditionalFormatThresholdCondition[] }
  | { id; mode?; measure; kind: 'dataBar'; color; range: 'auto' | { min, max } }
  | { id; mode?; scope?; measure; kind: 'topN' | 'bottomN'; n; style: { bg?; fg?; bold? } };

type ConditionalFormatMode = 'pivot' | 'adhoc';   // undefined → 'pivot' (旧序列化兼容)
type ConditionalFormatScope = 'cell' | 'row';     // undefined → 'cell'  (旧序列化兼容)
```

### 2.2 `measure` 字段语义

| 模式 | `rule.measure` 指向 |
|---|---|
| pivot | metadata 度量 measureName 或 customField id |
| adhoc | metadata.fields[].name(物理字段名,仅 valueType 数值类) |

Evaluator 内部只做字符串匹配,不区分两种语义 — 通过 `mode` 字段隔离规则池,避免跨模式串味。

---

## 3. Evaluator 协议

### 3.1 纯函数四件套(`core/conditionalFormat/evaluateRule.ts`)

```ts
matchesCondition(cond, cellValue): boolean
evaluateThreshold(rules, measure, cellValue): CellFormatStyle
evaluateTopBottom(rules, measure, cellValue, cutoffs): CellFormatStyle
evaluateDataBar(rules, measure, cellValue, colMinMax): { color, percent } | null
hasRulesFor(rules, measure): boolean
getRuleScope(rule): 'cell' | 'row'           // 安全访问,dataBar 强归 'cell'
computeRowScopeStyles(rules, rowCount, cellValueAt, cutoffs): Map<rowIdx, CellFormatStyle>
```

Evaluator **不知道**:
- RenderModel 结构(透视 vs 明细的数据存放位置不同)
- 当前 mode(由 caller 过滤 rules 后传入)
- 当前 scope(由 caller 切片 rules 后传入)

Caller 负责数据形态适配 + 切片。

### 3.2 预算函数(性能优化)

| 函数 | 作用 | 复杂度 |
|---|---|---|
| `computeColRanges(model)` | per-measure min/max(给 dataBar range='auto') | O(rows × cols) |
| `computeTopBottomCutoffs(model, rules)` | per-rule cutoff 值 | O(rows × cols + Σ rules.n × log values) |
| `computeAdhocStats(args)` | 明细版本(数据在 rowHeader.fullPath,需 Number() 反解) | O(rows × cols) |
| `computeRowScopeStyles(rules, rowCount, cellValueAt, cutoffs)` | per-row 命中后的 style | O(rows × rowRules) |

预算结果挂在 renderer 的 `useMemo`,deps 变化才重算。

---

## 4. 渲染优先级

```
cell-scope rule 命中  >  row-scope rule 命中  >  无样式
threshold 命中        >  topN/bottomN 命中(同 scope 内)
dataBar               独立叠加(跟 threshold/topN 不冲突)
```

具体的 cell render 伪代码:

```ts
// 1. row-scope fallback(每行 1 次预算 → Map)
let style = rowScopeStyles?.get(r);

// 2. cell-scope override(per-cell,更具体)
if (cell has numeric value && cellMeasure has rules) {
  const cellRules = condFormats.filter(r => getRuleScope(r) === 'cell');
  const t = evaluateThreshold(cellRules, measure, value);
  const tb = (t empty) ? evaluateTopBottom(cellRules, measure, value, cutoffs) : t;
  if (tb has style) style = tb;
}

// 3. dataBar 独立画(scope 概念不适用)
const bar = evaluateDataBar(condFormats, measure, value, colRanges.get(measure));

// 4. 应用 inline style + dataBar span
```

**透视模式行表头(th)同步染色** — `rowScopeStyles.get(r)` 也用在 row header,确保整行视觉连贯。

---

## 5. Mode 隔离

```
              ┌─ filterConditionalFormatsByMode(rules, 'pivot') ─→ PivotRenderer 消费
rules: All ──┤
              └─ filterConditionalFormatsByMode(rules, 'adhoc') ─→ DetailRenderer 消费
```

- 同一 `pageState.conditionalFormats` 数组里 pivot/adhoc rule 并存
- 渲染层按 mode 切片,各自评估
- Modal apply diff 也按 mode + measure 双重过滤,避免误删另一模式的规则

**为什么不直接用两个数组?** — viewConfig 序列化向后兼容:旧版本只有一个数组,加一个 `mode` 字段比加新顶层字段反悔成本低。

---

## 6. Scope 互动矩阵

| 触发场景 | cell-scope rule 命中 | row-scope rule 命中 | 行为 |
|---|---|---|---|
| 都不命中 | ✗ | ✗ | 无样式 |
| 仅 cell 命中 | ✓ | ✗ | cell 样式 |
| 仅 row 命中 | ✗ | ✓ | 整行套 row 样式(含 th 行表头) |
| 都命中 | ✓ | ✓ | cell 样式 wins(更具体)— 该 cell 独立显示 cell 颜色,其他 cell 留 row 颜色 |

**dataBar 跟 scope 解耦**:不管 cell 是否命中 threshold/topN/row-scope,dataBar 都独立画在该 cell 内。

---

## 7. UI 入口

| 场景 | 入口 | useTagMenu / useColumnHeaderMenu Gate |
|---|---|---|
| 透视数值区 chip 右键 | "条件格式化…" → 打开 modal (mode='pivot') | `zone='value' && isMatrixView && onOpenConditionalFormat` |
| 明细行区数值 chip 右键 | "条件格式化…" → 打开 modal (mode='adhoc') | `zone='row' && isAdhoc && 数值类 valueType && onOpenConditionalFormat` |
| 明细列头右键 | "条件格式化…" → 打开 modal (mode='adhoc') | `sortKind='ByDimension' && 数值类 valueType && onOpenConditionalFormat` |

Modal 内提供:
- 4 种规则添加按钮(+ 阈值规则 / + 数据条 / + Top N / + Bottom N)
- threshold + topN/bottomN 编辑器内有 scope 下拉(单元格 / 整行)
- dataBar 编辑器无 scope 下拉(强 cell-only)
- 草稿 state(用户编辑过程不触发 query refetch)

---

## 8. 行表头染色细节(pivot)

行 row-scope 命中时:
- 数据 cells(`<td>`)套 bg/fg/bold
- 行表头 `<th>` 也套同样样式(`thInlineStyle`)
- **不染列表头** — 列表头跟所有行共享,套 row 样式没意义

明细模式同理:命中行的所有列 cell(数值列 + 非数值列)都套样式。

---

## 9. 不变量(被测试守护)

| ID | 不变量 |
|---|---|
| I1 | `rule.measure !== cell.measure` → 不参与该 cell 的评估 |
| I2 | threshold rules:多 rule(同 measure)各自 conditions 按顺序匹配,第一个命中即返回;rules 数组不按顺序合并 |
| I3 | dataBar 跟 threshold 互不影响(同 cell 可同时画 bar + 着色) |
| I4 | `value=null/undefined/NaN` → 不应用任何 style(空 cell) |
| I5 | between 时 value 是 `[min, max]`,闭区间 |
| I6 | topN/bottomN:cutoff 由 `computeTopBottomCutoffs` 预算;`evaluateTopBottom` 只判定;并列(value === cutoff)算命中 |
| I7 | 优先级 threshold > topN/bottomN(同 scope 内);scope: cell > row(同 cell);dataBar 独立叠加 |
| I8 | `getRuleScope(rule)`:dataBar 强归 'cell',threshold/topN/bottomN 缺省 'cell' |
| I9 | `filterConditionalFormatsByMode`:`rule.mode === undefined` 视为 'pivot'(旧序列化兼容) |
| I10 | adhoc 仅数值列(`metadata.fields[].valueType` 是 INTEGER/LONG/BIGINT/FLOAT/DOUBLE/BIGDECIMAL/NUMERIC)参与评估;字符串/日期列即使有 rule 也不评估 |

---

## 10. Trade-off 记录

### 10.1 范围 = 当前页 vs 全数据

- **当前页**(✓ 已选):跟 dataBar `range='auto'` 一致,实现简单,跨页排名不一致(README/UI tooltip 已说明)
- 全数据:跨页一致,但要额外的 backend query 或缓存,复杂度大;P5+ 不做

### 10.2 mode 字段加在 union 各 variant vs 顶层

- **加在 union variant**(✓ 已选):每条 rule 独立携带 mode,过滤逻辑直观
- 顶层加 `conditionalFormatsByMode: { pivot: [], adhoc: [] }`:序列化破坏性大,旧 viewConfig 反序列化失败

### 10.3 scope: 是否加 'column'

- 提案中 column scope 在 pivot 模式语义不自然(measure 本来就 column-binding),adhoc 模式跟 cell 退化等价
- **不做**(✓ 已选):仅 cell + row。以后真需要可加,反悔成本低(union 字段加一个值)

### 10.4 row-scope 行表头是否染色

- **染**(✓ 已选):视觉连贯,跟 Excel 一致
- 不染:数据 cells 跟行表头视觉分离,用户能区分 dim 标签和数据,但整行高亮意图被打断

---

## 11. 测试覆盖(53 个相关单测)

| 文件 | 测试数 | 重点 |
|---|---|---|
| `evaluateRule.test.ts` | 49 | matchesCondition / evaluateThreshold / evaluateDataBar / evaluateTopBottom / hasRulesFor / getRuleScope / computeRowScopeStyles |
| `computeColRanges.test.ts` | 9 | pivot 数据列 min/max |
| `computeTopBottomCutoffs.test.ts` | 10 | per-rule cutoff(降序/升序、超量、空列、多 measure) |
| `computeAdhocStats.test.ts` | 10 | 明细数据反解 + cutoff 算法 |
| `viewConfig.filterConditionalFormatsByMode.test.ts` | 4 | mode 隔离 + 旧序列化兼容 |

集成层验证(PivotTable.test.tsx / DropZones.test.tsx)走真渲染,断言 `data-testid="databar-r*-c*"` 等存在。

---

## 12. 未做 / 后续可加

- **rule 之间排序 UI**:目前数组顺序决定优先级,无 UI drag 排序(workaround:删了重加)
- **预览**:modal 编辑过程没有实时预览
- **跨页一致 range**:topN / dataBar `range='auto'` 都按当前页;真业务需要"全数据 top 10" 时需另发 query 拿全量
- **column scope**:见 10.3,需求来了再做
- **rule 模板**:常用模板(红绿灯、热力图)预设,目前用户每次手配

---

## 13. 关键文件

```
src/types/viewConfig.ts                          ConditionalFormatRule union + Scope/Mode 类型
src/core/conditionalFormat/
├── evaluateRule.ts                              evaluator + computeRowScopeStyles + getRuleScope
├── computeColRanges.ts                          dataBar 用的列 min/max
├── computeTopBottomCutoffs.ts                   topN/bottomN cutoff(透视)
└── computeAdhocStats.ts                         明细数据反解 + cutoff
src/components/
├── ConditionalFormatModal/ConditionalFormatModal.tsx    UI 草稿编辑器
├── PivotRenderer/PivotRenderer.tsx                      接 4 件套 + 行表头染色
└── DetailRenderer/DetailRenderer.tsx                    明细接同样 4 件套
src/hooks/
├── useTagMenu.ts                                chip 菜单"条件格式化…"项 gate
└── useColumnHeaderMenu.ts                       列头菜单"条件格式化…"项 gate(adhoc 数值)
```
