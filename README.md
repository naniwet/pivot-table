# @company/pivot-table

Web 数据透视表组件（P0 开发中）。配套 PRD：[`../prd/`](../prd/)。

## 当前进度

**P0 Week 3 完工 — 全部代码就绪，待联调**（按 [prd/engineering/p0-dev.md](../prd/engineering/p0-dev.md) 的开发计划）

已交付（严格 TDD 顺序：测试先行）：

```
src/
├── types/                              ✅ 完整类型契约
├── fixtures/                           ✅ 测试数据 builder + 真实 metadata 简化版
├── core/
│   ├── dropRules/                     ─── 拖拽合法性 policy（pure，components 与 viewConfig 共用）
│   │   ├── dropRules                  ✅ 24 cases  P0 矩阵 + canDrop
│   │   └── dragProtocol               ✅ HTML5 dataTransfer MIME + 编解码（间接覆盖）
│   ├── metadata/fieldIndex            ✅  7 cases  Metadata O(1) 索引
│   ├── queryBuilder/                  ✅ 39 cases  主入口 + 6 translators + validators + stubs
│   ├── cellSetParser/
│   │   ├── matrixBuilder              ✅  7 cases  ADR-003 稀疏→稠密
│   │   └── parseCellSet               ✅ 13 cases  CellSet→RenderModel
│   └── viewConfig/                    ─── 五个 ViewConfig→ViewConfig 纯变更
│       ├── cycleRowSort               ✅  6 cases  排序三态：DESC→ASC→none
│       ├── setRowPage                 ✅  4 cases  翻页 + clamp >=1
│       ├── toggleHierarchyExpansion   ✅ 12 cases  drill 切换 + 自动维护祖先/后代不变量
│       ├── applyDrop                  ✅ 13 cases  字段拖入 + 自动 move 语义
│       └── removeFieldFromZone        ✅  6 cases  × 按钮移除
├── components/
│   ├── FieldTree/FieldTree            ✅ 10 cases  字段树渲染 + 搜索 + dragstart 写 dataTransfer
│   ├── DropZones/DropZones            ✅ 11 cases  4 区域 + canDrop highlight + drop/remove
│   ├── PivotRenderer/PivotRenderer    ✅ 19 cases  空/加载/错误三态 + 列头排序 + 行头 drill + 总计 + 脱敏 + tooltip
│   ├── Pagination/Pagination          ✅  8 cases  行轴翻页 + 边界禁用
│   ├── Toolbar/Toolbar                ✅  5 cases  刷新 + CSV 导出按钮
│   └── PivotTable/PivotTable          ✅  5 cases  顶层粘合 + 场景 B 4-step 集成测试
└── hooks/
    ├── useViewConfig                  ✅ 14 cases  受控/非受控 + 6 actions reducer
    └── usePivotQuery                  ✅ 12 cases  L0 缓存 + ADR-011 取消 + 3-失败熔断 + refetch

src/core/export/csvExport             ✅  8 cases  RFC 4180 风格 + 总计行 + 脱敏/EMPTY_CELL

src/api/smartbi/SmartbiClient         ✅ 12 cases  Smartbi 后端适配器
                                                    GET resourcetreedata + POST queryFromSmartCubeByName
                                                    auth (token/cookie) + AbortSignal + 错误包装
```

**测试总数**：251 cases（全部按 TDD 节奏：先写 .test.ts 再写实现）
**core/ 覆盖率**：99%+（远超 p0-dev 80% 门槛）
**测试基础设施**：vitest 1.6 + @testing-library/react 14（jsdom 仅 components/hooks，core 跑 node）

## 使用

```bash
npm install        # 安装依赖
npm run typecheck  # TypeScript 严格模式
npm test           # vitest 跑全部测试
npm run test:coverage  # 看 core/ 覆盖率（目标 ≥ 80%）
```

## 下一步（P0 Week 3-4）

按 [p0-dev.md](../prd/engineering/p0-dev.md) 第 2 节模块开发顺序：

- [x] CellSetParser + matrixBuilder
- [x] FieldTree 组件
- [x] dropRules.ts 数据驱动表 + dragProtocol（HTML5 dataTransfer）
- [x] ViewConfig 纯变更（cycleRowSort / setRowPage / toggleHierarchyExpansion / applyDrop / removeFieldFromZone）
- [x] useViewConfig hook（受控/非受控、6 个 actions）
- [x] DropZones 组件（4 zone + highlight/grey + drop + remove）
- [x] usePivotQuery hook（ADR-011 取消机制 + L0 缓存 + 3-失败熔断 + refetch）
      _注：L1 翻页缓存延后；按需在场景 B 翻页性能不达标时再加_
- [x] PivotRenderer（空/加载/错误三态 + 列头 + drill + 总计 + 脱敏 + tooltip）
- [x] Pagination（仅行轴 + 边界禁用）
- [x] Toolbar（刷新 + CSV 导出按钮）
- [x] csvExport（pure，RFC 4180）
- [x] **PivotTable 顶层组件 + 场景 B 集成测试（4-step drill+sort 通过）**
- [x] **SmartbiClient 适配器 + probe 真实后端连通**
      _GET resourcetreedata 和 POST queryFromSmartCubeByName 都跑通；返回 metadata + cellset 形态确认与 types 99% 对齐_
- [ ] E2E（Playwright，场景 B 跨浏览器跑通）— 需真实数据集
- [ ] ADR-004 hierarchy 展开机制实地验证（连续 drill 江苏 → 苏南 → 南京 走真后端）
- [ ] 嵌入到 1 个真实业务系统的 demo

## 联调与 Schema 对齐（2026-05-05）

后端 [schemas/query-schema.json](schemas/query-schema.json) 和 [schemas/cellset-schema.json](schemas/cellset-schema.json) 是 source of truth。

**Schema 对齐修正（vs 我手写的 types）**：

| 修正 | 位置 |
|---|---|
| `Aggregator` 重复导出 → 拆为 `metadata.MetadataAggregator` 与 `query.Aggregator`（两个 enum 值不一致是后端历史包袱） | [types/metadata.ts](src/types/metadata.ts) |
| `DataType` → `ValueType`（schema 名）；`'ASCII'` → `'ASCII_CODE'`；保留 `DataType` 别名兼容 | [types/metadata.ts](src/types/metadata.ts) |
| `Filter` union 缺 `NoneFilter` → 已补 | [types/query.ts](src/types/query.ts) |
| `buildSort` 对 `ByDimension` 分支构造错（pre-existing） → 改判别式 | [fixtures/builders.ts](src/fixtures/builders.ts) |

**真实后端 probe 修正**（运行 `scripts/probe-backend.ts` 对比 schema 和 reality 后发现）：

| 修正 | 真实响应 vs schema |
|---|---|
| `Metadata.namedsets: FieldNode \| null`（之前 FieldNode）| 数据集无命名集时实际返回 `null` |
| `ColumnMetaData.levelType: string \| { type: string } \| null` | schema 说 `{type: string}`，真实是裸字符串 `"TIME_YEAR"`；用 union 兼容两种 |

`npm run typecheck` 现已 0 错误，`npm test` 235/235 全绿。

## 本地 Demo（可视化联调）

```bash
cp .env.local.example .env.local
# 编辑 .env.local 填入 VITE_SMARTBI_TOKEN

npm run dev
# 浏览器开 http://localhost:5173
```

Vite dev 用 proxy 转发 `/smartbi/**` 到真实后端（默认 10.10.202.100:28082），规避 CORS。
Demo 启动后从字段树拖 LEVEL 字段到行轴 + measure 到值，可看到真实数据渲染。
**drill ▶▼ 在 demo 中暂未启用 — 见 [ADR-004-finding.md](ADR-004-finding.md) 待 C2 重写**。

## 已知限制（P0 → P1 follow-up）

| 限制 | 影响 | 来源 |
|---|---|---|
| ~~drill ▶▼ 不工作~~ ✅ **已修**（ADR-004 C2 已落地） | drill = 全局轴深度 +1，rows 数组加新 level 字段重发 query | [ADR-004-finding.md](ADR-004-finding.md) |
| **CSV 导出仅当前页**（≤ 50 行） | 大数据量场景不支持全量 CSV | 已确认不做后端导出（用户决定）；如未来需要，后端要加专门 export endpoint |
| L1 翻页缓存未实现 | 翻页性能可能不达 PRD 预期 | 按需在压测后决定要不要补 |

## 嵌入 Smartbi 业务系统的最简用法

```tsx
import { PivotTable, SmartbiClient, buildViewConfig, buildHierarchyRow, buildValueField } from '@company/pivot-table';

const client = new SmartbiClient({
  baseUrl: 'http://10.10.202.100:28082/smartbi/smartbix',  // 注意带 /smartbix
  auth: { token: 'st_eyJ...' },     // 或 useCookies: true 走浏览器 session
});

// 1. 加载 metadata
const metadata = await client.fetchMetadata('I8a8aa3ed018ff259f259763901900f943a901c9a');

// 2. 渲染
<PivotTable
  metadata={metadata}
  defaultValue={buildViewConfig({
    rows: [buildHierarchyRow({ fieldName: 'the_date_Year2' })],
    values: [buildValueField({ measureName: '销售额_m' })],
  })}
  onQuery={client.asOnQuery()}     // ← 一行接通后端查询，含 AbortSignal 取消
/>
```

`SmartbiClient` 是后端适配器，理论上可单独成 package；当前与 pivot-table 同 repo 方便联调。
PivotTable 组件本身完全后端无关，只通过 `onQuery` callback 协作。

## ADR 联调阻塞项

- [ ] **ADR-004** P0 W1.D2 - W2.D5：和后端联调 hierarchy 展开机制（[详见 ADR-004](../prd/engineering/p0-dev.md#adr-004-hierarchy-展开通过-filter-实现待后端联调验证)）
- [ ] **PRD 阻塞项 1-6**：metadata API、PageSettings 默认值、嵌入业务系统、错误码、hierarchy 用户预期、埋点平台

## 开发约定

参见 [prd/engineering/README.md](../prd/engineering/README.md)：

- 严格 TDD：先写测试，再写最简实现，最后重构
- core/ 内禁止依赖 React/DOM/IO/全局状态/时间
- 通用语言：术语、字段命名按 [prd/2-architecture.md 第 1 节](../prd/2-architecture.md) 锁定
- 5 分钟法则：每个新接口能在 5 分钟内写出单测，依赖能 mock
