# ADR-004 联调发现 — 2026-05-05

> **Status**：✅ **RESOLVED** — C2 策略已落地并通过真实后端验证（[scripts/probe-backend.ts](scripts/probe-backend.ts) drillDepth 1→3 全部 200 OK）。
>
> 历史：原 PRD 假设（rows=hierarchy 名 + HIERARCHY_SHOW + filters）证伪 → 改用 C2（rows=多 level fieldName + drill 重发 query）。

---

## 背景

PRD `phase-p0.md` §3.1 + `engineering/p0-dev.md` ADR-004 假设：

> 1. `query.rows` 输出**顶层 hierarchy 字段名**（不展开为多个 level）
> 2. `query.fields` 中对应的 `DimensionField` 设置 `subTotal: 'HIERARCHY_SHOW'`
> 3. 在 `query.filters` 中追加约束：只查询展开路径下的子树

我按此实现了 `translateRows` + `translateRowFields` + `translateExpandedHierarchy`。

## 探测过程（[scripts/probe-backend.ts](scripts/probe-backend.ts) + 几次手动 curl）

测试模型(脱敏占位):`<your_model_id>`,hierarchy = `custom-the_date`(4 级:Year/Quarter/Month/Day)

### Strategy A（PRD 原方案）：rows=[hierarchy], fields=[DimensionField with HIERARCHY_SHOW]

```json
"rows": ["custom-the_date"],
"fields": [{ "_enum": "DimensionField", "name": "custom-the_date", "dimension": "custom-the_date", "subTotal": "HIERARCHY_SHOW" }]
```

→ **HTTP 406**：`未知错误 -> custom-the_date not found`

后端不接受 hierarchy 名作为 row 引用。

### Strategy B：rows=[最深 level 名] + HIERARCHY_SHOW

```json
"rows": ["the_date_Quarter2"],
"fields": [{ "_enum": "DimensionField", "name": "the_date_Quarter2", "dimension": "custom-the_date", "level": "the_date_Quarter2", "subTotal": "HIERARCHY_SHOW" }],
"filters": [{ "_enum": "FieldFilter", "field": "the_date_Year2", "filter": { "_enum": "ByValue", "operator": "In", "value": ["2023"] } }]
```

→ **HTTP 200**，但返回的行**只在 quarter level**，没有父层 year。`HIERARCHY_SHOW` 仅产生一行 "SMARTBI合计"（quarter 级总计），**不产生父层 rollup 行**。

```
rows = [
  {name: "2023Q1", level: "the_date_Quarter2"},
  {name: "2023Q2", level: "the_date_Quarter2"},
  {name: "2023Q3", level: "the_date_Quarter2"},
  {name: "2023Q4", level: "the_date_Quarter2"},
  {name: "SMARTBI合计", level: "the_date_Quarter2"}  ← 总计行，不是父层
]
```

### Strategy C：rows=[year, quarter] 多 level，无 filter

```json
"rows": ["the_date_Year2", "the_date_Quarter2"],
"fields": [], "filters": []
```

→ **HTTP 200**，返回笛卡尔积（每行是 `Member[]`，每个 level 一个 member）：

```
rows = [
  [{2023, Year}, {2023Q1, Quarter}],
  [{2023, Year}, {2023Q2, Quarter}],
  [{2023, Year}, {2023Q3, Quarter}],
  [{2023, Year}, {2023Q4, Quarter}],
  [{2024, Year}, {2024Q1, Quarter}],
  ...
]
```

`compressEmptyRows: true` 让没数据的 (year, quarter) 不返回。

## 结论：后端真实模型

Smartbi 后端的 row 轴是 **多 level 笛卡尔积**，不是"顶层带 rollup"。`HIERARCHY_SHOW` 只产生**当前 row level 的总计行**。Hierarchy drill 不能靠 filter 实现。

## 候选修正策略

| 选项 | 描述 | 工作量 | Trade-off |
|---|---|---|---|
| **C2：drill = 改字段集 + 重发 query（用户已确认采用）** | drill ▶ 把下一层 level 加进 `query.rows` → 重发；drill ▼ 反之。viewConfig 不再有 `expandedMembers`，改用 `drillDepth: number` per hierarchy | ★★★ | 后端语义对齐；不拉冗余数据；drill 总是新 query（usePivotQuery 已支持）。drill 是"全局轴深度"而非"每行独立展开"——所有兄弟节点同步 drill |
| ~~C1：前端拉全量过滤~~ | ❌ 用户明确拒绝（性能反模式） | — | 拉全部 level 数据到前端、纯 UI 切换 |
| C3：放弃 drill 回退 flat | 仅留 LEVEL 字段拖拽，不再有 ▶▼ UI | ★ | 失去 drill UX；最简单 |

## 当前代码状态

- `buildQuery` / `translateRows` / `translateExpandedHierarchy` 实现的是**Strategy A**（PRD 原方案）— 不工作。
- 当前 235 tests 全绿，因为它们都是 mock，不验证后端语义。
- `PivotTable.test.tsx` 集成测试也用 mock CellSet，验证不到真后端兼容性。

## 落地步骤（采用 C2）

1. **viewConfig 模型变更**
   - `RowField` 新增可选 `drillDepth?: number`（hierarchy 用），默认 1（仅顶层）
   - 删除 `expandedMembers: string[][]`（per-member 状态）
   - 用 `drillDepth` 表达"轴深度"语义：所有兄弟节点同步 drill
2. **buildQuery 变更**
   - `translateRows`：Hierarchy with drillDepth=N → 输出 `[level0.name, ..., levelN-1.name]`（多个 level）
   - `translateExpandedHierarchy` → 整体废弃（hierarchy 不再产 filter）
   - `translateRowFields`：每个 level 一个 DimensionField
3. **useViewConfig 变更**
   - 替换 `TOGGLE_EXPAND` action → `DRILL_DOWN { fieldName }` / `DRILL_UP { fieldName }`
4. **parseCellSet 变更**
   - rowHeader 构建：从 `Member[]` 行（多 level 笛卡尔积）拍平成 `RowHeaderNode[]`
   - 每个 RowHeaderNode 的 depth = 该行最深 level 的 index；fullPath = 该行所有 member name 串联
5. **PivotRenderer 变更**
   - drill ▶ → `dispatch DRILL_DOWN`；drill ▼ → `DRILL_UP`
   - 同一 hierarchy 下所有 row 的 ▶ 行为相同（drill 是全局轴）
6. **测试**
   - 大半 viewConfig + parseCellSet 测试需要重写
   - 集成测试场景 B：4 步流程不变，但 query 形态变（每步 rows 数组长度 +1）

## 真实后端验证（2026-05-05）

`scripts/probe-backend.ts` 跑 3 步 drill 全 200 OK：

| drillDepth | query.rows | query.filters | 后端响应 |
|---|---|---|---|
| 1 | `["the_date_Year2"]` | `[]` | 2 行，tuple 长度 1（仅年） |
| 2 | `["the_date_Year2", "the_date_Quarter2"]` | `[]` | 8 行，tuple 长度 2（年 × 季） |
| 3 | `["the_date_Year2", "the_date_Quarter2", "the_date_Month2"]` | `[]` | 24 行，tuple 长度 3（年 × 季 × 月） |

C2 设计意图全部满足：rows 数组随 drill 递增，filters 始终为空，backend 按笛卡尔积返回。
drill ▶▼ 现已在 demo 中可点击使用。
