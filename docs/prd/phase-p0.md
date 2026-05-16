# Phase P0 — 实施清单

> **📍 实施状态**：✅ **已交付**（2026-05-13）
> 实际实现见 [`../pivot-table/src/`](../pivot-table/src/) 下对应模块；测试覆盖见 `core/queryBuilder/`、`core/cellSetParser/`、`components/PivotRenderer/` 等。
>
> **场景**：地区销售下钻
> **估时**：3 工程师 × 4-5 周（含 20% 架构骨架前置投入）
> **场景描述与用户故事**：见 [1-product.md](1-product.md) 第 3.1 节

## 启动阻塞项（不解决不准启动）

| # | 项 | 责任人 | 详见 |
|---|---|---|---|
| 1 | metadata 接口 URL/参数 | 后端 | [1-product.md](1-product.md) 阻塞项 1 |
| 2 | PageSettings 默认值 | 后端 | 阻塞项 2 |
| 3 | 嵌入到哪个业务系统作为 P0 落地 | PM | 阻塞项 3 |
| 4 | 错误码规范和 message 文案 | 后端 | 阻塞项 4 |
| 5 | 场景 B hierarchy 是否符合种子用户预期 | PM + 种子用户 | 阻塞项 5 |
| 6 | 埋点平台对接 | PM + 数据团队 | 阻塞项 6 |

---

## 1. 字段树（FieldTree）

### 必做

- 树形展开/折叠
- 按 metadata 顶层结构分三大组：Dimensions / Measures / NamedSets（**P0 NamedSets 区显示但不可拖**）
- 文件夹/层级结构按 metadata 的 `children` 渲染
- 字段类型图标（dimension / measure / hierarchy / calc_measure / **calc_group** / namedset 各一个）
- **`CALC_GROUP` 类型字段**（如 metadata 中的"城市分组"、"时间分组"）作为普通维度字段处理：图标区分（小标记说明这是分组字段），可拖到行/列（P0），筛选区在 P1.0 开放
- 全局搜索（按 `alias` 模糊匹配，结果高亮命中字段，自动展开父节点）
- 拖拽源（HTML5 Drag and Drop）
- 显示 `alias`（不显示 `name`），hover 显示 `desc`
- 不可访问字段（`accessible: false`）置灰且不可拖
- **不可见字段（`visible: false`）完全不显示**
- 同名字段消歧：hover 显示完整路径（如 `订单表 / 省份`）

### 不做

- 字段编辑、创建、删除（去 Smartbi 数据集编辑器）

---

## 2. 拖拽区域（DropZones）

### 必做

- 四个区域显式呈现：**行轴 / 列轴 / 数值 / 筛选**（**P0 筛选区显示但不可放**）
- 拖拽时根据字段类型实时高亮可放置区域，置灰不可放置区域并显示原因 tooltip
- 字段类型 → 区域映射规则（见下表）
- 同一字段不能同时出现在多个区域
- 区域内字段顺序可拖拽调整（决定嵌套层级）
- 字段标签右上角 × 移除
- 字段标签点击/右键打开配置弹窗（**P0 仅排序设置可改，聚合方式/quickCalc 不可改**）

### 拖拽规则表（P0 激活的部分）

| 字段类型 | 行轴 | 列轴 | 数值 | 筛选 |
|---|---|---|---|---|
| Dimension（LEVEL/FIELD/GEO） | ✅ | ✅ | ❌ | ❌（P1.0 开放） |
| Hierarchy（包含整个层级） | ✅ | ✅ | ❌ | ❌ |
| CalcGroup（预定义维度分组） | ✅ | ✅ | ❌ | ❌（P1.0 开放） |
| Measure | ❌ | ❌ | ✅ | ❌ |
| CalcMeasure（预定义计算度量） | ❌ | ❌ | ✅ | ❌ |
| NamedSet | — | — | — | ❌（P1.0 开放） |

**P0 限制**：数值区只能放 1 个 measure，多 measure 在 P1.0 开放。

完整规则表（含 P1+/P2+/P3+ 字段类型）见 [phase-p1.md](phase-p1.md) / [phase-p2.md](phase-p2.md) / [phase-p3-plus.md](phase-p3-plus.md)。

---

## 3. 查询构建（QueryBuilder）

**接口签名**

```typescript
function buildQuery(
  viewConfig: ViewConfig,
  metadata: Metadata,
  pageState: PageState
): Query
```

纯函数，无副作用，**单元测试覆盖率必须 ≥ 80%**。

### 必做

- 把 row/column 字段名翻译成 `query.rows` / `query.columns`（按拖拽顺序）
- `query.fields` 数组按 viewConfig 构造，包含完整 `_enum` / `name` / `dimension` 或 `measure` 字段
- 默认 `pageSettings`：
  - `rowPageSize: 50`, `columnPageSize: 50`（**待和后端确认默认值**）
  - `showGrandTotal: true`
  - `subTotalAtEnd: true`
  - `isCrossTable: true`
  - `useFormat: true`, `useDataType: true`, `useTransform: true`
  - `compressEmptyRows: true`
- 固定字段：`modelId` 来自 props，`queryType: 'PivotQuery'`，`engineType: 'MDX'`
- 排序输出：`rowSorts` 单项 `{ _enum: 'MeasureSortEx', measure: { _enum: 'ByMeasure', name: <度量名> }, direction: 'DESC' }`
- **Hierarchy 展开成员路径翻译**（关键算法，见下文 3.1）

### 校验规则

- 必填校验（`modelId`、至少 1 个 measure 在 values）
- 字段名必须在 metadata 里存在（否则报错并提示宿主）
- Hierarchy 内 level 不允许跳级展开

### 3.1 Hierarchy 展开成员路径翻译规则

ViewConfig 里 `rows[].expandedMembers` 记录已展开的成员路径数组，例如：

```json
{
  "fieldName": "custom1624587732438",   // 发货区域 hierarchy
  "type": "Hierarchy",
  "expandedMembers": [
    ["江苏"],                  // 江苏已展开（看到江苏下的发货区域）
    ["江苏", "苏南"]            // 江苏/苏南已展开（看到苏南下的城市）
  ]
}
```

**翻译规则**：

1. 计算需要展示的最深 level：依据 `expandedMembers` 中最长路径长度 + 1，得到目标 level（如长度 2 → 第 3 级 LEVEL_GEO，即"城市"级）
2. `query.rows` 输出顶层 hierarchy 字段名（不展开为多个 level）
3. `query.fields` 中对应的 `DimensionField` 设置 `subTotal: 'HIERARCHY_SHOW'`，让后端按 hierarchy 自动产出各级聚合
4. 在 `query.filters` 中追加约束：只查询展开路径下的子树（即"江苏 IN (江苏)" + "苏南 IN (苏南)"），其他成员不展开

**等价 query 片段示例**：

```json
{
  "rows": ["custom1624587732438"],
  "fields": [
    {
      "_enum": "DimensionField",
      "name": "custom1624587732438",
      "dimension": "custom1624587732438",
      "subTotal": "HIERARCHY_SHOW"
    }
  ],
  "filters": [
    {
      "_enum": "FieldFilter",
      "field": "ShipProvince2",
      "filter": { "_enum": "ByValue", "operator": "In", "value": ["江苏"] }
    }
  ]
}
```

**P0 必备的单元测试 case**（每个至少 1 个）：

- 完全折叠（`expandedMembers: []`）→ 只查省级
- 一层展开（`expandedMembers: [["江苏"]]`）→ 江苏下的发货区域
- 两层展开（`expandedMembers: [["江苏"], ["江苏", "苏南"]]`）→ 江苏/苏南下的城市
- 多省份各自展开（`expandedMembers: [["江苏"], ["浙江"]]`）→ filter 用 In 列表
- 空 hierarchy（hierarchy 内无成员）→ 返回空表

⚠️ **此规则待和后端确认**：MDX 引擎的实际行为可能要求"展开"用 NamedSet 或其他机制，而不是 filter。**P0 启动后第 1 周必须和后端联调确认**。

---

## 4. CellSet 解析（CellSetParser）

**接口签名**

```typescript
function parseCellSet(
  cellSet: CellSet,
  viewConfig: ViewConfig
): RenderModel
```

纯函数。**单元测试覆盖率必须 ≥ 80%**。

### RenderModel 契约

```typescript
interface RenderModel {
  rowHeader: RowHeaderNode[];
  columnHeader: ColumnHeaderCell[];
  matrix: RenderCell[][];                  // 稠密矩阵 [rowIndex][colIndex]
  grandTotalRow?: RenderCell[];
  columnMeta: ColumnMetaData[];
  pagination: { totalRowCount: number };
}

interface RowHeaderNode {
  member: Member;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  rowIndex: number;
  fullPath: string[];                      // 完整路径，用于 hover tooltip
}

interface ColumnHeaderCell {
  fieldName: string;
  alias: string;
  dataFormat: string;
  isMeasure: boolean;
}

interface RenderCell {
  value: unknown;
  formattedValue: string;
  isEmpty: boolean;                        // 稀疏矩阵填充的空格
  isMasked: boolean;                       // maskingRuleIdList 非空时为 true
}
```

**字段来源**：
- `rowHeader` 来自 `CellSet.rows` + viewConfig.展开状态
- `matrix` 来自 `CellSet.data`（重建稀疏 → 稠密，缺失格填 `EMPTY_CELL`）
- `columnHeader` 来自 `CellSet.columns`（P0 列轴只有 measure 时退化为 1 层）
- `columnMeta` 直接复制 `CellSet.columnMetadataArray`
- `RowHeaderNode.fullPath` 来自 `Member.uniqueName`，用于 hover tooltip

### 必做

- 解析 `rowFields` / `columnFields` / `rows` / `columns` / `data`
- 处理稀疏 `Cell[]`：根据 `Cell.row` / `Cell.column` 索引重建二维矩阵
- 解析 `Member.uniqueName`，建立 hierarchy 折叠/展开的成员树
- 解析 `columnMetadataArray`，提取 `dataFormat` / `maskingRuleIdList` / `accessible`
- 区分 CellSet 和 RowSet 两种返回结构（列轴只有度量时是 RowSet），统一适配为 `RenderModel`

---

## 5. 透视表渲染（PivotRenderer）

### 必做

- 行头：根据 hierarchy 展开折叠状态渲染（▶/▼ icon），缩进表示层级
- 列头：扁平渲染（P0 列轴只有 measure）
- 数据区：根据 matrix 渲染 `formattedValue`
- 总计行：粗体 + 浅灰背景，固定在底部（按 `subTotalAtEnd: true`）
- 鼠标悬停单元格：当前行 + 当前列高亮
- **鼠标悬停单元格：显示完整路径 tooltip**（如"江苏 / 苏南 / 南京 — 销售额：123,456"）— 数据来自 `RowHeaderNode.fullPath` 和 `RenderCell.formattedValue`
- 行头点击 ▶/▼：触发新 query（仅查询展开/折叠的子树）
- 表头点击：切换排序方向（降→升→无）

### 视觉规范

- 字号：表头 13px / 数据 13px / 总计 13px bold
- 行高：32px
- 列宽：自适应内容，min 80px，max 200px
- 数字右对齐，文本左对齐，日期左对齐
- 数据脱敏字段（有 maskingRuleIdList）单元格显示 `***` 并加锁图标 tooltip

### 空状态与异常态

| 状态 | UI 表现 | 触发条件 |
|---|---|---|
| 字段树加载中 | 字段树区域骨架屏 | metadata API pending |
| 字段树加载失败 | 整个组件灰底 + 报错 + 重试按钮 | metadata API 失败（阻塞性） |
| 视图为空（未拖任何字段） | 中央提示"从左侧字段树拖拽字段到行/值开始" + 一张示意图 | viewConfig.values 为空 |
| 拖了字段但 query 返回空 | 表格区中央"无数据"提示 + 当前 viewConfig 概要 | CellSet.data 为空 + rows/columns 为空 |
| Query 加载中 | 旧数据淡化（opacity 0.4）+ 中央 spinner | onQuery 进行中 |
| Query 失败 | 旧数据保留 + 顶部 banner 报错 + 重试按钮 | onQuery reject |
| 单元格脱敏 | 单元格显示 `***` + 锁图标 + tooltip | maskingRuleIdList 非空 |
| 字段已删除/重命名 | 该字段标签红色边框 + tooltip 提示，可移除 | viewConfig 引用的字段不在 metadata 里 |

### 不做（P0）

- ❌ 虚拟滚动 — 默认分页 50×50 = 2500 cells，原生 DOM 够用
- ❌ 单元格编辑 — PRD 范围外
- ❌ 多列排序 — P1.5 再做
- ❌ 列宽手动调整 — P1.5 再做
- ❌ 复制单元格 / 选中区域 — P1.0 再做
- ❌ 行/列冻结 — P2 再做

---

## 6. 翻页（Pagination）

### 必做（仅行轴）

- 行轴翻页器（页号、当前/总页数、上/下一页）
- 翻页时保留排序、展开折叠、筛选状态
- 翻页时显示骨架屏 / loading（旧数据淡化、新数据替换）

### P0 不做

- ❌ 列轴翻页器 — 场景 B 列轴只有 1 个 measure，根本不会分页。多 measure 在 P1.0 引入时再加列轴翻页
- ❌ 页大小可调 — P1.0
- ❌ 跳转到指定页 — P1.0

---

## 7. 排序

### 必做

- 表头点击度量列 → 切换排序方向：降序 → 升序 → 无序（三态循环）
- 排序状态在表头显示箭头图标
- 排序后 query 字段：`rowSorts: [{ _enum: 'MeasureSortEx', measure: { _enum: 'ByMeasure', name: <度量名> }, direction: 'DESC' }]`

### P0 不做

- ❌ 维度排序 — P1.0
- ❌ 多列排序 — P1.5

---

## 8. 工具栏（ToolBar）

### 必做

- **刷新**：清 L0/L1 缓存 + 透传 `cacheType: CLEAR` + 重新查询
- **导出 CSV**：当前视图（表头别名、formattedValue、含总计行）

### 调试能力（非产品功能）

- **viewConfig JSON 导出**：仅当 URL 带 `?debug=true` 时显示在工具栏右侧。**不向业务人员暴露**，仅供工程/PM 排查问题

---

## 9. P0 上线验收

### 功能验收

- [ ] 字段树正确显示所有 dimension/measure（**NamedSets 显示但不可拖**）
- [ ] 不可见（visible:false）字段不显示
- [ ] 不可访问（accessible:false）字段置灰
- [ ] 拖拽 hierarchy 到行轴，hierarchy 内任何字段能展开/折叠
- [ ] 钻取 3 层后能完全折叠回顶层
- [ ] 拖拽 measure 到数值，显示正确的聚合值和 dataFormat
- [ ] 总计行显示且数值正确
- [ ] 表头点击切换排序，UI 状态显示正确
- [ ] 翻页时排序、展开状态保留
- [ ] 鼠标悬停单元格显示完整路径 tooltip
- [ ] CSV 导出格式正确（字段名用 alias、数值带格式、含总计行）
- [ ] viewConfig 序列化/反序列化无信息丢失
- [ ] 嵌入到一个真实业务系统并跑通
- [ ] 字段无权限时正确置灰
- [ ] 数据脱敏字段显示 `***` + 锁图标

### 性能验收

- [ ] 默认视图首屏 < 2 秒
- [ ] 钻取响应（前端开销）< 100ms
- [ ] 翻页响应（前端开销）< 100ms
- [ ] 渲染 2500 单元格 < 200ms

### 用户验收

- [ ] 3 个真实业务用户连续 2 周每周使用 ≥ 2 次
- [ ] 主观可用性评分 ≥ 4（5 点量表）
- [ ] 用户对比 Smartbi 同等场景，明确认可"更好用"

### 测试覆盖率

- [ ] QueryBuilder 单元测试 ≥ 80%
- [ ] CellSetParser 单元测试 ≥ 80%
- [ ] hierarchy 展开成员翻译的所有 case 都有测试

### 埋点验收

- [ ] [3-nfr-backend.md](3-nfr-backend.md) 第 7 节列出的 10 个 P0 埋点全部触发
- [ ] 埋点数据在数据团队后台可见
