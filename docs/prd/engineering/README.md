# 工程设计文档

> 配套 PRD v3.0 的开发与测试设计。**严格遵循 TDD（测试驱动开发）**。
>
> **📍 实施状态（2026-05-13）**：✅ 全部交付，**86 测试文件 / 1092 单测 case，覆盖率 99%+**。所有 ADR 状态从 Proposed → **Accepted**。

| 字段 | 内容 |
|---|---|
| 工程文档版本 | v2.0 |
| 配套 PRD | [`../README.md`](../README.md) v3.0 |
| 工程方法论 | TDD + Unix 哲学 + DDD 通用语言 |
| 状态 | **现行 — 已实施落地** |
| 实测覆盖 | 86 测试文件 / 1092 case / 99%+ core 覆盖率 |
| 修订历史 | 见文末 |

---

## 文档结构

| 文件 | 内容 |
|---|---|
| [README.md](README.md) | 工程原则、TDD 方法、文件结构、测试基础设施、ADR 索引 |
| [p0-dev.md](p0-dev.md) | P0 开发设计 + TDD 测试设计（含 6 个核心 ADR） |
| [p1-dev.md](p1-dev.md) | P1.0 + P1.5 开发与测试增量 |
| [p2-dev.md](p2-dev.md) | P2 开发与测试增量（含字段表达式 parser ADR） |
| [p3-plus-dev.md](p3-plus-dev.md) | P3+ 简要 |

---

## 1. 工程原则（在每个 PR 前必须自检）

### 1.1 Unix 哲学

- **一个模块只做一件事**：QueryBuilder 只构造 query，不调接口；CellSetParser 只解析，不渲染
- **接口用纯函数 + dataclass / 字典**：禁止隐藏的全局状态
- **模块通过显式契约组合**：每个模块的输入输出有 TypeScript 类型签名
- **拒绝大一统抽象基类**：3 处重复才抽，2 处复制粘贴

### 1.2 TDD 节奏

每个模块严格走以下流程：

1. **🔴 RED**：先写一个失败的单元测试（描述期望的行为）
2. **🟢 GREEN**：写最简实现让测试通过（不追求优雅）
3. **🔵 REFACTOR**：在测试保护下重构

**禁止**：
- ❌ 写完代码再补测试
- ❌ 测试覆盖率作为唯一指标（要看测试是否真的能挡 bug）
- ❌ 用 mock 把测试糊弄过去（mock 隔离的是 IO/时间，不是核心逻辑）

### 1.3 接口可测性的 5 分钟法则

在 PR 进 main 前必须能回答 yes：

1. 这段代码我能在 5 分钟内写出单测吗？
2. 它的依赖（time / random / IO / 全局状态）能 mock 吗？
3. 测试是否覆盖了边界条件、错误路径？

**任一答 No → 接口设计有问题，先改设计再写实现。**

### 1.4 副作用集中在显式句柄上

- ❌ 不要 `import { now } from 'date-fns'`
- ✅ 把 `now: () => Date` 作为参数传入

- ❌ 不要 `import { fetch } from 'axios'`
- ✅ 把 `onQuery: (q: Query) => Promise<CellSet>` 作为 prop 注入

- ❌ 不要 `Math.random()`
- ✅ 把 `generateId: () => string` 注入

### 1.5 DDD 通用语言

代码、测试、文档、commit message、口头讨论用词必须一致。术语表锁定在 [`../2-architecture.md`](../2-architecture.md) 第 1 节，**严禁同一概念两种叫法**。

---

## 2. 测试金字塔

| 层级 | 比例 | 工具 | 范围 |
|---|---|---|---|
| 单元测试 | ~70% | Vitest | 纯函数、单组件、自定义 hook |
| 集成测试 | ~25% | Vitest + @testing-library/react + userEvent | 多组件协作、用户交互流 |
| E2E 测试 | ~5% | Playwright | 关键用户流（场景 B 端到端） |

**关键纯函数（QueryBuilder / CellSetParser / Expression Parser）单元覆盖率 ≥ 80%（PRD 验收硬指标）**。

---

## 3. 推荐的文件结构

```
src/
├── components/                      # UI 组件层
│   ├── PivotTable/                  # 顶层组件
│   │   ├── PivotTable.tsx
│   │   ├── PivotTable.test.tsx      # 集成测试
│   │   └── index.ts
│   ├── FieldTree/
│   │   ├── FieldTree.tsx
│   │   ├── FieldTree.test.tsx       # 单元 + 集成
│   │   ├── FieldNode.tsx
│   │   └── useFieldTreeState.ts
│   ├── DropZones/
│   ├── PivotRenderer/
│   ├── Pagination/
│   └── Toolbar/
├── core/                            # 纯函数核心逻辑（最严格 TDD）
│   ├── queryBuilder/
│   │   ├── buildQuery.ts            # 主入口
│   │   ├── buildQuery.test.ts       # 80%+ 覆盖率
│   │   ├── translators/             # 子翻译器（hierarchy/sort/filter/quickCalc）
│   │   │   ├── hierarchy.ts
│   │   │   ├── hierarchy.test.ts
│   │   │   ├── ...
│   │   └── validators.ts
│   ├── cellSetParser/
│   │   ├── parseCellSet.ts
│   │   ├── parseCellSet.test.ts     # 80%+ 覆盖率
│   │   └── matrixBuilder.ts
│   └── expressionParser/            # P2 引入
│       ├── parse.ts
│       ├── translate.ts
│       └── *.test.ts
├── hooks/                           # 自定义 React hook
│   ├── usePivotQuery.ts             # query 编排 + 缓存 + 取消
│   ├── usePivotQuery.test.ts
│   ├── useViewConfig.ts             # ViewConfig 受控/非受控
│   └── ...
├── types/                           # TypeScript 类型（契约）
│   ├── viewConfig.ts                # ViewConfig 完整 schema
│   ├── query.ts                     # 后端 Query 类型（按 query-schema.json）
│   ├── cellSet.ts                   # 后端 CellSet 类型
│   ├── renderModel.ts               # 内部 RenderModel
│   └── metadata.ts
├── fixtures/                        # 测试夹具
│   ├── metadata/
│   │   ├── orderModel.json          # 真实 metadata 样例
│   │   └── minimalModel.json
│   ├── viewConfig/
│   │   ├── scenarioB.ts
│   │   └── ...
│   ├── cellSet/
│   │   ├── basicHierarchy.ts
│   │   └── ...
│   └── builders.ts                  # 测试数据构造器
└── utils/
    ├── format.ts                    # dataFormat 应用
    └── ...
```

**核心原则**：
- `core/` 内所有模块**禁止依赖** React、DOM、`window`、`Date.now()`、`fetch` —— 它们是纯函数模块
- `components/` 内组件依赖 `core/` + `hooks/`
- `hooks/` 内自定义 hook 是**核心 + 副作用**的胶水层（异步、缓存、订阅）
- `fixtures/` 是测试的"真实数据"，不要在测试里硬编码大对象

---

## 4. 测试基础设施

### 4.1 工具栈

```json
{
  "vitest": "^1.x",
  "@testing-library/react": "^14.x",
  "@testing-library/user-event": "^14.x",
  "@vitest/coverage-v8": "^1.x",
  "playwright": "^1.x"
}
```

### 4.2 关键 Mock 边界

| 模块 | Mock 方式 | 备注 |
|---|---|---|
| `onQuery` | 通过 props 注入 mock 函数 | 不需要 MSW，组件本身是组件 + props |
| metadata | 用 fixtures 提供 | 不调真实 API |
| `Date.now()` | 通过 `now()` 注入 | core/ 内禁止直接调 |
| 随机 ID | 通过 `generateId()` 注入 | 测试可固定 |
| `localStorage` | jsdom 自带 mock | 收藏字段功能 |
| HTML5 Drag and Drop | `@testing-library/user-event` 模拟 | 复杂场景用 Playwright |

### 4.3 测试命名规约

```typescript
describe('buildQuery', () => {
  describe('hierarchy expansion', () => {
    it('should produce filter for single-level expansion', () => {});
    it('should produce nested filters for multi-level expansion', () => {});
    it('should throw when expanding beyond hierarchy depth', () => {});
  });
});
```

- `describe` 描述模块或子能力
- `it` 用 `should + 期望行为` 句式，描述**单一观察点**
- 一个 `it` 一个 assert（或一组关于同一状态的 assert）

### 4.4 fixtures 组织

避免测试里硬编码 metadata / cellSet。提供 builder：

```typescript
// fixtures/builders.ts
export const buildViewConfig = (overrides: Partial<ViewConfig> = {}): ViewConfig => ({
  rows: [],
  columns: [],
  values: [],
  filters: [],
  rowSorts: [],
  columnSorts: [],
  pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
  customFields: [],
  extensions: null,
  ...overrides,
});

export const buildHierarchyRow = (overrides = {}) => ({
  fieldName: 'custom1624587732438',
  type: 'Hierarchy' as const,
  expandedMembers: [],
  ...overrides,
});
```

---

## 5. ADR（架构决策记录）索引

按反悔成本登记。详见各 phase 文件。

| # | 决策 | 反悔成本 | 文件 | 状态 |
|---|---|---|---|---|
| ADR-001 | ViewConfig schema 与字段命名 | 几乎不可逆 | [p0-dev.md](p0-dev.md) | ✅ Accepted |
| ADR-002 | QueryBuilder 设计为纯函数管道 | 改起来痛但可行 | [p0-dev.md](p0-dev.md) | ✅ Accepted |
| ADR-003 | CellSetParser 稀疏 → 稠密矩阵策略 | 改起来痛但可行 | [p0-dev.md](p0-dev.md) | ✅ Accepted |
| ADR-004 | Hierarchy 展开通过 filter 实现 | 改起来痛但可行（依赖后端） | [p0-dev.md](p0-dev.md) | ✅ Accepted（probe 验证通过） |
| ADR-005 | 测试框架选 Vitest | 轻易可逆 | [p0-dev.md](p0-dev.md) | ✅ Accepted |
| ADR-006 | 状态管理用 React 内置 + custom hook（不引 Redux） | 改起来痛但可行 | [p0-dev.md](p0-dev.md) | ✅ Accepted（useViewConfig + history） |
| ADR-007 | 字段表达式 Parser 选 chevrotain（vs nearley/peggy/手写） | 改起来痛但可行 | [p2-dev.md](p2-dev.md) | ⚠️ **Superseded** — 实际选择手写递归下降 parser（`core/expression/parseExpression.ts`），bundle 更小 |
| ADR-008 | 视图保存采用宿主 Callback Props（vs Imperative Handle） | 改起来痛但可行 | [p1-dev.md](p1-dev.md) | ✅ Accepted |
| ADR-009 | 表达式 AST 节点用 discriminated union | 几乎不可逆 | [p2-dev.md](p2-dev.md) | ✅ Accepted（`Expr` 类型） |
| ADR-010 | 维度分组的两个编辑器不共享抽象 | 轻易可逆 | [p2-dev.md](p2-dev.md) | ✅ Accepted |
| ADR-011 | onQuery 接收可选 AbortSignal 支持取消 | 几乎不可逆（影响 Props） | [p0-dev.md](p0-dev.md) | ✅ Accepted |
| **ADR-012** | **adhoc 即席模式与 pivot 模式共用 ViewConfig + viewMode 派生 flag** | 几乎不可逆 | 待补 | ✅ Accepted（`core/viewMode/`） |
| **ADR-013** | **滚动模式与翻页模式分两个 hook，不在一个 hook 里 if-else** | 改起来痛但可行 | 待补 | ✅ Accepted（usePivotQuery + useScrollPivotQuery） |
| **ADR-014** | **后端协议契约用 probe 脚本固化（非 mock 测试）** | 几乎不可逆 | 待补 | ✅ Accepted（18 个 probe） |
| **ADR-015** | **条件格式化 cell/row 双 scope，pivot/adhoc 双模隔离** | 改起来痛但可行 | [`../../pivot-table/docs/conditional-format-design.md`](../../pivot-table/docs/conditional-format-design.md) | ✅ Accepted |

---

## 6. PR 进 main 前的 checklist

```markdown
- [ ] 单元测试新增/修改，且本地通过
- [ ] 修改的纯函数（core/）覆盖率 ≥ 80%
- [ ] 通用语言：术语用词与 prd/2-architecture.md 第 1 节一致
- [ ] 5 分钟法则：每个新接口能在 5 分钟内写出单测，依赖能 mock
- [ ] DI：未引入直接调用 Date.now() / Math.random() / fetch 的代码
- [ ] Unix：未新增"将来可能用到"的抽象基类
- [ ] 文档同步：如果改了 ViewConfig schema，更新 prd/2-architecture.md 第 1.2 节
- [ ] commit message 用通用语言术语（不写"修复 field" 而写"修复 ViewConfig.rows[].fieldName"）
```

---

## 7. CI/CD 设计

### 7.1 PR 触发

| 阶段 | 任务 | 失败处理 | 启用时机 |
|---|---|---|---|
| Lint | ESLint + Prettier | 必须通过 | 第 1 个 PR 起 |
| 类型检查 | `tsc --noEmit` | 必须通过 | 第 1 个 PR 起 |
| 单元测试 | `vitest run --coverage` | 必须通过 + core/ 覆盖率 ≥ 80% | 第 1 个 PR 起 |
| 构建 | 组件 build + 类型声明文件 | 必须通过 | 第 1 个 PR 起 |
| E2E（main 合并前） | Playwright 跑场景 B 全流程 | 必须通过 | **P0 W4 末（E2E 用例完成后），P0 上线前必过** |
| E2E（CI 持续运行） | 每次 main 合并触发 | 失败回滚 | **P0 上线后**纳入持续 CI |

**E2E 启用规则**：P0 W4 末工程开始写 E2E（场景 B 完整流程），P0 W5 上线前必须在 Chrome/Firefox/Safari 全过；上线后纳入 CI 每次合并自动跑。**这是 P0 DoD 硬指标**（见 [p0-dev.md](p0-dev.md) 第 6 节）。

### 7.2 发版

- semver：本组件作为 npm 包（私有 registry），P0 上线 = v0.1.0
- breaking change 走 major bump，新 features 走 minor，bugfix 走 patch
- changelog 自动生成（commitlint + standard-version）

---

## 修订历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v2.0 | 2026-05-13 | 实施落地后状态同步：①测试 case 数从计划值改为实际 1092；②ADR 状态从 Proposed → Accepted（11 项），ADR-007 标 Superseded（实际用手写 parser）；③补充 ADR-012/013/014/015（实施过程中产生的 4 个新决策）；④覆盖率门槛 80% → 实测 99%+ |
| v1.1 | 2026-05-04 | 自审修订 15 项：① ADR 索引补 ADR-009/010 + 新增 ADR-011（onQuery + AbortSignal）；② CI/CD E2E 启用时机明确（P0 W4 末写、上线前必过、上线后入 CI）；③ p0-dev ADR-002 加 P0 各 translator 实现状态表（哪些是 stub）；④ 新增 ADR-011 onQuery 接收可选 ctx.signal，同步更新 2-architecture.md onQuery contract 和嵌入示例；⑤ p1-dev ADR-008 改名为"宿主 Callback Props"，明确不是 Imperative Handle；⑥ p0-dev PivotRenderer 加 P4+ 架构准备约定（CSS token / CellWrapper / RowList/ColList / i18n / data attr 装饰）；⑦ hierarchy 测试 case 重新组织（删 Case 5 重复，增"重复声明"case）；⑧ translateSorts 返回类型改 `FieldSort[]` 联合类型；⑨ 集成测试 mock 数补到 4，新增 ADR-011 ctx.signal 验证；⑩ p2-dev customElements 测试改用 parseAndValidate 拿真实 ast，3 个 case 全部可运行；⑪ ViewManager 测试展开为 4 个完整可运行的 it，删除所有 placeholder；⑫ FilterPanel 类型 P1.0 起统一用 `ClientFilter`（嵌套树结构），同步 2-architecture.md ViewConfig.filters 类型；P1.5 不再重复定义；⑬ ADR-008 提供 createLocalStorageViewStore 工具函数（不是组件内置），消除 callback vs localStorage 矛盾；⑭ p2-dev 新增 Step 6 暴露 parseAndValidate 组合函数定义；⑮ p2-dev 时间智能 P2 而非 P1.0 加工程理由说明 |
