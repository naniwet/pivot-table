# Phase P3 / P4+ — 锚点（不作为实施依据）

> **📍 实施状态**：✅ **P3 已交付** / ⚠️ **P4+ 部分已交付**
>
> | 能力 | 状态 | 实现位置 |
> |---|---|---|
> | P3 — MEASURE_GROUP_NAME 多 measure 多布局 | ✅ | `core/queryBuilder/` |
> | P3 — 度量筛选 InGroup | ✅ | `core/filterTree/` + `MeasureFilterModal` |
> | P3 — 钻取明细（DrillThrough） | ✅ | `core/drillThrough/buildDetailQuery.ts` + `DetailModal` |
> | P4+ — 条件格式化 | ✅ 4 种规则全开（threshold/dataBar/topN/bottomN，cell/row 双 scope，pivot/adhoc 隔离） | `core/conditionalFormat/` + `ConditionalFormatModal`，详见 [`../pivot-table/docs/conditional-format-design.md`](../pivot-table/docs/conditional-format-design.md) |
> | P4+ — 联动图表 | ✅ echarts：bar/line/pie | `core/chart/` + `ChartRenderer` |
> | P4+ — 高级排序 | ⚠️ 部分（多列 shift+click 已做；BASC/Customize 未做） | `core/queryBuilder/translators/sorts.ts` |
> | P4+ — 暗色模式 | ❌ 未做（CSS variable token 已预留） | — |
> | P4+ — 完整 i18n | ❌ 未做 | — |
> | **超 PRD 范围 — 即席查询模式（adhoc）** | ✅ | `core/viewMode/` + `DetailRenderer` |
> | **超 PRD 范围 — 树状显示模式 lazy-load** | ✅ | `core/tree/` + `TreeRenderer` |
> | **超 PRD 范围 — 滚动加载** | ✅ | `hooks/useScrollPivotQuery` |
> | **超 PRD 范围 — 浏览模式** | ✅ 沉浸视图 + Esc 退出 | `components/Toolbar/` |
> | **超 PRD 范围 — 三面板可收起** | ✅ + localStorage 持久化 | `components/PivotTable/` |
> | **超 PRD 范围 — 通用右键菜单系统** | ✅ 嵌套支持 + 边缘自动翻转 | `components/ContextMenu/` |
> | **超 PRD 范围 — 列宽拖拽** | ✅ | `core/columnResize/` |
>
> 本文件原本是"不作为实施依据"的锚点；现在 P3 + 半个 P4+ 都已落地，详细产品功能见 [`../pivot-table/README.md`](../pivot-table/README.md)。

---

> 本文件为 P3 及以后能力的 roadmap 锚点（**历史规划**）。**不可作为实施依据**。每个 Phase 启动前 2 周由 PM 补全详细规格。

---

## P3 — 多指标横向对比 + 钻取明细

**场景**：场景 D — 多指标横向对比
**估时**：3 工程师 × 3-4 周
**场景描述**：见 [1-product.md](1-product.md) 第 3.4 节

### 新引入的能力（概要）

#### 1. MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE

- 多 measure 的排列方向控制（横向 vs 纵向）
- 拖拽规则：MEASURE_GROUP_NAME 可拖到行/列；MEASURE_GROUP_VALUE 自动放到数值

| 字段类型 | 行轴 | 列轴 | 数值 |
|---|---|---|---|
| MEASURE_GROUP_NAME | ✅ P3 | ✅ P3 | ❌ |
| MEASURE_GROUP_VALUE | ❌ | ❌ | ✅ P3 |

#### 2. 度量筛选（measureFilter）

- 已在 P1.0 引入基础度量筛选；P3 增加按维度组合下的度量值筛选
- 对应后端 `Filter.ByMeasure` + `measureContext: InGroup`

#### 3. 钻取明细（DrillThrough）

- 单元格右键 → "查看明细"
- 弹窗，调用 `QueryType: 'DetailQuery'` + 当前单元格的 row/column 维度成员作为 filter
- 显示明细行（清单视图，无聚合）
- 明细行支持 CSV 导出
- 明细行数上限 10000，超过提示用户加筛选
- 依赖[阻塞项 11](1-product.md)：DrillThrough 接口形态确认

#### 4. 字段表达式扩展（评估）

- "计算字段"模式（行级表达式）— 评估业务呼声决定是否做
- 自建字段相互引用 — 评估
- 条件表达式 IF — 评估

#### 5. 拖拽规则增量

- 用户自建计算字段（如 P3 决定开放）→ 数值区

---

## P4+ — 待定能力

按用户呼声决定优先级，**默认全部不做**。

### 候选能力

| 能力 | 大致工程量 | 触发条件 |
|---|---|---|
| 条件格式（热力图/数据条/图标） | 中 | 用户多次反馈"看不出谁高谁低" |
| 联动图表（PivotChart） | 中 | 用户要求"图表 + 表格联动" |
| 高级排序（5 种 SortBy 全开） | 小 | 分析师提出 |
| 暗色模式 | 小 | 宿主有暗色主题 |
| 完整 i18n（en-US） | 中 | 海外业务 |
| 虚拟滚动（破除分页限制） | 大 | 出现 50,000+ cells 真实需求 |
| 单元格点击触发宿主联动事件 | 小 | 嵌入场景需要联动 |
| 复制粘贴表达式跨视图 | 小 | 用户要求 |
| 视图模板 / 团队共享视图 | 中 | 视图复用需求 |

### 通用 P4+ 不做（除非有强信号）

- 数据写回 / 单元格编辑
- 移动端适配
- 权限管理
- 数据集编辑

---

## 跨 Phase 的延期能力索引

便于追溯各能力的预计交付时间：

| 能力 | 当前承诺 Phase |
|---|---|
| 条件格式 | P4+ |
| 联动图表 | P4+ |
| 暗色模式 | P4+ |
| 虚拟滚动 | P4+（除非分页范围扩大） |
| 完整 i18n | P4+ |
| MDX 高级编辑器 | 不做（永久） |
| 数据集编辑 | 不做（永久，回 Smartbi） |
| 单元格编辑 | 不做（永久） |
| 移动端 | 不做（本期，未来评估） |
| 权限管理 | 不做（永久，依赖 Smartbi） |
