# 2. 架构与组件 API

> **📍 实施状态**：术语表 + 组件 API 已落地。新增了一些原 PRD 未列的核心组件 — 见第 3 节"核心组件"表，已加 ✅ 标记。

## 1. 通用语言（Ubiquitous Language）— 锁定的术语表

下表是产品全周期的术语锚点。**代码、文档、UI 文案、口头讨论必须一致**，不允许第二种叫法。

### 1.1 核心概念

| 术语 | 定义 | 不允许使用的同义词 |
|---|---|---|
| Metadata | 数据集元数据，从 Smartbi metadata API 获取 | schema, model, dataset |
| FieldTree | 字段树，metadata 的 UI 形态 | 字段面板, 维度面板 |
| Dimension | 维度字段 | row field, group key |
| Measure | 度量字段 | metric, indicator, KPI |
| Hierarchy | 维度层级（如本项目场景 B 的"省→发货区域→城市"） | drill path, level group |
| Level | Hierarchy 中的某一级 | tier |
| NamedSet | 命名集（预定义维度成员子集） | preset filter |
| CalcMeasure | 计算度量（**后端预定义**，前端只读使用） | derived metric |
| **CalcGroup** | 维度分组字段（**后端预定义**，对应 metadata 中 `CALC_GROUP`/`CalcGroup` 类型） | grouping dimension |
| **CustomField** | 用户在透视表内自建的字段（计算度量、枚举分组、范围分组的统称） | user-defined field |
| **FieldExpression** | 字段表达式（用户写的 `[A] - [B]` 这种） | formula, calc |
| **EnumGroup** | 用户自建的枚举分组（按成员归类） | category |
| **RangeGroup** | 用户自建的范围分组（按数值区间） | bucket, bin |
| ViewConfig | 视图配置，序列化为 JSON | layout, view spec, state |
| Query | 后端查询请求（按 query-schema） | request |
| CellSet | 后端返回的二维结果集 | result, response |
| Cell | 单元格 | — |
| QuickCalc | 快速计算（占比/排名/同比/环比等） | calculated metric, table calc |
| Drill | 沿 hierarchy 展开/折叠 | expand/collapse |
| DrillThrough | 钻取到底层明细数据 | detail query |

### 1.2 ViewConfig 子字段命名（锁定）

ViewConfig 是组件内部和宿主交互的最重要数据结构。**字段命名锁定如下，不允许第二种写法**。

| 字段路径 | 类型 | 说明 |
|---|---|---|
| `rows[]` | `RowField[]` | 行轴字段 |
| `rows[].fieldName` | string | 字段标识（metadata 里的 `name`） |
| `rows[].type` | `'Hierarchy' \| 'Dimension' \| 'CalcGroup' \| 'NamedSet' \| 'EnumGroup' \| 'RangeGroup'` | 字段类型 |
| `rows[].expandedMembers` | `string[][]` | hierarchy 已展开的成员路径数组（仅 type=Hierarchy 时有意义） |
| `columns[]` | `ColumnField[]` | 列轴字段（结构同 rows） |
| `values[]` | `ValueField[]` | 数值区字段 |
| `values[].measureName` | string | measure 标识 |
| `values[].aggregator` | `Aggregator \| null` | 显式覆盖聚合方式（null 表示用 metadata 默认） |
| `values[].quickCalc` | `QuickCalculation \| null` | 快速计算（P1+） |
| `filters[]` | `ClientFilter[]` | 筛选条件（P1+），**前端嵌套树类型，不是后端 Filter**。详见 engineering/p1-dev.md 第 2.4 节 |
| `rowSorts[]` | `Sort[]` | 行轴排序 |
| `columnSorts[]` | `Sort[]` | 列轴排序 |
| `pageState` | `PageState` | 翻页状态 |
| `customFields[]` | `CustomField[]` | 用户自建字段（P2+，详见 phase-p2.md） |
| `extensions` | `object \| null` | 扩展位（向后兼容） |

**关键命名规则**（防止 v1.2 那种 `expanded` vs `expandedMembers` 的不一致）：
- 字段标识统一用 `fieldName`，**不允许** `field` / `name` / `id`
- 度量标识统一用 `measureName`，**不允许** `measure` / `metric`
- 已展开成员统一用 `expandedMembers`，**不允许** `expanded` / `expandedNodes`

---

## 2. 数据流

```
[Metadata API]
      ↓
[FieldTree UI] ←──── [User Drag/Drop]
      ↓                      ↓
      └──────→ [ViewConfig] ←┘
                  ↓
            [QueryBuilder]   ← (纯函数)
                  ↓
              [Query]
                  ↓
        [Backend Query API]
                  ↓
             [CellSet]
                  ↓
         [CellSetParser]   ← (纯函数)
                  ↓
          [PivotRenderer]
                  ↓
                [DOM]
```

每一层**除 Backend 调用外都是纯函数**，便于单测和复用。

P2 引入两个旁路编辑器，输出修改 ViewConfig：

```
[FieldTree UI] → [FieldExpressionEditor]   → 修改 viewConfig.customFields
              ↘ [DimensionGroupingEditor]  → 修改 viewConfig.customFields
```

---

## 3. 核心组件

| 组件 | 职责 | 引入 Phase | 状态 |
|---|---|---|---|
| FieldTree | 字段树 UI + 拖拽源 | P0 | ✅ |
| DropZones | 四象限拖拽区 + 字段标签管理 | P0 | ✅ |
| QueryBuilder | viewConfig → query 的纯函数 | P0 | ✅ |
| CellSetParser | CellSet → RenderModel 的纯函数 | P0 | ✅ |
| PivotRenderer | 渲染表头、行头、数据区 | P0 | ✅ |
| Pagination | 翻页器（P0 仅行轴，P1.0 加列轴） | P0 | ✅ |
| Toolbar | 顶部工具栏（导出/刷新/模式切换/浏览/设置） | P0 | ✅ |
| FilterPanel + FilterTree | 筛选面板 + 嵌套筛选编辑器 | P1.0/P1.5 | ✅ |
| FilterModal / MeasureFilterModal | 筛选 / 度量筛选弹窗 | P1.0/P3 | ✅ |
| MemberSelector | 维度成员选择器（带搜索/分页） | P1.0 | ✅ |
| QuickCalcMenu | 快速计算菜单（P1: 5 种 + P2: 时间智能 4 种） | P1.0/P2 | ✅ |
| ViewManager | 视图保存/加载（callback props） | P1.5 | ✅ |
| **FieldExpressionEditor** | 字段表达式编辑器（计算度量 + calc_column） | P2 | ✅ |
| **EnumGroupEditor** / **RangeGroupEditor** | 维度分组编辑器（独立实现，按 ADR-010） | P2 | ✅ |
| ConditionalFormatModal | 条件格式 4 种规则编辑器 | P4+ | ✅ |
| ChartRenderer | 联动图表（echarts: bar/line/pie） | P4+ | ✅ |
| **DetailRenderer** | 即席查询模式（adhoc）平铺渲染 | 超 PRD | ✅ |
| **DetailModal** | 钻取明细弹窗（drill-through） | P3 | ✅ |
| **TreeRenderer** | 树状显示模式（lazy-load） | 超 PRD | ✅ |
| **SettingsModal** | 设置弹窗（总计/小计/冻结/翻页/显示模式 等） | 超 PRD | ✅ |
| **ContextMenu** | 通用右键菜单系统（嵌套支持 + 边缘自动翻转） | 超 PRD | ✅ |
| **ErrorBoundary** | 组件级错误边界 | 超 PRD | ✅ |

---

## 4. Component API

### 4.1 Props

```typescript
interface PivotTableProps {
  // ===== 必填 — P0 =====
  /** 数据模型 ID */
  modelId: string;
  /** 整个 metadata 对象，宿主负责获取并传入 */
  metadata: Metadata;
  /**
   * 查询函数，宿主负责调接口（鉴权、L2 业务缓存、错误处理）
   * ctx.signal 由组件传入用于取消（见工程文档 ADR-011）
   * 宿主**强烈建议**把 signal 转给 fetch/axios 实现真正取消，否则被取消的 query 仍占后端资源
   */
  onQuery: (q: Query, ctx?: { signal: AbortSignal }) => Promise<CellSet>;

  // ===== 视图配置 — P0 =====
  /** 受控模式 */
  value?: ViewConfig;
  /** 非受控模式默认值 */
  defaultValue?: ViewConfig;
  /**
   * 视图配置变化回调
   * 触发时机：用户操作完成且 viewConfig 实际改变时（拖拽放下、字段配置确认、排序切换、展开/折叠等）
   * 不触发：纯 UI 状态变化（hover、loading）、query 进行中状态、错误态
   * 调用频率：连续拖拽时按操作合并触发（不会每次像素移动都回调）
   */
  onChange?: (v: ViewConfig) => void;

  // ===== 默认值 — P0 =====
  /** 预设筛选，P0 无 UI，靠这个兜底 */
  defaultFilters?: Filter[];
  /** 覆盖默认 PageSettings */
  pageSettings?: Partial<PageSettings>;

  // ===== 容器与样式 — P0 =====
  /** 外层容器自定义 className */
  className?: string;
  /** 外层容器 style */
  style?: React.CSSProperties;
  /** 高度策略：'auto'(随内容) | 'fill'(填充父容器) | number(固定 px)。默认 'fill' */
  height?: 'auto' | 'fill' | number;

  // ===== Loading 控制 — P0 =====
  /** 受控 loading 状态。不传时由组件自管理 */
  loading?: boolean;
  /** 自定义 loading 渲染 */
  loadingRender?: () => React.ReactNode;

  // ===== 主题与本地化 — P0 =====
  /** CSS variables 主题 */
  theme?: ThemeConfig;
  /** 本地化 — P0 仅支持 zh-CN */
  locale?: 'zh-CN' | 'en-US';

  // ===== 事件 — P0/P1+ =====
  /** 错误回调 — P0【强烈推荐】，不传时错误只在组件内显示 */
  onError?: (err: Error) => void;
  /** 埋点回调 — P0【强烈推荐】，不传时埋点丢失（见 3-nfr-backend.md 埋点节） */
  onTrack?: (event: string, properties: Record<string, unknown>) => void;
  /** 单元格点击 — P1.0 */
  onCellClick?: (cell: Cell, rowMember: Member[], colMember: Member[]) => void;
  /** 单元格右键 — P1.5 */
  onCellRightClick?: (cell: Cell, rowMember: Member[], colMember: Member[]) => void;
  /** 钻取明细请求 — P3 */
  onDrillThrough?: (query: Query) => void;

  // ===== 能力开关 — P1+ =====
  features?: {
    quickCalc?: boolean;          // P1.0
    customFilter?: boolean;       // P1.0（基础）/ P1.5（嵌套）
    export?: 'csv' | 'xlsx' | false;  // P0: csv, P1.5: xlsx
    fieldExpression?: boolean;    // P2
    customGrouping?: boolean;     // P2
    drillThrough?: boolean;       // P3
    conditionalFormat?: boolean;  // P4+
  };

  // ===== 高级 — P1+ =====
  /** 缓存策略，控制 L0/L1 缓存（见 3-nfr-backend.md 缓存节） */
  cacheType?: 'CACHE' | 'UNCACHE' | 'CLEAR';
}
```

**P0 必填 vs 可选优先级**：

| 等级 | Prop | 不传的后果 |
|---|---|---|
| 必填 | `modelId`, `metadata`, `onQuery` | 组件无法工作 |
| 强烈推荐 | `onError`, `onTrack` | 错误用户看不到；埋点丢失，1.4 成功度量无法测量 |
| 推荐 | `value`/`defaultValue`, `onChange` | 视图无初始状态、无法保存用户操作 |
| 可选 | 其余 | 用合理默认 |

### 4.2 Slots — P2+

- `cellRenderer`：自定义单元格渲染
- `headerRenderer`：自定义表头渲染
- `emptyState`：空数据态自定义

### 4.3 Imperative API — P1+

```typescript
interface PivotTableRef {
  refresh(): void;
  getViewConfig(): ViewConfig;
  setViewConfig(v: ViewConfig): void;
  exportToCsv(): string;
  exportToXlsx(): Blob;  // P1.5
}
```

---

## 5. 嵌入示例

```tsx
// 业务系统使用方式（P0）
import { PivotTable } from '@company/pivot-table';

function MyPage() {
  return (
    <PivotTable
      modelId="Iff808081017e71197119e7d2017e7124d5b70006"
      metadata={metadata}
      defaultValue={{
        rows: [
          {
            fieldName: 'custom1624587732438',  // 发货区域 hierarchy
            type: 'Hierarchy',
            expandedMembers: [['江苏']]        // 默认展开江苏
          }
        ],
        columns: [],
        values: [
          {
            measureName: '销售额_1624531356707',
            aggregator: null,
            quickCalc: null
          }
        ],
        filters: [],
        rowSorts: [
          {
            type: 'ByMeasure',
            measureName: '销售额_1624531356707',
            direction: 'DESC'
          }
        ],
        columnSorts: [],
        pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
        customFields: [],
        extensions: null
      }}
      onQuery={async (q, ctx) => {
        const res = await fetch('/api/pivot/query', {
          method: 'POST',
          body: JSON.stringify(q),
          signal: ctx?.signal,  // 推荐：让组件能真正取消请求
        });
        return res.json();
      }}
      onChange={(v) => console.log('view changed', v)}
      onError={(e) => message.error(e.message)}
      onTrack={(event, props) => analytics.track(event, props)}
    />
  );
}
```

完整 ViewConfig schema 见 [appendices.md](appendices.md) 附录 A。
