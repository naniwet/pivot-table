# Web 数据透视表 PRD

| 字段 | 内容 |
|---|---|
| 版本 | v3.0 |
| 日期 | 2026-05-13 |
| 状态 | **现行 — 已实施落地**（P0~P5+ 全部交付，1092 单测全过） |
| 上一版本 | v2.0.1（计划期） / v1.2（单文件版） |
| 实施仓库 | [`../pivot-table/`](../pivot-table/) |

> ## 📍 现状
>
> PRD 撰写于 2026-05-04（计划期）。**实际实施已超预期完成**：
>
> | Phase | 计划 | 实际 |
> |---|---|---|
> | P0（场景 B） | 4-5 周 | ✅ 已交付 |
> | P1.0/P1.5（场景 C 多 measure + filter + 视图保存） | 6-8 周 | ✅ 已交付 |
> | P2（场景 E 时间智能 + 字段表达式 + 维度分组） | 6-7 周 | ✅ 已交付 |
> | P3（场景 D 多指标 + 钻取明细） | 3-4 周 | ✅ 已交付 |
> | P4+ 条件格式 | 待定 | ✅ 已落地（4 种规则，详见 [pivot-table/docs/conditional-format-design.md](../pivot-table/docs/conditional-format-design.md)） |
> | P4+ 联动图表 | 待定 | ✅ 已落地（echarts：bar/line/pie） |
> | **超 PRD 范围** | — | ✅ 即席查询模式（adhoc）/ 树状显示 / 滚动加载 / 浏览模式 / Smartbi 客户端 / 18 个 probe 脚本 |
>
> 各章节**功能规格**仍是有效的产品定义；**未决事项**已绝大多数解决；**roadmap 估时**仅供历史复盘。各文件已加状态 banner 标明现状。
>
> **真实情况以 [`../pivot-table/README.md`](../pivot-table/README.md) 为准**（产品现状）。本 PRD 是**设计/决策的历史记录**，便于追溯"为什么这么做"。

## 文档结构

本 PRD 拆分为多个文件，按职责组织。**任何修改都必须保持文件间一致性**（特别是术语和 ViewConfig 字段命名）。

**产品规格（PRD 主体）**

| 文件 | 内容 | 主要读者 |
|---|---|---|
| [README.md](README.md) | 索引、读者指引、修订历史 | 全员 |
| [1-product.md](1-product.md) | 背景、目标、用户、迭代路线、用户场景、关键决策、未决事项 | PM、Engineering Lead、所有 |
| [2-architecture.md](2-architecture.md) | 通用语言术语表、数据流、核心组件、Component API（Props/Slots/Imperative）、嵌入示例 | 前端工程、宿主集成方 |
| [3-nfr-backend.md](3-nfr-backend.md) | 非功能需求（性能、缓存、错误处理、埋点、可访问性、浏览器、i18n）、后端契约 | 全栈、后端、QA |
| [phase-p0.md](phase-p0.md) | **P0 实施清单**：场景 B 完整功能规格 + 验收 + 启动阻塞项 | P0 实施工程师 |
| [phase-p1.md](phase-p1.md) | **P1.0 + P1.5 实施清单** | P1 实施工程师 |
| [phase-p2.md](phase-p2.md) | **P2 实施清单**（时间智能 + 字段表达式 + 维度分组） | P2 实施工程师 |
| [phase-p3-plus.md](phase-p3-plus.md) | P3 / P4+ 锚点（不作为实施依据） | PM、长期规划 |
| [appendices.md](appendices.md) | 附录 A-D：场景 B ViewConfig/Query 示例、表达式 BNF、维度分组样例 | 工程参考 |

**工程设计（开发与测试）**

按 TDD 方法论组织，配套 PRD 各 phase 的实施细节、ADR、测试计划。

| 文件 | 内容 | 主要读者 |
|---|---|---|
| [engineering/README.md](engineering/README.md) | 工程原则（TDD/Unix/DDD）、文件结构、测试基础设施、ADR 索引、CI/CD、PR checklist | 全体工程 |
| [engineering/p0-dev.md](engineering/p0-dev.md) | P0 开发与测试设计 — 6 个核心 ADR、模块 TDD 顺序、测试矩阵、E2E 设计 | P0 实施工程师 |
| [engineering/p1-dev.md](engineering/p1-dev.md) | P1.0 + P1.5 开发与测试设计（增量） | P1 实施工程师 |
| [engineering/p2-dev.md](engineering/p2-dev.md) | P2 开发与测试设计（增量）— 字段表达式 parser ADR、分组编辑器 | P2 实施工程师 |
| [engineering/p3-plus-dev.md](engineering/p3-plus-dev.md) | P3+ 锚点 + 跨 Phase 工程指标 | 工程 Lead |

## 读者指引

不同角色推荐阅读顺序：

**PM**
- 完整阅读 1-product.md
- 关注 1-product.md 第 5 节"未决事项"，跟进所有🔴阻塞项
- 关注每个 phase 文件首部"启动阻塞项"

**前端工程师（即将做 P0）**
1. 通读 2-architecture.md（理解架构契约）
2. 通读 3-nfr-backend.md（性能/错误/埋点）
3. 重点研读 phase-p0.md（产品规格）
4. **重点研读 engineering/README.md + engineering/p0-dev.md**（开发设计 + TDD 测试计划）
5. appendices.md 的 A/B 作为实现参考

**前端工程师（即将做 P1/P2）**
- 同上，但 phase 文件换为对应 phase-p1.md / phase-p2.md，工程文件换为 engineering/p1-dev.md / p2-dev.md
- **每次进入新 Phase 前，对应 phase + engineering 文件必须 PM 和 Tech Lead 重审一次**

**后端工程师**
- 1-product.md 第 5 节"未决事项"中所有"后端同事"责任项
- 3-nfr-backend.md 第 8 节"后端契约"
- 各 phase 文件中"对后端的诉求"标记

**QA**
- 各 phase 文件末尾的"验收"小节
- 3-nfr-backend.md 的性能/错误处理章节

**宿主系统集成方（接入透视表组件的业务系统）**
- 2-architecture.md 第 4-5 节（Component API + 嵌入示例）
- 3-nfr-backend.md 第 1-3 节（性能预期、缓存职责、错误处理）

## 修订历史

### v3.0 (2026-05-13) — 实施落地后的现状同步

**背景**：v2.0/v2.0.1 是计划期文档。9 天后实施完成，实际产出大幅超出原计划。本次更新仅**同步状态**，不重写设计；保留 PRD 作为决策历史记录。

**变化**：
- 各 PRD 文件顶部加"实施状态"banner，标明计划 vs 实际
- `1-product.md` roadmap 表加"实际"列；未决事项绝大多数标"已解"
- `phase-p0/p1/p2/p3-plus.md` 加"已交付清单"小节
- `engineering/README.md` 测试 case 数从计划"≥80%"改为实际"1092 cases"；ADR 状态从 Proposed → Accepted
- `2-architecture.md` 核心组件表补全实际新增的（TreeRenderer / DetailRenderer / ChartRenderer / ConditionalFormatModal / FilterTree / SettingsModal / ErrorBoundary 等）
- `3-nfr-backend.md` 对后端的诉求清单 → 转为"已对齐 + 锁定脚本"，记录 18 个 probe 脚本
- 真实产品文档以 [`../pivot-table/README.md`](../pivot-table/README.md) 为准

**没改**：原有的设计/决策/术语锁定/反例清单都保留 — 它们是 v3.0 仍在用的契约，且这就是 PRD 作为历史的价值。

### v2.0.1 (2026-05-04) — 工程文档自审带出的小修

- `2-architecture.md` 4.1 节 `onQuery` 签名加可选 `ctx?: { signal: AbortSignal }`，支持取消（详见 engineering ADR-011）
- `2-architecture.md` 5 节嵌入示例同步加 `ctx.signal` 用法
- `2-architecture.md` 1.2 节 ViewConfig.filters 类型从 `Filter[]` 改为 `ClientFilter[]`（前端嵌套树类型，详见 engineering/p1-dev.md 第 2.4 节）

### v2.0 (2026-05-04) — 重构拆分版

**结构性变化**

- 单文件 1500+ 行拆分为 8 个文件，按职责组织
- 各 Phase 独立文件，作为对应阶段的"实施清单"
- 新增 README 索引和读者指引

**修复 v1.2 自审发现的 12 项问题**

| # | 问题 | 修复 |
|---|---|---|
| 1 | 旧 0 节"文档约定"与 2.1 工程量、Phase 划分对不上 | 删除"文档约定"节，由 README 替代；roadmap 唯一锚点在 1-product.md 第 2 节 |
| 2 | 标题 v1.0 vs 元信息 v1.2 不一致 | v2.0 统一版本 |
| 3 | 嵌入示例和附录 A ViewConfig 用旧 hierarchy（"华东"），且字段名不统一（expanded vs expandedMembers） | 统一为新 hierarchy（"江苏"作为顶层），术语表锁定 `expandedMembers` 为唯一字段名 |
| 4 | 5.x 子章节没按 P1.0/P1.5 拆，与 roadmap 矛盾 | phase-p1.md 严格按 P1.0/P1.5 拆分每个模块 |
| 5 | 4.1 术语表缺新术语，且 Hierarchy 例子与场景 B 矛盾 | 2-architecture.md 术语表补全（CalcGroup/FieldExpression/CustomField/EnumGroup/RangeGroup/ViewConfig 子字段命名等），Hierarchy 例子改为"省→发货区域→城市" |
| 6 | 4.3 核心组件缺 FieldExpressionEditor / DimensionGroupingEditor | 2-architecture.md 第 3 节核心组件表补全 |
| 7 | 附录 C 与 5.12 决策矛盾（"计算字段"已延 P3） | appendices.md 附录 C 删除"计算字段"行；语法说明改为"仅计算度量模式" |
| 8 | 列轴翻页 P0 是过度设计 | phase-p0.md 仅做行轴翻页；列轴翻页延 P1.0（多 measure 时才需要） |
| 9 | 7.1 性能"2500 cells"和"50,000 cells"自相矛盾 | 3-nfr-backend.md 修正为分页规模内的指标，删除 50,000 |
| 10 | 5.5 P0 没列"hover 显示完整路径 tooltip" | phase-p0.md PivotRenderer P0 必做加入此项 |
| 11 | 5.3 QueryBuilder P0 没说 hierarchy 展开成员路径如何翻译 | phase-p0.md QueryBuilder P0 增加详细翻译规则 + 单测 case |
| 12 | 杂项（决策 7 表述、API 必填可选区分、9.1 验收 NamedSet 不可拖、附录 D 字段名映射、修订历史可读性、缺读者指引） | 各处修复；本 README 提供读者指引 |

### v1.x — 单文件版

详见归档文件 `pivot-table-prd-v1.md` 的修订历史。
