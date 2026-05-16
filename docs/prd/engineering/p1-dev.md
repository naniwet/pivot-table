# P1 开发与测试设计

> **📍 实施状态**：✅ **P1.0 + P1.5 全部已交付**。
>
> 实现位置：`core/filterTree/`、`core/viewConfig/`（含 setFilters/setMeasureFilters/cycleRowSort 等 reducer 操作）、`hooks/useViewConfig.ts`（含 history 撤销/重做）、`components/FilterPanel/`、`components/FilterModal/`、`components/MeasureFilterModal/`、`core/export/csvExport.ts` + xlsx 导出。

> 实现 [phase-p1.md](../phase-p1.md) 定义的 P1.0 + P1.5。
> 沿用 P0 建立的 TDD 节奏、文件结构、测试基础设施（详见 [p0-dev.md](p0-dev.md)）。
> **本文件仅描述增量**，非新增的部分不重复。

| 字段 | 内容 |
|---|---|
| 估时 | P1.0 = 3-4 周，P1.5 = 3-4 周 |
| 关键产出 | 多 measure、5 quickCalc、filter UI（无嵌套→嵌套）、视图保存 |

---

## P1.0 — 基础能力

### 1. 关键架构决策（ADR）

#### ADR-008：视图保存采用宿主 Callback Props（vs Imperative Handle）

**Status**: Proposed
**Decider**: Frontend Tech Lead, PM

**Context**

P1.5 引入"视图保存"。视图存储位置（localStorage / 后端 API / 业务系统数据库）依赖宿主，组件不应该绑死实现。

**Options**

| 选项 | 优点 | 缺点 |
|---|---|---|
| A. Callback Props（选定）：onViewSave/Load/Delete | 单向数据流；宿主写少量胶水即可；测试容易 mock | 宿主必须传齐 3 个 callback 才能用 |
| B. Imperative Handle：`ref.current.save(name)` 由父调用 | 父组件可主动触发保存（如外部按钮） | 命令式风格违背 React 数据流；测试需要 ref + forwardRef |
| C. 组件内置 localStorage | 0 集成成本 | 无法跨设备同步；存储容量有限；和宿主权限脱节 |

**Decision**

选 **A：Callback Props**。**不**用 useImperativeHandle。

```typescript
interface ViewManagerProps {
  onViewSave?: (name: string, viewConfig: ViewConfig) => Promise<{ id: string }>;
  onViewLoad?: () => Promise<Array<{ id: string; name: string; viewConfig: ViewConfig }>>;
  onViewDelete?: (id: string) => Promise<void>;
}
```

宿主未提供 callback 时：组件保存按钮置灰，hover 提示"宿主未配置存储"。

**Trade-off**

| 维度 | 评估 |
|---|---|
| 灵活性 | 高，宿主完全控制存储介质和权限 |
| 开发成本 | 中，宿主写 3 个 callback（约 50 行胶水） |
| 默认体验 | 低，未传 callback 时按钮置灰（明确告知宿主"需要接入"） |
| 测试 | 易，mock 三个 callback 即可 |

**Reference Implementation: localStorage 样板**

为降低宿主接入门槛，组件包**导出**一份 `createLocalStorageViewStore()` 工具函数（**不是组件内置存储**），宿主可以一行接入：

```typescript
import { PivotTable, createLocalStorageViewStore } from '@company/pivot-table';

const store = createLocalStorageViewStore({ keyPrefix: 'myapp', maxViews: 50 });

<PivotTable
  onViewSave={store.save}
  onViewLoad={store.load}
  onViewDelete={store.delete}
  ...
/>
```

这样宿主**有选择权**：用工具函数（local 存储 demo）/ 写自己的（接后端接口）/ 不用（不传 callback）。组件本身保持纯 callback 模式，没有内置存储副作用。

**Action Items**

- [ ] P1.0 启动前，PM 和后端确认是否提供视图存储接口（[1-product.md](../1-product.md) 阻塞项 7）
- [ ] 如有后端接口 → 写宿主接入示例
- [ ] 实现并发布 `createLocalStorageViewStore` 工具函数（容量约 5MB，最多 50 个视图）作为 demo

---

### 2. 模块增量

#### 2.1 拖拽规则（DROP_RULES 数据驱动表更新）

仅修改数据，**无需改 canDrop 函数**：

```typescript
export const DROP_RULES: Record<FieldType, Record<DropZone, boolean>> = {
  Dimension:    { row: true,  column: true,  value: false, filter: true  }, // ✏️ filter 改 true
  Hierarchy:    { row: true,  column: true,  value: false, filter: false },
  CalcGroup:    { row: true,  column: true,  value: false, filter: true  }, // ✏️
  Measure:      { row: false, column: false, value: true,  filter: false },
  CalcMeasure:  { row: false, column: false, value: true,  filter: false },
  // ...
};
```

**TDD**：直接在 `dropRules.test.ts` 加 case，更新已有 it.each 表（**这就是数据驱动的好处**）。

#### 2.2 多 measure 支持

QueryBuilder `translateValueFields` 已经是数组，**无需改主逻辑**。仅去掉 P0 添加的 "数值区只能 1 个 measure" 限制。

**TDD**

```typescript
describe('translateValueFields', () => {
  it('should support multiple measures', () => {
    const values: ValueField[] = [
      { measureName: '销售额', aggregator: null, quickCalc: null },
      { measureName: '订单量', aggregator: null, quickCalc: null },
    ];
    expect(translateValueFields(values)).toEqual([
      { _enum: 'MeasureField', name: '销售额', measure: '销售额' },
      { _enum: 'MeasureField', name: '订单量', measure: '订单量' },
    ]);
  });
});
```

#### 2.3 列轴翻页

**新增**：`Pagination` 组件加列轴翻页器。

**TDD**

```typescript
describe('Pagination', () => {
  it('should render row pagination only when no column measures', () => {});
  it('should render both row and column pagination when multi measure', () => {});
  it('should call onPageChange with correct axis when clicking', () => {});
  it('should support page size change to [10/20/50/100]', () => {});
});
```

#### 2.4 FilterPanel — 基础

> ⚠️ **类型规约**：前端筛选状态用 `ClientFilter`（嵌套树结构），**不直接用后端 query-schema 的 `Filter`**。原因：前端有"用户编辑中但未应用"等中间状态，且嵌套结构 P1.0/P1.5 都用得到。
> ViewConfig.filters 的类型从 P1.0 起统一是 `ClientFilter[]`（已在 [2-architecture.md](../2-architecture.md) 1.2 节锁定）。
> P1.5 的"嵌套 And/Or" 不需要换类型 —— ClientFilter 已经是嵌套树。

**ClientFilter 定义**（P1.0 起就建模完整，P1.0 不暴露 group 节点）

```typescript
// types/clientFilter.ts
export type ClientFilter =
  | { kind: 'leaf'; field: string; operator: BinaryOperator; value: FilterLiteral }
  | { kind: 'group'; op: 'And' | 'Or'; children: ClientFilter[] };
```

**Contract**

```typescript
interface FilterPanelProps {
  metadata: Metadata;
  filters: ClientFilter[];                          // 顶层数组隐式 And
  onFilterChange: (filters: ClientFilter[]) => void;
  /** P1.0 = false（仅平铺 leaf），P1.5 = true（开放 group 嵌套） */
  allowNested?: boolean;
}
```

**TDD 测试矩阵**

| # | Case | 验收 |
|---|---|---|
| 1 | 拖维度到筛选区 | 弹出成员选择器 |
| 2 | In/NotIn + 多选成员 | 生成 ClientFilter leaf 节点 |
| 3 | 度量筛选 + GreaterThan/Between | 生成 ClientFilter leaf with ByMeasure-type field |
| 4 | 已应用筛选显示为 chip | chip 文本 + ✕ 移除 |
| 5 | 多个 leaf 在顶层数组 | filters.length == n（顶层隐式 And） |
| 6 | 不允许 Or（P1.0） | allowNested=false 时 UI 不暴露 Or/group 选项 |

**QueryBuilder 增量**

```typescript
// core/queryBuilder/translators/filter.ts
export function translateFilters(filters: ClientFilter[]): FieldFilter[] {
  // P1.0: 仅 leaf 节点，每个 leaf 一项
  // P1.5: 递归处理 group，构造 Filter.And/Or 嵌套
  return filters.flatMap(translateOne);
}

function translateOne(cf: ClientFilter): FieldFilter[] {
  if (cf.kind === 'leaf') {
    return [{
      _enum: 'FieldFilter',
      field: cf.field,
      filter: { _enum: 'ByValue', operator: cf.operator, value: cf.value },
    }];
  }
  // P1.5 实现 group → Filter.And/Or 嵌套
  throw new Error('Group filters not supported in P1.0');
}
```

测试：

```typescript
describe('translateFilters', () => {
  it.each([
    [
      'equals leaf',
      [{ kind: 'leaf', field: 'A', operator: 'Equals', value: 1 } as ClientFilter],
      [{ _enum: 'FieldFilter', field: 'A', filter: { _enum: 'ByValue', operator: 'Equals', value: 1 } }],
    ],
    [
      'in leaf',
      [{ kind: 'leaf', field: 'A', operator: 'In', value: [1, 2, 3] } as ClientFilter],
      [{ _enum: 'FieldFilter', field: 'A', filter: { _enum: 'ByValue', operator: 'In', value: [1, 2, 3] } }],
    ],
    [
      'greater than leaf',
      [{ kind: 'leaf', field: 'A', operator: 'GreaterThan', value: 100 } as ClientFilter],
      [{ _enum: 'FieldFilter', field: 'A', filter: { _enum: 'ByValue', operator: 'GreaterThan', value: 100 } }],
    ],
  ])('case: %s', (_name, input, expected) => {
    expect(translateFilters(input)).toEqual(expected);
  });

  it('should produce flat array (no And/Or wrapper) for leaf-only filters', () => {
    const input: ClientFilter[] = [
      { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
      { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
    ];
    expect(translateFilters(input)).toHaveLength(2);
  });

  it('should throw on group filter (P1.0 limitation)', () => {
    const input: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [/* ... */] }
    ];
    expect(() => translateFilters(input)).toThrow(/Group filters not supported in P1.0/);
  });
});
```

#### 2.5 QuickCalcMenu

**Contract**

```typescript
interface QuickCalcMenuProps {
  measureField: ValueField;
  onQuickCalcChange: (qc: QuickCalculation | null) => void;
}
```

**关键：业务语言映射表**

```typescript
// components/QuickCalcMenu/quickCalcLabels.ts
export const QUICK_CALC_LABELS_P1: Array<{ enum: string; label: string }> = [
  { enum: 'RowGlobalPercent', label: '占行总计 %' },
  { enum: 'ColumnGlobalPercent', label: '占列总计 %' },
  { enum: 'TotalPercent', label: '占总计 %' },
  { enum: 'GlobalRankDescending', label: '排名（从大到小）' },
  { enum: 'CumulativeValue', label: '累计值' },
];
```

**TDD**

```typescript
describe('QuickCalcMenu', () => {
  it('should display business labels (not backend enum names)', () => {
    render(<QuickCalcMenu measureField={...} onQuickCalcChange={vi.fn()} />);
    expect(screen.getByText('占行总计 %')).toBeInTheDocument();
    expect(screen.queryByText('RowGlobalPercent')).not.toBeInTheDocument();
  });

  it('should call onQuickCalcChange with backend enum on click', async () => {
    const onChange = vi.fn();
    render(<QuickCalcMenu measureField={...} onQuickCalcChange={onChange} />);
    await userEvent.click(screen.getByText('占行总计 %'));
    expect(onChange).toHaveBeenCalledWith({ _enum: 'RowGlobalPercent' });
  });

  it('should remove quickCalc when clicking the active option again', async () => {});

  it('should display current quickCalc label on field tag', () => {});
});
```

#### 2.6 排序 — 维度排序

QueryBuilder `translateSorts` 增量支持 `DimensionSortEx`。

**TDD**

```typescript
describe('translateSorts', () => {
  it('should produce DimensionSortEx for ByDimension sort', () => {
    const sorts: Sort[] = [{ type: 'ByDimension', fieldName: 'ShipProvince', direction: 'ASC' }];
    expect(translateSorts(sorts, [])).toEqual([
      { _enum: 'DimensionSortEx', dimension: 'ShipProvince', direction: 'ASC' }
    ]);
  });
});
```

---

### 3. P1.0 完成定义

- [ ] 新增模块 vitest 覆盖率 ≥ 80%
- [ ] 多 measure 在场景 C 跑通（产品 Top10 + 占比）
- [ ] 5 个 quickCalc UI 显示业务语言
- [ ] 简单 filter 端到端可用（pop-up 选成员 / 数值输入）
- [ ] 列轴翻页正常
- [ ] E2E 加场景 C 用例
- [ ] 至少 3 个种子用户每周使用 ≥ 2 次

---

## P1.5 — 高级增强

### 1. 模块增量

#### 1.1 FilterPanel — 嵌套 And/Or

> ✅ ClientFilter 类型 P1.0 已经按嵌套树设计（见 P1.0 第 2.4 节），**P1.5 不需要新类型**，仅开放 group 节点的 UI。

**Contract 扩展**（仅加开关）

```typescript
interface FilterPanelProps {
  // ...
  allowNested?: boolean;  // P1.0 false / P1.5 true
  maxNestingDepth?: number;  // 默认 1（P1.5 限制最深 1 层）
}
```

**P1.5 工作量**：
1. UI 加"+ 添加分组"按钮（仅 allowNested=true 时显示）
2. UI 加 group 节点的渲染（嵌套缩进 + And/Or 切换）
3. QueryBuilder `translateFilters` 删除 `throw new Error('Group filters not supported in P1.0')`，实现 group → `Filter.And/Or` 嵌套

**TDD**

```typescript
describe('translateFilters with nesting', () => {
  it('should translate leaf filter', () => {
    const filter: ClientFilter = { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 };
    expect(translateFilters([filter])).toEqual([{
      _enum: 'FieldFilter',
      field: 'A',
      filter: { _enum: 'ByValue', operator: 'Equals', value: 1 }
    }]);
  });

  it('should translate And group', () => {
    const filter: ClientFilter = {
      kind: 'group',
      op: 'And',
      children: [
        { kind: 'leaf', field: 'A', operator: 'Equals', value: 1 },
        { kind: 'leaf', field: 'B', operator: 'Equals', value: 2 },
      ]
    };
    // 期望产生 Filter.And 嵌套
  });

  it('should translate Or group', () => {});

  it('should reject nesting depth > maxNestingDepth', () => {});
});
```

#### 1.2 多列排序

QueryBuilder 输出 `rowSorts` 数组多项，按用户点击顺序排列。

**TDD**

```typescript
it('should preserve sort order in array', () => {
  const sorts: Sort[] = [
    { type: 'ByMeasure', measureName: '销售额', direction: 'DESC' },
    { type: 'ByMeasure', measureName: '利润', direction: 'ASC' },
  ];
  const out = translateSorts(sorts, []);
  expect(out).toHaveLength(2);
  expect(out[0].measure).toMatchObject({ name: '销售额' });
});

describe('PivotRenderer multi-sort UI', () => {
  it('should add second sort on shift+click', () => {});
  it('should display sort priority numbers', () => {});
});
```

#### 1.3 Excel 导出

**Contract**

```typescript
interface ExcelExporter {
  export(renderModel: RenderModel, columnMeta: ColumnMetaData[]): Blob;
}
```

**关键**：dataFormat 翻译为 Excel 格式串（百分比 → `0.00%`、千分位 → `#,##0` 等）。

**库选**：SheetJS（xlsx），不引 ExcelJS（更重）。

**TDD**

```typescript
describe('exportToXlsx', () => {
  it('should output cells with formatted values', () => {});
  it('should apply percent format for "百分比" dataFormat', () => {
    const blob = exporter.export(rm, [{ name: 'rate', dataFormat: '百分比', /* ... */ }]);
    // 解析 blob 验证 number format 是 '0%' 或类似
  });
  it('should include grand total row', () => {});
  it('should output column header from alias', () => {});
});
```

#### 1.4 ViewManager

依赖 ADR-008。

**TDD**

```typescript
describe('ViewManager', () => {
  it('should call onViewSave with name + current viewConfig', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'v1' });
    const currentViewConfig = buildViewConfig({ rows: [buildHierarchyRow()] });
    render(
      <ViewManager
        onViewSave={onSave}
        onViewLoad={vi.fn().mockResolvedValue([])}
        onViewDelete={vi.fn()}
        currentViewConfig={currentViewConfig}
      />
    );
    await userEvent.click(screen.getByText('保存视图'));
    await userEvent.type(screen.getByPlaceholderText('视图名称'), '我的视图');
    await userEvent.click(screen.getByText('确定'));
    expect(onSave).toHaveBeenCalledWith(
      '我的视图',
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({ fieldName: 'custom1624587732438', type: 'Hierarchy' }),
        ]),
      })
    );
  });

  it('should disable save button when onViewSave is not provided', () => {
    render(<ViewManager onViewLoad={vi.fn().mockResolvedValue([])} currentViewConfig={buildViewConfig()} />);
    expect(screen.getByText('保存视图')).toBeDisabled();
  });

  it('should list saved views via onViewLoad', async () => {
    const onLoad = vi.fn().mockResolvedValue([
      { id: 'v1', name: '我的视图', viewConfig: buildViewConfig() },
    ]);
    render(<ViewManager onViewLoad={onLoad} currentViewConfig={buildViewConfig()} />);
    await userEvent.click(screen.getByText('视图列表'));
    expect(await screen.findByText('我的视图')).toBeInTheDocument();
  });

  it('should delete via onViewDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onLoad = vi.fn().mockResolvedValue([{ id: 'v1', name: '视图1', viewConfig: buildViewConfig() }]);
    render(<ViewManager onViewLoad={onLoad} onViewDelete={onDelete} currentViewConfig={buildViewConfig()} />);
    await userEvent.click(screen.getByText('视图列表'));
    await userEvent.click(await screen.findByTestId('view-delete-v1'));
    await userEvent.click(screen.getByText('确认删除'));
    expect(onDelete).toHaveBeenCalledWith('v1');
  });
});
```

#### 1.5 NamedSet 拖入

DROP_RULES 表更新：

```typescript
NamedSet: { row: true, column: true, value: false, filter: true },  // P1.5 全开
```

QueryBuilder 已支持 NamedSet（之前架构骨架就建模了），**不需要改主逻辑**。

测试：

```typescript
describe('translateRows with NamedSet', () => {
  it('should output FieldOrNameSet for NamedSet field', () => {
    const rows: RowField[] = [{ fieldName: 'top5products', type: 'NamedSet' }];
    expect(translateRows(rows)).toEqual([
      { _enum: 'NameSet', name: 'top5products' }
    ]);
  });
});
```

---

### 2. P1.5 完成定义

- [ ] 嵌套 filter And/Or 在 UI 和 query 都正确
- [ ] 多列排序 shift+click 优先级生效
- [ ] Excel 导出含 dataFormat（用 Excel 打开验证）
- [ ] 视图保存/加载/删除 完整循环（依赖宿主接口）
- [ ] NamedSet 三个区域都能拖入
- [ ] 场景 C 完整流程 E2E 通过

---

## 3. 风险登记（P1 增量）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 多 measure 时 quickCalc 互相干扰 | 中 | 中 | 单测每个 measure 独立 quickCalc 状态 |
| 嵌套 filter UI 复杂度爆炸 | 中 | 中 | 限制 1 层；P1.5 末做用户测试验证 |
| Excel 导出 dataFormat 翻译不全 | 中 | 低 | 维护 Smartbi 已知 dataFormat 列表，未知 fallback 为字符串 |
| ViewManager 阻塞项 7 不解决 | 高 | 中 | P1.0 启动前 PM 跟进 |
