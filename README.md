# pivot-table

可嵌入 Web 数据透视表组件 — TypeScript + React。**核心组件后端无关**:只要能实现 `Metadata + onQuery → CellSet` 协议,任何数据源都能接(OLAP / SQL / Excel / 本地 JSON / 自家 BFF 等)。

> 本仓库私有。1071+ 单测覆盖。

---

## 快速开始

```bash
npm install
npm test           # 1071+ 单测
npm run typecheck  # TypeScript strict
```

跑 demo(连真后端的端到端联调)需要先配数据源 — 详见 [demo/README](#demo-端到端联调)。

---

## 核心能力

### 数据交互
- 字段拖拽 → 行/列/数值/筛选 4 区(双击 / checkbox / 右键菜单 多种添加方式)
- **透视模式**(Pivot,聚合查询)+ **即席查询模式**(Adhoc,明细行级直查)— segmented control 一键切换
- Hierarchy 钻取(行轴 ▶/▼ drill;列轴 collapsed parent)
- 5 种自建字段:`calc_measure` / `calc_column` / `enum_group` / `range_group` / `dim_as_measure`
- 过滤树(AND/OR 嵌套);维度过滤 / 度量过滤(HAVING)分段
- 多维排序(ByDimension / ByMeasure;ASC/DESC + 分组内 BASC/BDESC;Shift+点击多列)

### 展示与导出
- **三种显示模式**:表格 / 图表(echarts:bar/line/pie)/ 树状(lazy-load)
- 条件格式化(threshold + dataBar);per-measure scope
- 列宽拖拽;冻结列头 / 行头 sticky
- 行表头 merge / tree 模式;列头同样
- 翻页:页码翻页器 / **滚动加载**(行累积,触底自动 fetch 下一页)
- 导出:CSV(当前页)/ Excel(全量,可配 maxRows;数值类型保留可 SUM)

### UI 形态
- **浏览模式**:沉浸视图,隐藏所有 chrome,只看数据 — 右上角浮动退出按钮 / Esc
- 三面板独立可收起(工具栏 / 字段面板 / 字段树),localStorage 持久化
- 列头右键菜单:升序/降序/取消 / 复制
- 行/列头成员右键菜单:筛选=X(In)/ 排除此项(NotIn)/ 复制
- chip 右键菜单(zone 内字段):排序 / 移动 / 快速计算 / 显示小计/总计 / 条件格式化 / 删除

---

## 架构

### 解耦边界

```
┌─ 你的宿主应用 ──────────────────────────────┐
│                                              │
│  fetchMetadata(modelId) → Metadata          │  ← 你实现
│  onQuery(query) → CellSet                   │  ← 你实现
│             │                                │
│             ▼                                │
│  <PivotTable metadata onQuery /> ←── 本组件 │
│                                              │
└──────────────────────────────────────────────┘
```

`PivotTable` 只依赖 `Metadata` + `onQuery` 协议,**不知道数据从哪来**。
仓库自带一个具体后端 client(在 `src/api/` 下,demo 联调用),作为接入参考。

要换/加数据源,写一个新 client 实现同样协议 — 见 [加新数据源](#加新数据源)。

### 目录结构

```
src/
├── types/                  类型契约(Query / CellSet / Metadata / ViewConfig)
├── core/                   纯逻辑,无 React/DOM 依赖
│   ├── queryBuilder/       ViewConfig + Metadata → Query(含 6 个翻译器)
│   ├── cellSetParser/      CellSet → RenderModel(矩阵 + 行/列头树 + 总计)
│   ├── viewConfig/         ViewConfig 纯变更(reducer 用)
│   ├── viewMode/           派生 mode flag(单源,避免散乱 isAdhoc 检查)
│   ├── dropRules/          拖拽合法性策略(透视/即席分别)
│   ├── filterTree/         Filter 树纯函数(AND/OR 嵌套编辑)
│   ├── conditionalFormat/  threshold + dataBar 计算
│   ├── chart/              ECharts series 构造
│   ├── tree/               树状模式 lazy-load
│   ├── export/             csvExport + xlsxExport(纯转换,不下载)
│   ├── drillThrough/       钻取明细 query 构造
│   └── ...
├── hooks/                  React hooks
│   ├── useViewConfig       ViewConfig reducer(受控/非受控双模式)
│   ├── usePivotQuery       paged 模式查询(L0 cache + 熔断 + AbortSignal)
│   ├── useScrollPivotQuery 滚动模式查询(累积 cellSet + loadMore + 重置)
│   ├── useTagMenu          chip 右键菜单 items
│   ├── useCellMenu         数据单元格右键菜单 items
│   ├── useColumnHeaderMenu 列头/corner/度量列头 右键菜单 items(排序+复制)
│   ├── useMemberContextMenu 行/列头成员右键菜单 items(In/NotIn 过滤)
│   └── ...
├── components/             React 组件
│   ├── PivotTable/         顶层粘合
│   ├── PivotRenderer/      透视表渲染(merge/tree 模式 + 列树)
│   ├── DetailRenderer/     即席模式平铺渲染
│   ├── ChartRenderer/      echarts 渲染
│   ├── TreeRenderer/       树状模式渲染
│   ├── FieldTree/          字段树(右侧 panel)
│   ├── DropZones/          4 区拖拽承载
│   ├── FilterPanel/        过滤条件区(AND/OR 树编辑器)
│   ├── Toolbar/            工具栏(刷新/模式切换/导出/设置/浏览)
│   ├── SettingsModal/      设置弹窗
│   ├── ContextMenu/        通用右键菜单(嵌套支持 + 边缘自动翻转)
│   └── ...
├── api/                    后端适配器(实现 onQuery 协议的 client 实现)
└── fixtures/               测试 metadata + cellset builder

demo/                       Demo 入口 + 数据源管理 UI
proxy/                      Express dev proxy(规避浏览器 CORS + 注入认证 header)
scripts/probe-*.ts          后端协议契约 probe(锁住 schema 漂移)
schemas/                    后端 query / cellset JSON schema(source of truth)
```

---

## 嵌入用法

```tsx
import { PivotTable, buildViewConfig, buildValueField } from '@company/pivot-table';

// 1. 你的应用准备 metadata + onQuery(从你自己的后端 / Excel / 内存数据源)
const metadata = await myFetchMetadata(modelId);

const onQuery = async (query, ctx) => {
  // 把 query 翻译成你后端的协议,返回 CellSet
  return myBackend.run(query, ctx.signal);
};

// 2. 渲染
<PivotTable
  metadata={metadata}
  defaultValue={buildViewConfig({
    rows: [{ fieldName: 'date_year', type: 'Dimension' }],
    values: [buildValueField({ measureName: 'sales' })],
  })}
  onQuery={onQuery}
  onChange={(viewConfig) => {/* 持久化 viewConfig */}}
/>
```

**可控 vs 不可控**:
- 不可控(简单嵌入):传 `defaultValue`,组件自管 viewConfig
- 可控(viewConfig 跟应用 state 同步):传 `value` + `onChange`

仓库自带一个**示例 client**(`src/api/`),实现了 `Metadata + onQuery` 协议接到一个具体 OLAP 后端。可以参考它来写自己的接入。

---

## 加新数据源

只要满足 `Metadata + onQuery` 协议,任何数据源都能接。Excel 数据源伪代码:

```ts
// 1. 解析数据源 → Metadata
const metadata: Metadata = parseXlsxToMetadata(xlsxFile);

// 2. 实现 onQuery — 在内存里跑 group-by / filter / sort
const onQuery = async (query: Query): Promise<CellSet> => {
  const filtered = applyDimensionFilter(rows, query.dimensionFilter);
  const aggregated = groupByAndAggregate(filtered, query.rows, query.columns);
  return buildCellSet(aggregated, query.pageSettings);
};

// 3. 接进来
<PivotTable metadata={metadata} onQuery={onQuery} ... />
```

工作量参考(纯前端,无后端):
- adhoc only(行级过滤+排序+分页,不聚合):~半周
- 完整透视(group-by + aggregate + 嵌套 dim):~1 周
- 生产级(Web Worker 异步、>10k 行优化、formula 列):~2 周+

---

## Demo 端到端联调

仓库自带一个 demo,跑通从"配数据源 → 拉 metadata → 渲染 PivotTable → 发查询拿数据"的完整链路。

**架构**:
```
浏览器 (vite:5173)
   │  fetch /proxy/<id>/...
   ▼
Express proxy (3100)        ← proxy/server.js
   │  转发 + 注入认证 header
   ▼
你的真实后端
```

**启动**:
```bash
cp proxy/configs.json.example proxy/configs.json    # 编辑填上你的后端 URL / token / modelId
npm run dev                                          # 同时启 vite + proxy
```

`proxy/configs.json` 在 `.gitignore` 里 — **真 token 不入库**。
浏览器开 http://localhost:5173,顶部"数据源"切换器选环境,拖字段开始用。

UI 上还可以增删改多套配置(比如测试环境 / 预发 / 生产),配置直接落到 `proxy/configs.json`(不重启 proxy 即生效)。

---

## 开发

```bash
npm run dev          # vite + proxy 并行(localhost:5173)
npm test             # vitest 跑全部 1071+ 测试
npm run typecheck    # tsc --noEmit
npm run test:watch
npm run test:coverage
npm run build:demo   # 构建 demo 静态产物
```

### 测试基础设施

- vitest 1.6 + @testing-library/react 14
- core/ 跑 node 环境;components/hooks 跑 jsdom
- core/ 覆盖率门槛 80%(实测 99%+)
- TDD 节奏:**先写 .test.ts 再写实现**

### Probe 脚本(后端协议契约)

`scripts/probe-*.ts` 用真后端 token 验证 query/cellset 形态没漂移。每个 probe 锁一个具体协议路径(基础查询、calc_measure、enum/range 自建字段、adhoc 模式 等):

```bash
SMARTBI_TOKEN=xxx npx tsx scripts/probe-baseline.ts          # 基础 PivotQuery
SMARTBI_TOKEN=xxx npx tsx scripts/probe-final.ts             # 自建字段 (enum/range)
SMARTBI_TOKEN=xxx npx tsx scripts/probe-calc-final.ts        # 计算度量
SMARTBI_TOKEN=xxx npx tsx scripts/probe-adhoc-end-to-end.ts  # adhoc + measure-as-filter
```

CI workflow(`.github/workflows/ci.yml`)在手动 dispatch 时跑 probe smoke。

---

## ADR / 关键设计决定

- [ADR-004](ADR-004-finding.md) — Hierarchy drill 用 OLAP 轴深度而非 filter
- `viewMode.ts` — 派生 mode flag,避免散乱 isAdhoc / displayMode 检查
- `useScrollPivotQuery` — 行累积 + 触底加载;独立于 paged 模式 hook
- 表头右键菜单 / chip 右键菜单 / 单元格右键菜单 各走独立 hook
- `proxy/server.js` 的 body parser 限定到 `/api`,避免吃掉 `/proxy` POST body 的经典 http-proxy-middleware 坑

## 已知限制 / 未做

| 项 | 状态 |
|---|---|
| Excel 数据源接入 | 架构支持,具体实现未做 |
| 大数据量(>50k 行)全量 Excel 导出 | 当前走"加大 pageSize 一次拉全",上限 100k;真"无上限"需后端 stream endpoint |
| 真 Top-N 过滤 | 删除(2026-05-06);走分页 + 排序替代 |
| Hierarchy 行的精确 level 过滤 | 用 hierarchyFieldName 兜底;细化待后端能力 |
| Tree mode 行头右键菜单 | 暂跳过(merge mode 已接);后续可补 |
| L1 翻页缓存 | 未实现;按需做 |
| E2E 测试 | 未加(单测充分;需 Playwright + 真 endpoint) |

---

## 开发约定

- **严格 TDD**:先写测试 → 写最简实现 → 重构
- **core/ 内禁止**依赖 React / DOM / IO / 全局状态 / 时间
- **5 分钟法则**:每个新接口能在 5 分钟内写出单测,依赖能 mock
- **probe 优先**:跟后端协议有疑问的 → 写 probe 脚本实测,**不靠猜**
- **trade-off 显式**:每个关键决策注释附"收益 / 代价 / 何时翻案"
