# P0 开发与测试设计

> **📍 实施状态**：✅ **已交付**。所有 6 个 ADR 已 Accepted，新增 ADR-011/012/013/014/015。
>
> 实现位置：`pivot-table/src/core/queryBuilder/`、`core/cellSetParser/`、`core/metadata/`、`hooks/useViewConfig.ts`、`hooks/usePivotQuery.ts`、`components/PivotRenderer/` 等。

> 实现 [phase-p0.md](../phase-p0.md) 定义的场景 B（地区销售下钻）。
> 严格 TDD：每个模块**先写失败测试，再写最简实现**。

| 字段 | 内容 |
|---|---|
| 估时 | 3 工程师 × 4-5 周（含 20% 架构骨架投入） |
| 关键产出 | ViewConfig schema、QueryBuilder、CellSetParser、组件骨架、嵌入封装 |
| TDD 覆盖率门槛 | core/ 模块 ≥ 80%（**实测 99%+**） |

---

## 1. 关键架构决策（ADR）

### ADR-001: ViewConfig schema 与字段命名

**Status**: Proposed
**Decider**: Engineering Lead, PM, Frontend Tech Lead

**Context**

ViewConfig 是组件内部和宿主交互的最重要数据结构，会被序列化用于视图保存、分享、嵌入预设。一旦上线，schema 几乎不可逆。v1.x 出现过 `expanded` vs `expandedMembers` 命名分裂的事故。

**Decision**

使用 `prd/2-architecture.md` 第 1.2 节锁定的字段命名作为唯一规范，编码到 TypeScript 类型，**禁止运行时容错** —— 字段错就 throw，让单测立刻发现。

```typescript
// types/viewConfig.ts
export interface ViewConfig {
  rows: RowField[];
  columns: ColumnField[];
  values: ValueField[];
  filters: Filter[];
  rowSorts: Sort[];
  columnSorts: Sort[];
  pageState: PageState;
  customFields: CustomField[];     // P2 才用，P0 必须支持空数组序列化
  extensions: Record<string, unknown> | null;
}

export interface RowField {
  fieldName: string;
  type: 'Hierarchy' | 'Dimension' | 'CalcGroup' | 'NamedSet' | 'EnumGroup' | 'RangeGroup';
  expandedMembers?: string[][];   // 仅 type=Hierarchy 时有意义
}
// ... 完整定义见 prd/2-architecture.md 1.2 节
```

**Options Considered**

| 选项 | 优点 | 缺点 |
|---|---|---|
| A. 严格 schema + TS 类型（选定） | 类型即文档，编译期发现错误 | 改 schema 要改类型 + 测试 |
| B. 用 Zod 运行时校验 | 错误信息更友好 | 多一层开销，对组件是 overkill |
| C. 用 JSON Schema 校验 | 跨语言通用 | TS 类型导出不便 |

**Consequences**

- ✅ schema 变化在编译期暴露，PR review 容易
- ⚠️ 宿主必须按类型传 ViewConfig，否则编译期就拒绝
- 💡 留 `extensions: object` 字段做向后兼容扩展

---

### ADR-002: QueryBuilder 设计为纯函数管道

**Status**: Proposed

**Context**

QueryBuilder 把 ViewConfig 翻译为后端 Query。它的逻辑会随 Phase 长大（hierarchy / filter / quickCalc / customElements）。如果一开始写成大函数，P1/P2 加新能力时会变成 if-else 地狱。

**Decision**

QueryBuilder 拆成多个**子翻译器**，每个翻译器只处理 Query 的一部分，主入口 `buildQuery` 是纯组合：

```typescript
// core/queryBuilder/buildQuery.ts
export function buildQuery(
  viewConfig: ViewConfig,
  metadata: Metadata,
  pageState: PageState
): Query {
  return {
    modelId: metadata.id,
    queryType: 'PivotQuery',
    engineType: 'MDX',
    rows: translateRows(viewConfig.rows),
    columns: translateColumns(viewConfig.columns),
    fields: [...translateRowFields(viewConfig.rows), ...translateValueFields(viewConfig.values)],
    filters: [...translateExpandedHierarchy(viewConfig.rows), ...translateFilters(viewConfig.filters)],
    measureFilters: translateMeasureFilters(viewConfig.filters),
    rowSorts: translateSorts(viewConfig.rowSorts, viewConfig.values),
    columnSorts: translateSorts(viewConfig.columnSorts, viewConfig.values),
    pageSettings: buildPageSettings(pageState),
    customElements: translateCustomElements(viewConfig.customFields),
  };
}
```

每个 `translateXxx` 是独立纯函数，独立单测。P1/P2 增量在对应翻译器内部扩展，不动主入口。

**P0 各 translator 实现状态**

> 关键：主入口在 P0 就要按完整结构建好，但**多数 translator 在 P0 是 stub**（返回 `[]`），P1/P2 增量内部填充。这是 ADR-007 "架构骨架的非妥协项"的具体落地。

| Translator | P0 实现 | P1.0 | P1.5 | P2 |
|---|---|---|---|---|
| `translateRows` / `translateColumns` | ✅ 实做（hierarchy/dimension/calcGroup） | NamedSet | — | EnumGroup/RangeGroup/MGN |
| `translateRowFields` / `translateValueFields` | ✅ 实做（单 measure） | 多 measure + quickCalc | — | UserCalcMeasure |
| `translateExpandedHierarchy` | ✅ 实做（关键算法 ADR-004） | — | — | — |
| `translateFilters` | 🟡 stub 返回 `[]` | 平铺 ClientFilter→FieldFilter | 嵌套 And/Or | NamedSet 筛选 |
| `translateMeasureFilters` | 🟡 stub 返回 `[]` | 平铺 ByMeasure (InGlobal) | — | InGroup |
| `translateSorts` | ✅ 实做（单 MeasureSortEx） | 多列 + DimensionSortEx | 多列优先级 | 自定义/BASC |
| `buildPageSettings` | ✅ 实做（默认值） | 列轴翻页 | — | 异步列头 |
| `translateCustomElements` | 🟡 stub 返回 `[]` | — | — | CustomCalcMeasure + CustomColumn |

**stub 的 P0 测试**：每个 stub 至少 1 个测试 "should return empty array for P0"，防止误实现。

**Trade-off**

| 维度 | 评估 |
|---|---|
| 可测性 | 极高（每个翻译器单独测） |
| 可读性 | 高（主入口一目了然） |
| 性能 | 多次 array 遍历，对单查询无影响（< 1ms） |
| 扩展性 | 新能力 = 新翻译器，不动主入口 |

---

### ADR-003: CellSetParser 稀疏 → 稠密矩阵策略

**Status**: Proposed

**Context**

后端 CellSet.data 是稀疏数组 `Cell[]`，每个 cell 自带 `{row, column, value}`。前端渲染需要 `matrix[row][col]` 形式。

**Decision**

```typescript
// core/cellSetParser/matrixBuilder.ts
export function buildDenseMatrix(
  cells: Cell[],
  rowCount: number,
  colCount: number
): RenderCell[][] {
  // 1. 初始化 rowCount × colCount 全空矩阵
  const matrix: RenderCell[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => EMPTY_CELL)
  );
  // 2. 遍历稀疏 cells 填充
  for (const cell of cells) {
    matrix[cell.row][cell.column] = {
      value: cell.value,
      formattedValue: cell.formattedValue,
      isEmpty: false,
      isMasked: false,  // 由调用方根据 columnMeta.maskingRuleIdList 设置
    };
  }
  return matrix;
}
```

**为什么不用 Map / 懒加载**

- 行列总数都是已知的（来自 `cellSet.rows.length` / `cellSet.columns.length`）
- 单页 ≤ 2500 cells，预分配数组开销可忽略
- 数组访问比 Map 快 5-10 倍，渲染热路径

---

### ADR-004: Hierarchy 展开通过 filter 实现（待后端联调验证）

**Status**: Proposed - **HIGH RISK**
**Decider**: 后端工程师必须共同评审

**Context**

PRD `phase-p0.md` 第 3.1 节定义：hierarchy 展开通过 `query.filters` 中追加成员 In 筛选实现。但这是基于 query-schema 的推测，**MDX 引擎实际行为可能不同**（可能要求用 NamedSet 或其他机制）。

**Decision**

P0 第 1 周（架构骨架阶段）必须和后端联调：

1. 用最简单 case（"江苏"展开）发起真实 query，验证返回是否符合预期
2. 如果不符合，立即和后端调整方案，可能选择：
   - A. 后端提供"展开成员"专门接口
   - B. 前端拼多个 query 后合并
   - C. 用 NamedSet 表示展开路径

**Action Items**

- [ ] P0 W1.D2：和后端工程师对齐 hierarchy 展开机制（kickoff 会议）
- [ ] P0 W1.D5：联调 case 1（无展开）通过
- [ ] P0 W2.D2：联调 case 2（一层展开）通过
- [ ] P0 W2.D5：联调 case 3（多层展开）通过
- [ ] 任一失败 → 升级为阻塞，PM 介入决定方案

---

### ADR-005: 测试框架选 Vitest

**Status**: Proposed

**Context**

需要选定单元测试 + 组件测试 + E2E 测试框架。

**Decision**

| 层级 | 选择 | 理由 |
|---|---|---|
| 单元 + 组件 | Vitest + @testing-library/react | 比 Jest 快 3-5 倍；Vite 生态原生；HMR 测试 |
| E2E | Playwright | 跨浏览器；并行；ChromeDevTools Protocol 直连 |

**Options 对比**

| 工具 | 速度 | 生态 | 学习曲线 |
|---|---|---|---|
| Vitest（选定） | 快 | 同 Jest API | 低（Jest 用户无成本） |
| Jest | 慢 | 最广 | 低 |
| Mocha + Chai | 中 | 老 | 中 |

**反悔成本**：轻易可逆，所有测试用 `describe/it/expect` 标准 API，换框架几乎只改 import。

---

### ADR-006: 状态管理用 React 内置 + custom hook，不引 Redux

**Status**: Proposed

**Context**

ViewConfig 是核心状态。可选 Redux / Zustand / Jotai / 仅 useState+useReducer。

**Decision**

P0 用 `useReducer` + `useContext` 内置方案，封装 `useViewConfig` hook。

**理由**

- 组件单实例使用，状态边界小，不需要全局 store
- 受控/非受控两种模式都能简洁实现
- 减少外部依赖（嵌入到任何宿主都不强加 Redux）
- ViewConfig 变化不频繁（用户操作驱动），性能不是瓶颈

```typescript
// hooks/useViewConfig.ts
export function useViewConfig(props: {
  value?: ViewConfig;
  defaultValue?: ViewConfig;
  onChange?: (v: ViewConfig) => void;
}): [ViewConfig, Dispatch<ViewConfigAction>] {
  // 处理受控/非受控统一接口
  // ...
}
```

**Trade-off**

| 维度 | 评估 |
|---|---|
| Bundle 大小 | 0 额外（vs Redux ~10kb） |
| DevTools | 弱于 Redux DevTools |
| 时间旅行 | 不支持（用户量少时不必要） |

P1+ 如发现状态管理痛点，可换 Zustand（迁移成本中等）。

---

### ADR-011: onQuery 接收可选 AbortSignal 支持取消

**Status**: Proposed
**Decider**: Frontend Tech Lead, 宿主集成方代表

**Context**

usePivotQuery 需要在用户连续操作时取消旧的 query（避免乱序、节省后端资源）。但 v2.0 Component API 中 `onQuery: (q: Query) => Promise<CellSet>` 没有取消机制 —— 这是 v2.0 设计漏洞。

两条路：

| 选项 | 优点 | 缺点 |
|---|---|---|
| A. 改 onQuery 签名加 ctx（选定） | 真正取消网络请求，节省后端资源 | 宿主要适配（但 ctx 可选，不传不影响） |
| B. 组件内部 stale 标记 | 不改 contract | 旧请求仍走完，浪费后端；网络拥塞场景体验差 |

**Decision**

选 A，但 ctx **可选**，向后兼容：

```typescript
// 更新 2-architecture.md 6.1 节
onQuery: (q: Query, ctx?: { signal: AbortSignal }) => Promise<CellSet>;
```

宿主实现：

```typescript
// 推荐写法（支持取消）
onQuery: async (q, ctx) => {
  const res = await fetch('/api/pivot/query', {
    method: 'POST',
    body: JSON.stringify(q),
    signal: ctx?.signal,  // 可选传入，实现真正取消
  });
  return res.json();
}

// 兼容写法（旧宿主，无取消）
onQuery: async (q) => {
  return await fetch(...).then(r => r.json());
}
```

**组件内部行为**

- usePivotQuery 总是创建 `AbortController`，传 `controller.signal` 给 onQuery
- query 切换时 `controller.abort()` 并新建 controller
- 宿主 ignore signal 时，组件内部仍丢弃过期结果（双层保险）

**Consequences**

- ✅ 真正能取消请求，节省后端
- ✅ 旧宿主不传 ctx 也能用（向后兼容）
- ⚠️ 组件文档要明确推荐用法，否则宿主可能不知道传 signal
- 💡 也为 P3 DrillThrough、P2 异步列头的 long-running query 取消打下基础

**Action Items**

- [ ] 更新 [2-architecture.md](../2-architecture.md) 4.1 节 Props.onQuery 签名
- [ ] 更新 [2-architecture.md](../2-architecture.md) 5 节嵌入示例
- [ ] usePivotQuery 实现按 ADR 描述

**反悔成本**：几乎不可逆（影响 Props 接口）。但因为 ctx 可选，从"不取消"加上"取消"是 non-breaking change，反向（取消改不取消）才是 breaking。

---

## 2. 模块开发顺序（按 TDD 优先级）

**核心原则**：**先做最易测试的纯函数，再做有副作用的组件**。这样测试覆盖率自然高，且核心逻辑稳定后再做 UI 调试容易得多。

```
Week 1: 架构骨架（不交付任何 UI 功能）
  ├─ types/ 完整定义（ViewConfig + Query + CellSet + RenderModel + Metadata）
  ├─ fixtures/ 测试数据（含 ADR-004 联调用例）
  └─ ADR-004 联调（最高风险，先解掉）

Week 2: 核心纯函数（QueryBuilder + CellSetParser）
  ├─ buildQuery 主入口 + 5 个子翻译器
  └─ parseCellSet 主入口 + matrixBuilder

Week 3: UI 组件 + hooks
  ├─ FieldTree
  ├─ DropZones
  ├─ useViewConfig
  └─ usePivotQuery（含 L0/L1 缓存 + 取消）

Week 4: 渲染层 + 集成
  ├─ PivotRenderer（行头树 + 列头 + 数据区 + 空状态）
  ├─ Pagination（仅行轴）
  ├─ Toolbar（刷新 + CSV 导出）
  └─ PivotTable 顶层组件 + 嵌入封装

Week 5: 联调 + 验收 + buffer
  ├─ E2E 测试（场景 B 完整流程）
  ├─ 嵌入到真实业务系统
  ├─ 埋点对接
  └─ 性能优化 + bug 修复
```

---

## 3. 模块详细设计 + TDD 测试计划

### 3.1 QueryBuilder

#### 3.1.1 主入口

**Contract**

```typescript
function buildQuery(
  viewConfig: ViewConfig,
  metadata: Metadata,
  pageState: PageState
): Query;
```

**TDD 测试顺序**（每条测试**先写**，再写最简实现）

```typescript
// core/queryBuilder/buildQuery.test.ts
describe('buildQuery', () => {
  describe('minimum valid input', () => {
    it('should produce PivotQuery with 1 dimension and 1 measure', () => {
      // 🔴 RED: 测试不会过，buildQuery 还没写
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [{ measureName: '销售额', aggregator: null, quickCalc: null }],
      });
      const query = buildQuery(viewConfig, fixtureMetadata, defaultPageState);
      expect(query.queryType).toBe('PivotQuery');
      expect(query.engineType).toBe('MDX');
      expect(query.rows).toEqual(['custom1624587732438']);
      expect(query.fields).toHaveLength(2);
    });
  });

  describe('validation', () => {
    it('should throw when no measure in values', () => {
      const viewConfig = buildViewConfig({ rows: [buildHierarchyRow()] });
      expect(() => buildQuery(viewConfig, fixtureMetadata, defaultPageState))
        .toThrow(/at least 1 measure/);
    });
    it('should throw when field not in metadata', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ fieldName: 'unknown_field' })],
      });
      expect(() => buildQuery(viewConfig, fixtureMetadata, defaultPageState))
        .toThrow(/field "unknown_field" not in metadata/);
    });
  });
});
```

#### 3.1.2 hierarchy 展开翻译器（关键模块，ADR-004）

**Contract**

```typescript
function translateExpandedHierarchy(rows: RowField[]): FieldFilter[];
```

**测试覆盖矩阵**（PRD `phase-p0.md` 3.1 节要求每个 case 至少 1 个）

| # | Case | 输入 expandedMembers | 期望输出 filters |
|---|---|---|---|
| 1 | 完全折叠 | `[]` | `[]` |
| 2 | 一层展开 | `[["江苏"]]` | 1 个 In 筛选: ShipProvince2 In ["江苏"] |
| 3 | 两层展开 | `[["江苏"], ["江苏", "苏南"]]` | 2 个 In 筛选 |
| 4 | 多顶层展开 | `[["江苏"], ["浙江"]]` | 1 个 In 筛选: ShipProvince2 In ["江苏","浙江"] |
| 5 | 跳级展开（非法 invariant 违反） | `[["江苏", "南京"]]` 不带 ["江苏"] | throws InvariantViolation |
| 6 | 同 hierarchy 多次声明（非法） | 同一 fieldName 在 rows 出现 2 次 | throws InvariantViolation |

**说明**：
- "空 hierarchy（hierarchy 内无成员）"是数据集层面问题，由 CellSetParser 处理（返回空 rowHeader → PivotRenderer 显示无数据态），不在本翻译器范围
- 跳级展开和重复声明是 viewConfig invariant 违反（DropZones/drill 交互应防止产生这类状态），但翻译器要 throw 保护 invariant，便于单测立即发现 UI 层的 bug

```typescript
// core/queryBuilder/translators/hierarchy.test.ts
describe('translateExpandedHierarchy', () => {
  it.each([
    [
      'no expansion',
      [{ fieldName: 'h1', type: 'Hierarchy', expandedMembers: [] }],
      [],
    ],
    [
      'single-level expansion',
      [{ fieldName: 'h1', type: 'Hierarchy', expandedMembers: [['江苏']] }],
      [{ _enum: 'FieldFilter', field: 'ShipProvince2', filter: { _enum: 'ByValue', operator: 'In', value: ['江苏'] } }],
    ],
    // ... 所有 6 个 case
  ])('case: %s', (_name, rows, expected) => {
    expect(translateExpandedHierarchy(rows as RowField[])).toEqual(expected);
  });
});
```

#### 3.1.3 排序翻译器

**Contract**

```typescript
// 返回类型用 FieldSort 联合类型，P0 只产生 MeasureSortEx，
// P1.0 加 DimensionSortEx，P2 加 BASC/Customize 等。类型签名 P0 就稳定。
type FieldSort = MeasureSortEx | DimensionSortEx | MeasureSort | DimensionSort;

function translateSorts(sorts: Sort[], values: ValueField[]): FieldSort[];
```

**测试**

```typescript
describe('translateSorts', () => {
  it('should produce MeasureSortEx for ByMeasure sort (P0)', () => {
    const sorts: Sort[] = [{ type: 'ByMeasure', measureName: '销售额', direction: 'DESC' }];
    expect(translateSorts(sorts, [])).toEqual<FieldSort[]>([
      { _enum: 'MeasureSortEx', measure: { _enum: 'ByMeasure', name: '销售额' }, direction: 'DESC' }
    ]);
  });
  it('should return empty array when no sorts', () => {
    expect(translateSorts([], [])).toEqual([]);
  });
  // P1.0 加 'should produce DimensionSortEx for ByDimension sort'
  // P2 加 'should produce BASC for in-group ascending'
});
```

---

### 3.2 CellSetParser

#### 3.2.1 主入口

**Contract**

```typescript
function parseCellSet(cellSet: CellSet, viewConfig: ViewConfig): RenderModel;
```

**TDD 测试矩阵**

| # | Case | 输入 | 期望输出 |
|---|---|---|---|
| 1 | 空 CellSet | rows/columns/data 都空 | RenderModel matrix 为空 |
| 2 | 稀疏 cells | 5 cells, 10×3 行列 | 30 个 cell 的稠密矩阵，缺失填 EMPTY_CELL |
| 3 | hierarchy 行头 | 含展开/折叠 member | rowHeader 含正确 depth/expandable/expanded |
| 4 | 总计行 | grandTotalRow 在 cellSet 里 | RenderModel.grandTotalRow 非空 |
| 5 | 数据脱敏 | columnMeta.maskingRuleIdList 非空 | 对应列的 isMasked: true |
| 6 | RowSet 适配 | columns 只有 measure | 退化为单层 columnHeader |
| 7 | fullPath 构建 | hierarchy member 有多级 uniqueName | fullPath: ['江苏','苏南','南京'] |

#### 3.2.2 矩阵构建子模块

测试单独 isolate：

```typescript
// core/cellSetParser/matrixBuilder.test.ts
describe('buildDenseMatrix', () => {
  it('should fill missing cells with EMPTY_CELL', () => {
    const matrix = buildDenseMatrix([{ row: 0, column: 1, value: 100, formattedValue: '100' }], 2, 2);
    expect(matrix[0][0]).toBe(EMPTY_CELL);
    expect(matrix[0][1].value).toBe(100);
    expect(matrix[1][0]).toBe(EMPTY_CELL);
    expect(matrix[1][1]).toBe(EMPTY_CELL);
  });
});
```

---

### 3.3 FieldTree 组件

#### Contract

```typescript
interface FieldTreeProps {
  metadata: Metadata;
  searchQuery?: string;
  onFieldDragStart: (fieldId: string, fieldType: FieldType) => void;
}
```

#### TDD 测试

```typescript
// components/FieldTree/FieldTree.test.tsx
describe('FieldTree', () => {
  it('should render all dimensions and measures', () => {
    render(<FieldTree metadata={fixtureMetadata} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('发货区域')).toBeInTheDocument();
    expect(screen.getByText('销售额')).toBeInTheDocument();
  });

  it('should hide visible:false fields', () => {
    const meta = { ...fixtureMetadata, dimensions: { ...x, children: [{ ...field, visible: false }] }};
    render(<FieldTree metadata={meta} />);
    expect(screen.queryByText('字段名')).not.toBeInTheDocument();
  });

  it('should grey out accessible:false fields', () => {
    // ...
    expect(screen.getByText('受限字段')).toHaveClass('field--disabled');
  });

  it('should filter tree by search query', async () => {
    render(<FieldTree metadata={fixtureMetadata} searchQuery="销售" />);
    expect(screen.getByText('销售额')).toBeInTheDocument();
    expect(screen.queryByText('订单日期')).not.toBeInTheDocument();
  });

  it('should call onFieldDragStart when dragging', async () => {
    const onDrag = vi.fn();
    render(<FieldTree metadata={fixtureMetadata} onFieldDragStart={onDrag} />);
    const field = screen.getByText('销售额');
    fireEvent.dragStart(field);
    expect(onDrag).toHaveBeenCalledWith('销售额_1624531356707', 'Measure');
  });

  it('should show CalcGroup with grouping icon', () => {
    render(<FieldTree metadata={fixtureMetadata} />);
    const node = screen.getByText('城市分组');
    expect(node.closest('[data-field-type]')).toHaveAttribute('data-field-type', 'CalcGroup');
  });
});
```

---

### 3.4 DropZones 组件

**关键设计**：拖拽规则用**数据驱动映射表**（不用 if-else），便于扩展。

```typescript
// components/DropZones/dropRules.ts
export const DROP_RULES: Record<FieldType, Record<DropZone, boolean>> = {
  Dimension:    { row: true,  column: true,  value: false, filter: false }, // P1.0 filter:true
  Hierarchy:    { row: true,  column: true,  value: false, filter: false },
  CalcGroup:    { row: true,  column: true,  value: false, filter: false }, // P1.0 filter:true
  Measure:      { row: false, column: false, value: true,  filter: false },
  CalcMeasure:  { row: false, column: false, value: true,  filter: false },
  NamedSet:     { row: false, column: false, value: false, filter: false }, // P1.0 全开
  // ... P2/P3 在表里加行
};

export function canDrop(fieldType: FieldType, zone: DropZone): boolean {
  return DROP_RULES[fieldType]?.[zone] ?? false;
}
```

**TDD 测试**

```typescript
describe('canDrop', () => {
  it.each([
    ['Measure', 'value', true],
    ['Measure', 'row', false],
    ['Hierarchy', 'row', true],
    ['Hierarchy', 'value', false],
    ['NamedSet', 'row', false],          // P0
    // 当 P1 开放时改这里
  ])('canDrop(%s, %s) === %s', (fieldType, zone, expected) => {
    expect(canDrop(fieldType, zone)).toBe(expected);
  });
});

describe('DropZones component', () => {
  it('should highlight row zone when dragging Hierarchy', () => {
    // dragStart Hierarchy → row zone gets highlight class
  });
  it('should grey out value zone when dragging Hierarchy with reason tooltip', () => {
    // ...
  });
  it('should reject drop and not call onChange if invalid', () => {
    // drag Measure to row → onChange not called
  });
  it('should call onChange with new viewConfig on valid drop', () => {
    // drag Hierarchy to row → onChange called with rows[0]
  });
  it('should remove field on × click', () => {
    // ...
  });
});
```

---

### 3.5 usePivotQuery hook（核心 + 副作用胶水）

**Contract**

```typescript
function usePivotQuery(args: {
  query: Query | null;
  onQuery: (q: Query) => Promise<CellSet>;
  cacheType: 'CACHE' | 'UNCACHE' | 'CLEAR';
}): {
  data: CellSet | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};
```

**职责**：
- L0 query 去重（按 hash + 30 秒 TTL）
- L1 翻页缓存（同 viewConfig 不同 page）
- 取消正在进行的 query（用户连续操作时）
- 连续失败 ≥ 3 次自动暂停

**TDD 测试**

```typescript
describe('usePivotQuery', () => {
  it('should call onQuery when query changes', async () => {
    const onQuery = vi.fn().mockResolvedValue(fixtureCellSet);
    const { result, rerender } = renderHook(
      ({ q }) => usePivotQuery({ query: q, onQuery, cacheType: 'CACHE' }),
      { initialProps: { q: query1 } }
    );
    await waitFor(() => expect(result.current.data).toBe(fixtureCellSet));
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it('should hit L0 cache when same query within 30s', async () => {
    const onQuery = vi.fn().mockResolvedValue(fixtureCellSet);
    const { rerender } = renderHook(/* ... query1 ... */);
    await waitFor(/* loaded */);
    rerender({ q: query1 });  // 相同 query 再次
    await waitFor(/* still cached */);
    expect(onQuery).toHaveBeenCalledTimes(1); // 没有重复调用
  });

  it('should cancel in-flight query when query changes', async () => {
    const cancelSpy = vi.fn();
    const onQuery = vi.fn().mockImplementation((q, ctx) => {
      ctx.signal.addEventListener('abort', cancelSpy);
      return new Promise(/* never resolves */);
    });
    const { rerender } = renderHook(/* ... query1 ... */);
    rerender({ q: query2 });
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should pause queries after 3 consecutive failures', async () => {
    const onQuery = vi.fn().mockRejectedValue(new Error('boom'));
    const { result, rerender } = renderHook(/* ... */);
    rerender({ q: query2 });
    rerender({ q: query3 });
    expect(result.current.error?.message).toMatch(/操作过快/);
    rerender({ q: query4 });
    expect(onQuery).toHaveBeenCalledTimes(3); // 不再调用
  });

  it('should clear cache and refetch on cacheType=CLEAR', async () => {
    // ...
  });
});
```

---

### 3.6 PivotRenderer

**Contract**

```typescript
interface PivotRendererProps {
  renderModel: RenderModel;
  viewConfig: ViewConfig;
  onSortClick: (fieldName: string) => void;
  onDrillToggle: (memberPath: string[]) => void;
}
```

**TDD 测试**

```typescript
describe('PivotRenderer', () => {
  describe('basic rendering', () => {
    it('should render row headers with hierarchy indentation', () => {});
    it('should render column header with measure alias', () => {});
    it('should render data cells with formattedValue', () => {});
    it('should render grand total row at bottom when subTotalAtEnd', () => {});
    it('should align numbers right, text left', () => {});
  });

  describe('drill interaction', () => {
    it('should show ▶ for collapsed expandable row', () => {});
    it('should show ▼ for expanded row', () => {});
    it('should call onDrillToggle with memberPath on ▶/▼ click', () => {});
  });

  describe('sort interaction', () => {
    it('should toggle sort direction on header click (DESC → ASC → none)', () => {});
    it('should display arrow icon according to current sort state', () => {});
  });

  describe('hover tooltip', () => {
    it('should show full path tooltip on cell hover', async () => {
      // 验证场景 B step 5: hover 显示"江苏 / 苏南 / 南京 — 销售额: 123,456"
    });
  });

  describe('masked cells', () => {
    it('should render *** with lock icon for masked cells', () => {});
  });

  describe('empty states', () => {
    it('should show drag prompt when values is empty', () => {});
    it('should show no-data when query returns empty', () => {});
    it('should fade old data with spinner during loading', () => {});
    it('should show error banner with retry on query failure', () => {});
  });
});
```

#### P0 架构准备约定（为 P4+ 能力预埋）

虽然 P0 不交付以下能力，PivotRenderer 实现**必须遵守以下约定**，否则 P4+ 加新能力（条件格式 / 暗色模式 / 虚拟滚动 / i18n）要重构。Code review 时强制检查。

| 约定 | 为何 P0 就要做 | 违反后的代价 |
|---|---|---|
| **CSS 全程使用 `var(--*)` token，禁止硬编码颜色 / 字号** | 暗色模式 / 主题定制 P4+ 加 | 重写所有 CSS |
| **单元格渲染走 `<CellWrapper renderModel={cell}>` 包装层**，禁止把样式硬编码在 `<td>` 上 | 条件格式 P4+ 在 CellWrapper 内插装饰逻辑 | 重写 PivotRenderer 数据区 |
| **行/列分别由 `<RowList>` / `<ColList>` 子组件管理**，不要在 PivotRenderer 顶层直接 map | 虚拟滚动 P4+ 局部替换为 `react-window` | 重写整个表格渲染 |
| **UI 字符串集中走 `locales/zh-CN.json`**（如"无数据"、"导出 CSV"），不要硬编码中文 | i18n P4+ 接 en-US | 全文搜中文字符串改 |
| **行/列高亮、tooltip 等装饰用 CSS data attribute 驱动**（`data-row-highlighted`），不用 inline style | 主题定制 + 性能 | inline style 难覆盖 |

**这些约定不增加 P0 工作量**，只是"按约定写"vs"随手写"的区别。完整背景见 [p3-plus-dev.md](p3-plus-dev.md) "架构准备" 节。

**对应的 P0 单元测试**（约定可验证）

```typescript
describe('PivotRenderer architectural conventions', () => {
  it('should not have hardcoded color values in styles', () => {
    // 编译期检查：用 stylelint 规则禁止 #xxx / rgb() 硬编码
  });
  it('should render cells through CellWrapper', () => {
    const { container } = render(<PivotRenderer ... />);
    expect(container.querySelectorAll('[data-cell-wrapper]').length).toBeGreaterThan(0);
  });
  it('should not embed Chinese strings in JSX (use i18n key)', () => {
    // 编译期检查：ESLint 自定义规则
  });
});
```

---

### 3.7 PivotTable 顶层组件（集成测试为主）

**集成测试**（不单测内部）

```typescript
// components/PivotTable/PivotTable.test.tsx
describe('PivotTable integration', () => {
  it('场景 B 完整流程', async () => {
    // 4 次 query：初始 / 展开江苏 / 展开苏南 / 排序切换
    const onQuery = vi.fn()
      .mockResolvedValueOnce(rootLevelCellSet)        // 1. 初始（默认 expandedMembers=[["江苏"]] 加载）
      .mockResolvedValueOnce(jiangsuExpandedCellSet)  // 2. 展开江苏 → 加上发货区域
      .mockResolvedValueOnce(suNanExpandedCellSet)    // 3. 展开苏南 → 加上城市
      .mockResolvedValueOnce(sortedAscCellSet);       // 4. 排序切到 ASC（同一展开状态）

    render(<PivotTable
      modelId="m1"
      metadata={fixtureMetadata}
      defaultValue={defaultViewConfig}      // 默认 rowSorts: ByMeasure DESC
      onQuery={onQuery}
    />);

    // 1. 默认视图加载（DESC 状态）
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    expect(onQuery).toHaveBeenCalledTimes(1);

    // 2. 点 ▶ 展开江苏
    await userEvent.click(screen.getByTestId('drill-toggle-江苏'));
    await waitFor(() => expect(screen.getByText('苏南')).toBeInTheDocument());
    expect(onQuery).toHaveBeenCalledTimes(2);

    // 3. 点 ▶ 展开苏南
    await userEvent.click(screen.getByTestId('drill-toggle-苏南'));
    await waitFor(() => expect(screen.getByText('南京')).toBeInTheDocument());
    expect(onQuery).toHaveBeenCalledTimes(3);

    // 4. hover 城市看完整路径
    await userEvent.hover(screen.getByTestId('cell-南京-销售额'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('江苏 / 苏南 / 南京');

    // 5. 点表头切换排序：DESC → ASC
    await userEvent.click(screen.getByText('销售额'));
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(4));
    expect(onQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rowSorts: [expect.objectContaining({ direction: 'ASC' })],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })  // 验证 ADR-011 ctx 传入
    );
  });
});
```

---

## 4. E2E 测试设计（场景 B 完整流程）

```typescript
// e2e/scenario-b.spec.ts (Playwright)
test('场景 B：地区销售下钻完整流程', async ({ page }) => {
  await page.goto('/embed-test');

  // 默认视图
  await expect(page.locator('text=江苏')).toBeVisible({ timeout: 2000 });

  // 钻取
  await page.locator('[data-testid="drill-toggle-江苏"]').click();
  await expect(page.locator('text=苏南')).toBeVisible();

  await page.locator('[data-testid="drill-toggle-苏南"]').click();
  await expect(page.locator('text=南京')).toBeVisible();

  // 折叠回顶层
  await page.locator('[data-testid="drill-toggle-苏南"]').click();
  await page.locator('[data-testid="drill-toggle-江苏"]').click();
  await expect(page.locator('text=苏南')).not.toBeVisible();

  // 排序
  await page.locator('text=销售额').click();
  // 验证顺序变化

  // 翻页（如有）
  // ...

  // 导出 CSV
  const downloadPromise = page.waitForEvent('download');
  await page.locator('text=导出 CSV').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});
```

---

## 5. 关键风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| ADR-004 hierarchy 展开机制和后端不一致 | 高 | 高（QueryBuilder 重写） | W1 联调验证，留 buffer |
| metadata schema 实际和样例不同 | 中 | 中 | W1 拿真实 metadata 走通字段树 |
| onQuery 性能瓶颈在网络（不在前端） | 中 | 低 | L0/L1 缓存 + 取消，前端做好节流 |
| 拖拽体验跨浏览器差异（Safari） | 中 | 中 | E2E 多浏览器跑；HTML5 DnD 不行就换 dnd-kit 库（约 1 周成本） |
| 视图嵌入到宿主样式冲突 | 中 | 低 | CSS modules / scope，theme 用 CSS variables |

---

## 6. P0 完成定义（DoD）

- [ ] [phase-p0.md](../phase-p0.md) 第 9 节验收全部通过
- [ ] core/ 模块 vitest 覆盖率 ≥ 80%（实际跑 CI 验证）
- [ ] 6 个 ADR 全部 Accepted（含 ADR-004 联调通过）
- [ ] E2E 场景 B 在 Chrome/Firefox/Safari 都通过
- [ ] 嵌入到 1 个真实业务系统跑通
- [ ] 埋点 10 个事件在数据团队后台可见
- [ ] 性能指标全达标（[3-nfr-backend.md](../3-nfr-backend.md) 第 1 节）
- [ ] 工程方法论自检：随机抽 5 个 PR 检查 5 分钟法则、Unix、术语一致性
