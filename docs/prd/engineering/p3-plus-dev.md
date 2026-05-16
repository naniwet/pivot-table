# P3+ 开发与测试设计（锚点）

> **📍 实施状态**：
> - **P3 全部已交付** — `core/drillThrough/buildDetailQuery.ts` + `components/DetailModal/` + `MEASURE_GROUP_NAME` 多 measure 排列
> - **P4+ 部分已交付** — 条件格式化 ✅（`core/conditionalFormat/` + `ConditionalFormatModal`，详见 [`../../pivot-table/docs/conditional-format-design.md`](../../pivot-table/docs/conditional-format-design.md)）；联动图表 ✅（echarts：bar/line/pie，`core/chart/` + `ChartRenderer`）；高级排序 ⚠️ 部分；暗色模式/i18n ❌
> - **超 PRD 范围** — 即席查询模式（adhoc，`core/viewMode/` + `DetailRenderer`）、树状显示（`core/tree/` + `TreeRenderer`）、滚动加载（`useScrollPivotQuery`）、浏览模式、三面板可收起、通用右键菜单系统、列宽拖拽

> 配合 [phase-p3-plus.md](../phase-p3-plus.md)。原本是**不作为实施依据**的锚点；现在 P3 + 半个 P4+ 已落地，详细产品功能见 [`../../pivot-table/README.md`](../../pivot-table/README.md)。

---

## P3 — 多指标横向对比 + 钻取明细

**估时**：3 工程师 × 3-4 周

### 主要架构挑战

#### 1. MEASURE_GROUP_NAME 作为伪维度

ViewConfig 拖拽规则：

```typescript
DROP_RULES.MEASURE_GROUP_NAME = { row: true, column: true, value: false, filter: false };
DROP_RULES.MEASURE_GROUP_VALUE = { row: false, column: false, value: true, filter: false };
```

QueryBuilder 翻译：传给 `query.rows` / `query.columns` 时，需要根据 MEASURE_GROUP_NAME 在哪个轴决定多 measure 的排列方向。

**TDD 关键点**：
- 多 measure + MEASURE_GROUP_NAME 在行 → 每个 measure 一行
- 多 measure + MEASURE_GROUP_NAME 在列（默认） → 每个 measure 一列
- 切换方向不丢 measure 配置

#### 2. DrillThrough（依赖阻塞项 11）

**Contract**

```typescript
interface DrillThroughProps {
  query: Query;            // 由父组件根据被点击的 cell 构造
  onClose: () => void;
  exportable?: boolean;
}
```

**关键决策待定**：
- A. DrillThrough 用 `QueryType: 'DetailQuery'` + filter（前端推理）
- B. 后端提供专用 endpoint
- 选哪个取决于阻塞项 11

**TDD**

```typescript
describe('buildDrillThroughQuery', () => {
  it('should produce DetailQuery from cell context', () => {
    const cellCtx = { rowMembers: [...], colMembers: [...] };
    const query = buildDrillThroughQuery(cellCtx, viewConfig, metadata);
    expect(query.queryType).toBe('DetailQuery');
    expect(query.filters).toContainEqual(/* row member as filter */);
  });

  it('should respect 10000 row limit', () => {
    const query = buildDrillThroughQuery(...);
    expect(query.pageSettings.rowPageSize).toBeLessThanOrEqual(10000);
  });
});
```

#### 3. 度量筛选（measureFilter） — InGroup 上下文

P1.0 已支持基础 measureFilter（InGlobal 上下文）。P3 加 InGroup（按维度组合下的度量值筛选）。

**TDD**

```typescript
describe('translateMeasureFilters with InGroup', () => {
  it('should produce ByMeasure with measureContext: InGroup', () => {});
});
```

---

## P4+ — 待定能力（无 ADR）

不写工程设计，等需求落地再细化。但提前登记**架构准备**：

| 能力 | 架构准备 |
|---|---|
| 条件格式 | PivotRenderer 留 cell-decorator 插槽（P0 时不必做，但渲染层不要硬编码 cell 样式） |
| 联动图表 | RenderModel 设计已支持复用，新组件 ChartLink 消费 RenderModel |
| 虚拟滚动 | PivotRenderer 内部行列分别由 `RowList` / `ColList` 子组件管理；切换为 react-window 局部改动 |
| 完整 i18n | UI 字符串 P0 起就走集中表（locales/zh-CN.json） |
| 暗色模式 | CSS 全程使用 var(--*) token，P0 起就准备 |

这些"架构准备"不是 P0/P1/P2 的**新增工作量**，是**遵守约定的开销**：在 P0 写 PivotRenderer 时如果不准备 cell-decorator 插槽，P4+ 加条件格式就要重构。

---

## 跨 Phase 的工程指标追踪

每个 Phase 上线后汇总：

| 指标 | P0 目标 | P1 目标 | P2 目标 |
|---|---|---|---|
| core/ 覆盖率 | ≥ 80% | ≥ 80% | ≥ 80%（含 expressionParser ≥ 90%） |
| 组件总 bundle（gzip） | ≤ 100kb | ≤ 150kb | ≤ 250kb（含 chevrotain 80kb） |
| E2E 通过率（Chrome） | 100% | 100% | 100% |
| E2E 通过率（Safari） | ≥ 95% | ≥ 95% | ≥ 95% |
| 首屏（含 metadata） | < 2s | < 2s | < 2.5s |
| 拖拽响应 | < 100ms | < 100ms | < 100ms |
| 渲染 2500 cells | < 200ms | < 200ms | < 200ms |
| TypeScript strict | true | true | true |
| 已知 P1 bug 数 | 0 | 0 | 0 |
| 已知 P2 bug 数 | ≤ 5 | ≤ 5 | ≤ 5 |
