# Phase P1 — 实施清单

> **📍 实施状态**：✅ **已交付**（P1.0 + P1.5 全部）
> 关键模块：`core/filterTree/`、`core/viewConfig/setFilters.ts`、`hooks/useViewConfig.ts`（含 history）、`components/FilterPanel/`、`components/FilterModal/`、`components/MeasureFilterModal/`、`core/export/csvExport.ts` + xlsx 导出。
>
> **场景**：场景 C — 产品 Top10 + 占比
> **拆分**：P1.0（基础能力）+ P1.5（高级增强）
> **估时**：P1.0 = 3-4 周，P1.5 = 3-4 周
> **场景描述**：见 [1-product.md](1-product.md) 第 3.2 节

---

## P1.0 — 基础能力

### 1. 字段树增量

- ⭐ 字段右键菜单（"添加到行/列/筛选/数值"），快速放置
- 收藏字段（保存在 localStorage）
- 最近使用（自动记录最近 10 个）

### 2. 拖拽规则增量（P1.0 激活）

| 字段类型 | 行轴 | 列轴 | 数值 | 筛选 |
|---|---|---|---|---|
| Dimension（LEVEL/FIELD/GEO） | ✅ | ✅ | ❌ | ✅ **P1.0** |
| CalcGroup（预定义维度分组） | ✅ | ✅ | ❌ | ✅ **P1.0** |

**数值区可放多个 measure**（取消 P0 限制）。

### 3. 查询构建增量

- `filters` 字段：FieldFilter + Filter 子句构造，**仅支持平铺 And（无嵌套）**
- `measureFilters` 字段：度量筛选（用于 top-N）
- `MeasureField.quickCalc` 字段（5 种基础 quickCalc）

### 4. 透视表渲染增量

- 单元格右键菜单（仅"复制"，钻取明细在 P3 加入）
- 复制选中区域到剪贴板（TSV 格式）

### 5. 翻页增量

- **列轴翻页器**（多 measure 出现后才有意义）
- 页大小可调（10/20/50/100）
- 跳转到指定页

### 6. 筛选（FilterPanel）— P1.0 起

P0 不开放筛选 UI，P1.0 引入。

#### P1.0 必做

- 筛选区显式呈现，支持拖拽维度进入
- 维度筛选：In / NotIn / Equals / NotEquals + 成员选择器（带搜索）
- 度量筛选：GreaterThan / LessThan / Between + 数值输入
- **仅支持单层 And 平铺组合**，不支持 Or 和嵌套
- 已应用的筛选用 chip 形式显示在表格上方

### 7. 快速计算（QuickCalc）— P1.0 起

业务语言映射是这个模块的核心。**严禁把后端枚举直接暴露给用户**。

#### P1.0 必做（5 个）

| 后端枚举 | UI 显示名 | 默认参数 |
|---|---|---|
| `RowGlobalPercent` | 占行总计 % | — |
| `ColumnGlobalPercent` | 占列总计 % | — |
| `TotalPercent` | 占总计 % | — |
| `GlobalRankDescending` | 排名（从大到小） | — |
| `CumulativeValue` | 累计值 | 沿当前时间维度 |

UI 形式：度量字段标签上点击 → 弹出"快速计算"菜单 → 选择上述 5 项之一。选中后字段标签上显示当前 quickCalc 名称，可移除。

### 8. 排序增量

- 维度排序（按维度成员字典序，A-Z / Z-A）— 表头点击维度列也触发

### 9. 工具栏增量

无（Excel 导出在 P1.5）

### 10. Component API 事件增量

- `onCellClick` — 单元格点击事件，宿主可做联动

---

## P1.5 — 高级增强

### 1. 透视表渲染增量

- 列宽手动拖拽
- 行/列冻结（可能延到 P2）

### 2. 翻页

无新增

### 3. 筛选（FilterPanel）增量

- **And / Or 嵌套组合（最多 1 层嵌套）**

### 4. 排序增量

- **多列排序**（shift+click 第二列）

### 5. 工具栏增量

- **导出 Excel**（带 dataFormat 的格式）
- **视图保存**：命名 + 列表 + 删除（依赖宿主提供存储 — 见 [1-product.md](1-product.md) 阻塞项 7）
- **视图分享链接**（依赖宿主路由）

### 6. NamedSet 拖入

| 字段类型 | 行轴 | 列轴 | 数值 | 筛选 |
|---|---|---|---|---|
| NamedSet | ✅ **P1.5** | ✅ **P1.5** | ❌ | ✅ **P1.5** |

NamedSet 拖到行/列：作为预定义的"维度成员子集"使用；拖到筛选：一键应用预定义筛选。

### 7. Component API 事件增量

- `onCellRightClick` — 单元格右键事件
- `features.export: 'xlsx'` 开启 Excel 导出
- Imperative API 增加 `exportToXlsx(): Blob`

### 8. 视图管理（ViewManager）

- 受 P1.5 阻塞项 7 影响：依赖宿主提供视图存储接口
- 组件提供 UI（保存/列表/删除/重命名），存储动作由宿主在 `onViewSave` / `onViewLoad` / `onViewDelete` 回调内实现

---

## P1 上线验收

### P1.0 验收

- [ ] 多 measure 同时显示，每个独立排序
- [ ] 筛选 chip 准确反映当前筛选条件
- [ ] 5 个 quickCalc 全部可用，UI 显示业务语言（不暴露后端枚举）
- [ ] top-N 通过 measureFilter 实现
- [ ] 列轴翻页正常
- [ ] 字段右键菜单快速放置
- [ ] 收藏 + 最近使用 持久化在 localStorage

### P1.5 验收

- [ ] And/Or 嵌套筛选 UI 可用
- [ ] 多列排序按优先级生效
- [ ] Excel 导出带 dataFormat（百分比、千分位、日期格式）
- [ ] 视图保存/加载完整循环
- [ ] NamedSet 拖到行/列/筛选都生效

### 性能验收

- [ ] 多 measure 场景下 quickCalc 不显著拖慢 query（< 150% 单 measure 时间）
- [ ] 列轴翻页响应（前端开销）< 100ms

### 用户验收

- [ ] 场景 C 端到端可用
- [ ] 至少 3 个种子用户每周使用 ≥ 2 次，连续 2 周
