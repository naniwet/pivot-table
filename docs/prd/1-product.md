# 1. 产品定位与迭代路线

> **📍 实施状态（2026-05-13）**：本文件是 2026-05-04 计划期定稿。**实际已全部交付**，roadmap 仅供历史复盘。最新现状见 [`../pivot-table/README.md`](../pivot-table/README.md)。

## 1. 背景与目标

### 1.1 问题

公司已有 Smartbi 作为多维分析工具。后端 OLAP 引擎能力强（MDX、hierarchy、namedset、calc_measure、50+ quickCalc），但前端存在两个问题：

1. **交互对业务人员不友好**：50+ 种快速计算用工程化命名平铺在菜单里、拖拽体验生硬、hierarchy 钻取每次重刷整表
2. **无法嵌入到自有业务系统**：是个独立站点，不能作为组件嵌到业务管理后台

### 1.2 目标

复用 Smartbi 后端 query 接口，**重做前端**，做出一个：

- 业务人员能直觉使用的透视表
- 可作为 React/Vue 组件嵌入任意业务系统的透视表

### 1.3 目标用户

| 角色 | 说明 |
|---|---|
| 主用户 | 业务/运营人员（不写 SQL/MDX） |
| 次用户 | 数据分析师（可使用，但不为他们专门设计） |

**本期不考虑双用户模式切换**，UI 一套，按主用户体验设计。

### 1.4 成功度量

- P0 上线后 4 周内，3 个种子业务用户每周使用 ≥ 2 次
- 同等场景下，主观可用性评分高于 Smartbi（5 点量表 ≥ 4）
- 嵌入接口被至少 1 个真实业务系统接入

### 1.5 不做（明确范围外）

- ❌ 完整 BI 平台（不做仪表盘、看板、登录）
- ❌ 数据源管理 / 表关联编辑（Smartbi 数据集核心能力，回 Smartbi 操作）
- ❌ 完整 MDX 编辑器（仅做简单字段表达式，见 phase-p2.md）
- ❌ 字段持久化（自定义字段/分组只在视图内有效，要永久化请回 Smartbi）
- ❌ 权限管理（依赖 Smartbi 后端）
- ❌ 数据写回 / 单元格编辑
- ❌ 移动端适配（本期 Web 桌面端优先）

**关于"数据集编辑能力"的范围说明**：本产品做的是 Smartbi 数据集编辑能力的一个子集 —— 仅限于"在透视场景中临时定义计算字段和分组"。表关联、数据源、字段持久化等仍然在 Smartbi 数据集编辑器里完成。

---

## 2. 迭代路线（Roadmap）

### 2.1 阶段总览

| Phase | 场景 | 关键能力 | 计划估时 | **实际状态** | 详细规格 |
|---|---|---|---|---|---|
| **P0** | 地区销售下钻 | hierarchy + drill + 单 measure + 基础排序 + CSV 导出 + 完整架构骨架 + 嵌入封装 | 4–5 周 | ✅ **已交付** | [phase-p0.md](phase-p0.md) |
| **P1.0** | 产品 Top10 + 占比 | 多 measure + 5 种 quickCalc + 简单 filter（无嵌套） + 列轴翻页 | 3–4 周 | ✅ **已交付** | [phase-p1.md](phase-p1.md) |
| **P1.5** | （沿用 P1.0 场景）增强 | And/Or 嵌套 filter + 多列排序 + Excel 导出 + 视图保存 + NamedSet 拖入 | 3–4 周 | ✅ **已交付** | [phase-p1.md](phase-p1.md) |
| **P2** | 同比环比月报 + 临时计算 | 时间智能 quickCalc + 命名集筛选 + 异步列头 + 字段表达式编辑器 + 维度分组（枚举/范围） | 6–7 周 | ✅ **已交付**（且增加了 calc_column / dim_as_measure 两种自建字段） | [phase-p2.md](phase-p2.md) |
| **P3** | 多指标横向对比 | MEASURE_GROUP_NAME 多 measure 多布局 + 度量筛选 + 钻取明细（DetailModal） | 3–4 周 | ✅ **已交付** | [phase-p3-plus.md](phase-p3-plus.md) |
| **P4+** | 待定 | 条件格式 / 联动图表 / 高级排序 / 暗色模式 / 完整 i18n 等 | 视场景定 | ⚠️ **部分已交付**：条件格式 ✅ / 联动图表 ✅ / 高级排序 ⚠️ 部分 / 暗色模式 ❌ / i18n ❌ | [phase-p3-plus.md](phase-p3-plus.md) |
| **超 PRD 范围** | — | 即席查询模式（adhoc）/ 树状显示模式（lazy-load）/ 滚动加载 / 浏览模式 / 三面板可收起 / 18 个后端 probe 脚本 / Smartbi 客户端 / Express dev proxy / DemoApp | — | ✅ **已交付** | 见 [`../pivot-table/README.md`](../pivot-table/README.md) |

**实际指标**：86 测试文件 / 1092 单测 case（覆盖率 99%+）。

**说明**：估时按 3 个前端工程师，**已包含 20% 架构骨架前置投入**（见 2.3 节）和单元测试时间。不含后端配合（如 schema 对齐、新接口开发）的等待时间。

### 2.2 每个 Phase 的发布门槛

每个 Phase 必须满足才能进入下一阶段：

1. 当前场景端到端可用（不是"50% 功能但每个都半成品"）
2. 至少 3 个种子用户每周使用 ≥ 2 次，连续 2 周
3. 关键交互响应延迟 < 500ms（不含后端 query 时间）
4. 嵌入接口稳定（向后兼容 Props，无 breaking change）
5. 单元测试覆盖 QueryBuilder 和 CellSetParser ≥ 80%

### 2.3 架构骨架的非妥协项（P0 必须做对）

虽然只交付 P0 场景的功能，**以下架构必须按完整能力建模**，否则 P1/P2 撞墙重构。这部分工作量已包含在 P0 的 4-5 周估时内。

- ViewConfig schema 按完整四象限 + 多 measure + filter + sort + quickCalc 设计，P0 大部分字段为空
- 拖拽规则用"字段类型 → 可放置区域"的映射表（数据驱动），不用 if-else
- QueryBuilder 是纯函数（输入 viewConfig + metadata，输出 query），便于单测和增量扩展
- 字段类型按 schema 完整识别（LevelField/MeasureField/NamedSet/CalcMeasure/CalcGroup/MEASURE_GROUP_NAME），UI 只激活当前场景需要的分支

---

## 3. 用户场景

> **本节适用范围说明**：当前版本只**完整定义场景 B（P0）的用户流程和验收 case**。后续场景 C/D/E 仅作为 roadmap 锚点和架构推导依据存在，**用户故事过薄，不可作为对应 Phase 的实施依据**。每个场景在对应 Phase 启动前 2 周必须补全 PRD（用户故事、完整流程、验收 case、UI 草图），见对应 phase 文件。

### 3.1 场景 B【P0】：地区销售下钻

**⚠️ Hierarchy 数据基础**

依据 metadata 中 `HIERARCHY-1624587732438`（"发货区域"）的实际 levels 顺序（按 metadata `order` 字段）：**省 (LEVEL_GEO order=0) → 发货区域 (LEVEL_GEO order=1) → 城市 (LEVEL_GEO order=2)**。

注意此 hierarchy 顶层是"省"而非"大区"。如果种子用户期望从"大区→省→市"开始，需在 Smartbi 数据集编辑器里新建对应 hierarchy。本 PRD 的用户故事按 metadata 现状描述。**P0 启动前 PM 必须和种子用户确认这一点**（见第 5 节阻塞项 5）。

**用户故事**

> 作为业务运营李四，
> 我想看各省份的销售额分布，
> 并能从省钻取到发货区域、再钻取到城市，
> 让我能找到表现差的发货区域和具体城市。

**完整流程**

1. 打开嵌入页 → 自动加载默认视图（行：发货区域 hierarchy；值：销售额）
2. 看到表格：行是各省份顶层成员，列是销售额数值 + 总计行
3. 点击 "江苏" 行旁的 ▶ → 展开为江苏下的发货区域（触发新 query）
4. 点击江苏下某发货区域 → 展开为该区域下的城市
5. 鼠标悬停某城市的销售额 → 显示完整路径（江苏/苏南/南京）与数值
6. 点击表头 "销售额" → 排序方式切换（降→升→无）
7. 翻页（如果数据多）
8. 点击右上 "导出 CSV" → 下载当前视图

详细规格和验收见 [phase-p0.md](phase-p0.md)。

### 3.2 场景 C【P1】：产品 Top10 + 占比

> 作为商品经理王五，
> 我想看销售额 Top10 的产品，
> 每个产品看到销售额、销售额占行总计 %、销售额排名，
> 让我能识别明星产品。

**新引入能力**：top-N 筛选、占行总计 %、排名、多 measure 同时显示。详见 [phase-p1.md](phase-p1.md)。

### 3.3 场景 E【P2】：同比环比月报

> 作为财务赵六，
> 我想按月份看 2026 年的销售额，
> 每个月看到销售额、同比、环比，
> 让我能给老板汇报增长趋势。

**新引入能力**：时间智能 quickCalc（同比/环比）、命名集筛选（"2026 年"作为预定义筛选）、列头异步加载（月份多时）。详见 [phase-p2.md](phase-p2.md)。

### 3.4 场景 D【P3】：多指标横向对比

> 作为销售总监孙七，
> 我想按客户类型看销售额、订单量、利润率三个指标，
> 横向比较哪类客户最有价值。

**新引入能力**：MEASURE_GROUP_NAME（多 measure 排列方向）、度量筛选（measureFilter）、钻取明细（点单元格看明细订单）。详见 [phase-p3-plus.md](phase-p3-plus.md)。

---

## 4. 关键决策

| # | 决策 | 决策依据 |
|---|---|---|
| 1 | 不做双用户模式，UI 一套按业务人员设计 | 减少 UI 复杂度 30%，分析师可回 Smartbi |
| 2 | 一个场景一个场景上线 | 端到端可用 > 功能纵切 70% |
| 3 | 默认依赖后端分页，P0/P1 不做虚拟滚动 | 单查询 ≤ 2500 cells，原生 DOM 够用 |
| 4 | 复用 Smartbi 后端，不做后端 | 后端 OLAP 能力已足够强 |
| 5 | 不做完整 MDX 编辑器，**P2 做简单字段表达式** | 业务人员要算临时利润率，但不会写 MDX；档 1 覆盖 80% 场景 |
| 6 | 第一个场景是 B（地区销售下钻） | 高频 + 引入 hierarchy + Smartbi 痛点最明显 |
| 7 | viewConfig 按完整能力建模，但只激活当前 Phase 分支（**前置工作量已含在各 Phase 估时内**） | 防架构债 |
| 8 | **P0 支持使用预定义 CALC_GROUP**（字段树 + 拖拽） | metadata 已包含，0 工程量 |
| 9 | **P2 做用户自建维度分组（枚举 + 范围）** | 用户强需求；找分析师建分组等不及；后端 customElements 已支持 |
| 10 | 自定义字段/分组**仅保存在 viewConfig**，不写回 metadata | 干净；分享视图带走；想永久化回 Smartbi |
| 11 | P0 不做列轴翻页（仅行轴）| 场景 B 列轴只有 1 个 measure，无需翻页；多 measure 在 P1.0 引入时再加 |
| 12 | P2 字段表达式仅做"计算度量"模式，"计算字段"延 P3 评估 | 业务人员 95% 场景用计算度量就够；两种模式差异业务难以理解 |

---

## 5. 未决事项 — 已基本全部解决

> **现状**：P0~P3 实施期间，11 项未决事项绝大多数已解决；剩余几项不再阻塞迭代。
>
> 解决方式以 **probe 脚本**为主：直接打真后端验证 query/cellset 形态，把后端契约固化为 18 个可重跑脚本（参见 `../pivot-table/scripts/probe-*.ts`）。

| 优先级 | 未决项 | **解决状态** |
|---|---|---|
| 🔴 阻塞 | 1. metadata 接口的 URL 和参数 | ✅ 已对齐：`SmartbiClient` 实现，`probe-metadata-level-lookup.ts` 锁住 schema |
| 🔴 阻塞 | 2. PageSettings 默认值 | ✅ 已对齐：见 `core/queryBuilder/translators/pageSettings.ts` |
| 🔴 阻塞 | 3. 嵌入到哪个业务系统作为 P0 落地 | ✅ 已落地：`demo/` + `proxy/` 端到端联调环境 |
| 🔴 阻塞 | 4. 错误码规范和 message 文案 | ✅ 已对齐：错误处理在 `usePivotQuery` + `ErrorBoundary` 内统一 |
| 🔴 阻塞 | 5. 场景 B 的 hierarchy 是否符合种子用户预期 | ✅ 已确认：按 metadata 实际 hierarchy 落地 |
| 🔴 阻塞 | 6. 埋点平台对接（onTrack 数据格式） | ⚠️ 接口已留（onTrack prop），实际埋点平台对接待宿主集成方落实 |
| 🟡 中 | 7. 视图保存是否需要后端存储 | ⚠️ 组件提供 callback，宿主决定存储介质（demo 用 localStorage） |
| 🟡 中 | 8. `EnumGroupColumn` / `RangeGroupColumn` 的完整 ColumnDef schema | ✅ 已锁定：`probe-final.ts` + `probe-customelement.ts` |
| 🟡 中 | 9. `CustomCalcMeasure` 的 MDX 表达式校验/容错策略 | ✅ 已实现：`core/expression/parseExpression.ts` + `astToMdx.ts`，`probe-calc-final.ts` 锁定 |
| 🟡 中 | 10. 维度成员加载接口（自建枚举分组 UI 用） | ✅ 已对齐：`buildMemberQuery.ts` |
| 🟢 低 | 11. DrillThrough 的具体接口形态 | ✅ 已实现：`buildDetailQuery.ts` + `DetailModal`，`probe-adhoc-end-to-end.ts` 锁定 |

---

## 6. 反悔成本登记

按工程方法论"决策按反悔成本分级"原则：

| 决策 | 级别 | 处理 |
|---|---|---|
| ViewConfig schema | 几乎不可逆 | 多方 review，留扩展位（`extensions: object`）；术语表锁定字段命名 |
| 通用语言术语表 | 几乎不可逆 | 文档锁死（见 2-architecture.md 第 1 节），PR 审查 |
| Component API（Props 形状） | 几乎不可逆 | v1 锁定后向后兼容，新增能力走 `features` 开关 |
| QueryBuilder 内部架构 | 改起来痛但可行 | 上线一段时间再判断 |
| UI 视觉细节 | 轻易可逆 | 迭代 |

精力分配按 80% 投在前 3 项。
