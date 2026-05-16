# P5+ UI 小变更设计

> Status: ✅ Active — 2026-05-13 落地完成

不够分量单写一个 ADR、但比内联注释更需要文档化的几个改动。

---

## 1. 字段数据类型图标

### 1.1 背景

P3 起 FieldTree 用 6 种 fieldType-based icon:
- `Aa`(Dimension, teal)、`Σ`(Measure, blue)、`ƒx`(CalcMeasure)、`≡`(Hierarchy)、`⊞`(CalcGroup)、`★`(NamedSet)

**问题**:
- 时间 level 字段(`LEVEL_TIME_YEAR/QUARTER/MONTH/DAY`)的 fieldType 是 `Dimension`,显示成 `Aa`(文本) — 不准
- DropZones chip 此前没有任何数据类型提示

### 1.2 设计

派生 `FieldDisplayType: 'numeric' | 'text' | 'date' | 'boolean' | null` 自 `FieldNode`:

| 输入 | 输出 | 优先级 |
|---|---|---|
| `node.type === 'HIERARCHY_TIME'` | `'date'` | 高(不看 valueType) |
| `node.type` 以 `'LEVEL_TIME'` 开头 | `'date'` | 高 |
| `valueType ∈ {INTEGER, LONG, BIGINT, FLOAT, DOUBLE, BIGDECIMAL, NUMERIC}` | `'numeric'` | 中 |
| `valueType ∈ {STRING, ASCII_CODE}` | `'text'` | 中 |
| `valueType ∈ {DATE, TIME, DATETIME, TIMESTAMP}` | `'date'` | 中 |
| `valueType ∈ {BOOLEAN}` | `'boolean'` | 中 |
| 其他 / null | `null`(UI 不渲染) | — |

**为什么时间 level 优先 type 不看 valueType**:后端把 `LEVEL_TIME_YEAR` 的 valueType 设为 STRING(年份串"2024"),按 valueType 推导会误标 'text'。

### 1.3 视觉

| displayType | glyph | 颜色 |
|---|---|---|
| numeric | `#` | primary(蓝) |
| text | `Aa` | teal |
| date | CSS-drawn calendar(矩形外框 + 加粗顶栏) | orange |
| boolean | `✓` | purple |

**Date glyph 经历过 3 个版本**:
- v1: 中文 `日` — 跟其他抽象符号违和(只有它是 CJK 字)
- v2: emoji `📅` — 不同 OS 渲染不一致,colorful 跟 monochrome 整体风格不搭
- v3 (✓): **CSS-drawn**(`border` + `linear-gradient` 多层)— 完全 monochrome,respects `currentColor`

### 1.4 共享路径

`core/metadata/fieldDisplayType.ts` 单源:
- `deriveFieldDisplayType(node)` — 主推导函数
- `isNumericValueType(vt)` — 给 useTagMenu / useColumnHeaderMenu / PivotTable.adhocNumericFieldNames 三处复用(避免每处 hardcode 数值类型集合,曾经搞错过 — 用了 `INT/TINYINT/SMALLINT/DECIMAL` 这些**不在 ValueType union 里**的串)
- `DISPLAY_TYPE_LABELS` — 中文 tooltip 标签

UI 消费:
- **FieldTree**:`data-display-type={displayType}` 属性 + CSS override(Dimension fieldType 下,按 display-type 切换 ::before content)
- **DropZones chip**:`<span class="dropzone__tag-type" data-type={...}>` 独立 badge

---

## 2. 合计 / 小计互斥(透视维度 chip)

### 2.1 背景

P3 起透视的维度 chip 右键菜单同时有"显示小计 / 显示总计"两项:
- 显示小计 → 改 `RowField.subTotal: 'SHOW'`(per-field)
- 显示总计 → 改 `pageState.showGrandTotal`(axis-wide)

**问题**:
1. 用户不分得清两者区别 — UI 上两个开关并列,语义混淆
2. Σ 度量名称 chip(sentinel)也错误地显示这两项(后端不支持按其建小计)

### 2.2 设计

**互斥规则**:同一 chip 同时只渲染一个按钮,按位置决定 label:
- row/column 第 1 个维度字段 → label "显示合计"
- row/column 第 ≥2 个维度字段 → label "显示小计"

**关键约定:两者 action 同构** — 都 dispatch `SET_FIELD_SUB_TOTAL`,只改 `fields[N].DimensionField.subTotal='SHOW'`。换句话说,**后端 query 一致,只是前端文案区分**。

### 2.3 排除清单

| chip 类型 | 是否出现合计/小计 | 原因 |
|---|---|---|
| Dimension(row/column, idx=0) | 显示"合计" | 第 1 字段视觉等同于全行/列合计 |
| Dimension(row/column, idx≥1) | 显示"小计" | per-group 汇总 |
| Measure / CalcMeasure | ✗ | 值字段无合计概念 |
| MeasureGroupName(Σ 度量名称 sentinel) | ✗ | 非真维度,后端不接受 |
| 任何 chip 在 adhoc | ✗ | 明细无合计概念 |
| 任何 chip 在 chart | ✗ | chart 不渲染合计行 |

实现 gate(`useTagMenu.ts`):
```ts
if (
  !isMeasure &&
  !isMeasureAxisChip &&
  viewMode.isMatrixView &&    // = isPivot && isTable
  (zone === 'row' || zone === 'column')
) {
  const idxInAxis = fieldArr.findIndex(...);
  const labelText = idxInAxis === 0 ? '显示合计' : '显示小计';
  // 同一 action 不分 label
}
```

### 2.4 全表总计去哪了

`pageState.showGrandTotal` 是**轴级**开关(整列/整行汇总),独立于 per-field subTotal。**SettingsModal** 独占 UI 入口(chip 菜单不再 toggle 它)。

---

## 3. 设置面板归属

### 3.1 P5+ 新加项

`SettingsModal` 加 2 个相关项:

| 开关 | 字段 | 后端语义 |
|---|---|---|
| 显示全表总计 | `pageState.showGrandTotal` | `pageSettings.showGrandTotal=true` + `totalAtEnd='true,true'` — 全表末尾一行/一列汇总 |
| 小计位置(末尾 / 开头) | `pageState.subTotalAtEnd` | `pageSettings.subTotalAtEnd=true/false` |

### 3.2 概念区分

很多用户混淆"全表总计"和"per-field 小计":

| 概念 | viewConfig 字段 | UI 入口 | 后端 |
|---|---|---|---|
| **字段级小计** | `rows[N].subTotal: 'SHOW'` | chip 菜单(label "合计"/"小计" 按位置文案区分) | `fields[N].DimensionField.subTotal='SHOW'` |
| **全表总计** | `pageState.showGrandTotal` | SettingsModal | `pageSettings.showGrandTotal=true` |
| **小计行位置** | `pageState.subTotalAtEnd` | SettingsModal | `pageSettings.subTotalAtEnd=true/false` |

各自有**唯一** UI 入口,语义清晰互不重叠。

---

## 4. 数据类型集合规范

### 4.1 跟实际 ValueType union 对齐

历史 bug:三处独立 hardcode 的"数值类型"集合用了错误名(`INT/TINYINT/SMALLINT/DECIMAL`),不在 `ValueType` union 里。Mock 测试都跑过,但真实数据全部漏判。

修复:
- 单源 `core/metadata/fieldDisplayType.isNumericValueType(vt)`
- `useTagMenu` / `useColumnHeaderMenu` / `PivotTable.adhocNumericFieldNames` 三处全部走它

```ts
// 真实 ValueType union(types/metadata.ts)
type ValueType =
  | 'STRING' | 'INTEGER' | 'LONG' | 'BIGINT'
  | 'FLOAT' | 'DOUBLE' | 'BIGDECIMAL'
  | 'DATE' | 'TIME' | 'DATETIME' | 'TIMESTAMP'
  | 'BOOLEAN' | 'ASCII_CODE' | 'NUMERIC';

// 数值类
const NUMERIC = new Set(['INTEGER', 'LONG', 'BIGINT', 'FLOAT', 'DOUBLE', 'BIGDECIMAL', 'NUMERIC']);
```

---

## 5. Trade-off 速查

| 决策 | 选择 | 反悔成本 |
|---|---|---|
| date icon 用 emoji vs CSS-drawn | CSS-drawn(monochrome 一致) | 低(改 CSS 即可) |
| 数据类型显示用文字 vs icon | icon(跟其他字段图标视觉权重一致) | 低 |
| 合计/小计互斥 vs 同时显示 | 互斥(用户更易理解) | 中(改了用户习惯) |
| 全表总计入口 chip 菜单 vs 设置面板 | 设置面板(语义独立于 chip) | 中(P3 → P5+ 的迁移) |

---

## 6. 测试覆盖

| 模块 | 新增测试数 |
|---|---|
| `fieldDisplayType.test.ts` | 22 — time level 优先 + valueType 映射 + 大小写防御 + null 处理 |
| `useTagMenu.test.ts`(合计/小计相关) | 9 — Σ chip 不显示 / row 第 1 显示合计 / 第 ≥2 显示小计 / 同 dispatch / column 同上 / adhoc/chart 都不显示 / 两按钮 query 等价 |
| `useColumnHeaderMenu.test.ts` | 6 — 字符串不显示条件格式 / 数值显示 / ByMeasure 不显示 / 点击 callback |
| `DropZones.test.tsx` data-type | 3 — 数值字段 data-type=numeric / 字符串=text / sentinel 无 badge |

---

## 7. 关键文件

```
src/core/metadata/fieldDisplayType.ts          数据类型派生 + 数值类型判定(单源)
src/hooks/useTagMenu.ts                        chip 菜单 — 合计/小计互斥 gate + adhoc 条件格式 gate
src/hooks/useColumnHeaderMenu.ts               adhoc 列头 — 条件格式 gate
src/components/FieldTree/FieldTree.tsx         加 data-display-type 属性
src/components/DropZones/DropZones.tsx         chip 加数据类型 badge
src/components/SettingsModal/SettingsModal.tsx 全表总计 / 小计位置 入口
index.html                                     icon CSS(FieldTree + DropZones 共享 + date CSS-drawn)
```

---

## 5. 重复 chip 视觉警告 + buildQuery first-wins dedup

### 5.1 问题

用户拖同字段多次,viewConfig 累积重复 chip,buildQuery 翻译时把重复 fieldName / (measure, agg, qc) 三元组发后端,后端 406。

### 5.2 设计 — "拖拽放行 + 查询去重 + 视觉警告"

| 层 | 行为 |
|---|---|
| 拖拽 reducer | 100% 放行(不打断,chip 立刻出现) |
| DropZones 渲染 | 检测重复 chip → 红边框 + ⚠ icon + tooltip |
| buildQuery 入口 | first-wins dedup,避免后端 406 |
| 用户改 chip agg/qc | key 不再撞 → 警告自动清除(动态响应) |

### 5.3 Dedup key

| Zone | Key |
|---|---|
| Row / Column | `fieldName` |
| Value | `(measureName, aggregator, quickCalcEnum+dateLevel)` 四元组 |
| Filter | 已在 DropZones 显示层做 `collectFilterLeafFields + dedupe`(group 内 leaf 递归展平后去重),不走此路径 |

### 5.4 视觉

- chip `data-duplicate="true"` → CSS 红边框 + 浅红底
- alias 右侧追加 `.dropzone__tag-warning` span,内容 ⚠(red)
- tooltip 优先级:`duplicate > disabled > 普通提示`

### 5.5 实现要点

```ts
// findDuplicates.ts — 单源,DropZones + buildQuery 都用
export function findDuplicateValueIndices(values: ValueField[]): Set<number>
export function dedupValueFields(values: ValueField[]): ValueField[]

// buildQuery 入口
export function buildQuery(rawViewConfig: ViewConfig, ...): Query {
  const viewConfig = {
    ...rawViewConfig,
    rows: dedupRowFields(rawViewConfig.rows),
    columns: dedupColumnFields(rawViewConfig.columns),
    values: dedupValueFields(rawViewConfig.values),
  };
  ...
}
```

reducer 仍纯,不动 viewConfig 结构(用户拖入的 chip 保留)。

### 5.6 测试 (+25)

- findDuplicates 18:row/column/value 各类去重 + key 函数 + 边界
- buildQuery 4:rows/columns 重复 dedup + values 三元组(同 agg 去重 / 不同 agg 保留)
- DropZones 3:row 重复标红 / value 同 agg 标红 / value 不同 agg 不标

### 5.7 关键文件

```
src/core/viewConfig/findDuplicates.ts       检测 + dedup helper(单源)
src/core/queryBuilder/buildQuery.ts         入口处 dedup
src/core/queryBuilder/buildAdhocQuery.ts    入口处 dedup(只 rows)
src/components/DropZones/DropZones.tsx      duplicate 状态 + ⚠ icon
index.html                                  .dropzone__tag[data-duplicate=true] 红边框
```

---

## 6. Filter zone 递归展平显示 chip

### 6.1 问题

`viewConfig.filters` 顶层是 group(`OR(year=2023, year=2024)`)时,DropZones filter zone 啥 chip 都不渲染 — 用户看不到当前在过滤什么。

### 6.2 根因

```ts
// 旧实现 — 只看顶层 leaf
viewConfig.filters.filter((f) => f.kind === 'leaf').map(...)
```

group 被排除;同样问题在 measureFilters。

### 6.3 修复

递归扫整棵 filter 树收集所有 leaf 的 fieldName,去重后每个 fieldName 渲染 1 个 chip。删除 × → `removeFieldFromZone` 已递归裁(包括 group 内嵌 + 空 group 清理),reducer 不动。

```ts
function collectFilterLeafFields(filter: ClientFilter): string[] {
  if (filter.kind === 'leaf') return [filter.field];
  return filter.children.flatMap(collectFilterLeafFields);
}
```

### 6.4 不变量

- 同 fieldName 多次出现(`OR(year=2023, year=2024)`)→ **1 个 chip**(去重保序)
- 多 field 嵌套 group → 每个 fieldName 各 1 chip
- 删除 × 调 `onRemove(zone, fieldName)`,reducer 递归裁所有相关 leaf

### 6.5 关键文件

```
src/components/DropZones/DropZones.tsx        collectFilterLeafFields / collectMeasureLeafFields + dedupe
src/core/viewConfig/removeFieldFromZone.ts    已有的递归 pruneFilterTree(无改动)
```

---

## 7. Drill-through 单 cell 只带对应 measure

### 7.1 问题

用户右键透视 cell "查看明细",明细 query 把 `viewConfig.values` 里所有 MEASURE 都带过去 — 用户语义是"这个数怎么来的",带 销售成本 这种无关 measure 冗余,且 measure 跨 view 时后端 DetailQuery 直接 406。

### 7.2 修复

`buildDetailQuery` 从 `rowMember`/`colMember` 里识别 `dimension='Measures'` 的 member,拿其 fieldName 拆 base measureName(`splitMeasureFieldName` 处理 @AGG@/@QC@ 后缀),只把匹配的 measure 加进 `detail query.rows`。

### 7.3 边界

| 场景 | 行为 |
|---|---|
| 单元格右键(含 Measures member) | **只带该 measure** |
| Measures member 是编码名(`@AGG@AVG`) | 按 **base measureName** 匹配 |
| Toolbar"明细"按钮(rowMember/colMember=[]) | 退化带所有 measures(向后兼容) |
| 纯维度 cell(无 Measures member) | 退化带所有 measures |
| 同 measureName 多 agg | DetailQuery rows 去重(无聚合,measureName 重复无意义) |

### 7.4 关键文件

```
src/core/drillThrough/buildDetailQuery.ts     扫 rowMember/colMember 找 Measures member → 限定 measureFieldNames
```

