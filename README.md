# pivot-table

可嵌入 Web 数据透视表组件 — TypeScript + React。基于 Smartbi 后端 query 协议设计,但**核心组件后端无关**:只要能实现 `Metadata + onQuery → CellSet` 协议,任何数据源都能接(Excel / 本地 JSON / 自家 BFF 等)。

> 本仓库私有。1071+ 单测覆盖。生产可用。

---

## 快速开始

```bash
npm install
cp proxy/configs.json.example proxy/configs.json    # 配 Smartbi URL + token + modelId
npm run dev                                          # 同时启 vite (5173) + Express proxy (3100)
```

浏览器开 http://localhost:5173,顶部"Smartbi 配置"切换器选环境,字段树拖字段到行/列/数值/筛选区开始用。

`proxy/configs.json` 在 `.gitignore` 里,**真 token 不入库**。`.example` 模板可参考。

---

## 核心能力

### 数据交互
- 字段拖拽 → 行/列/数值/筛选 4 区(双击 / checkbox / 右键菜单 多种添加方式)
- **透视模式**(Pivot,聚合查询)+ **即席查询模式**(Adhoc,SQL 直连明细)— segmented control 一键切换
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

### Demo 集成(可选,仓库自带)
- Express proxy(`proxy/server.js`)解决浏览器 CORS:`/proxy/<configId>/*` 反代到 Smartbi,Token 自动注入
- `SmartbiConfigManager` UI(GitHub-style picker)管理多套数据源(URL / token / modelId)
- 配置存 `proxy/configs.json`,UI 表单增删改

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

`PivotTable` 只依赖 `Metadata` + `onQuery` 协议,**不知道**有 Smartbi 这回事。
`SmartbiClient` 只是其中一种实现,放在 `src/api/smartbi/`,demo 里组装。

要换数据源(如 Excel),写一个新 client 实现同样协议即可 — 见 [架构 — 加新数据源](#架构-加新数据源)。

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
├── api/smartbi/            SmartbiClient — 一种 onQuery 实现
└── fixtures/               测试 metadata + cellset builder

demo/                       Demo 入口 + Smartbi 配置管理 UI
proxy/                      Express dev proxy(CORS bypass + token 注入)
scripts/probe-*.ts          后端协议契约 probe(锁住 schema 漂移)
schemas/                    后端 query / cellset JSON schema(source of truth)
```

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

`scripts/probe-*.ts` 用真后端 token 验证 query/cellset 形态没漂移:

```bash
SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-baseline.ts          # 基础 PivotQuery
SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-final.ts             # customElements(enum/range)
SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-calc-final.ts        # calc_measure
SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-adhoc-end-to-end.ts  # adhoc + measure-as-filter
# ... 等
```

CI workflow(`.github/workflows/ci.yml`)在手动 dispatch 时跑 probe smoke。

---

## 嵌入用法(基本接入)

```tsx
import { PivotTable, SmartbiClient, buildViewConfig, buildValueField } from '@company/pivot-table';

const client = new SmartbiClient({
  baseUrl: 'http://your-smartbi/smartbix',
  auth: { token: 'st_xxx' },          // 或 useCookies: true
});

const metadata = await client.fetchMetadata('your-model-id');

<PivotTable
  metadata={metadata}
  defaultValue={buildViewConfig({
    rows: [{ fieldName: 'the_date_Year2', type: 'Dimension' }],
    values: [buildValueField({ measureName: '销售额_m' })],
  })}
  onQuery={client.asOnQuery()}        // 含 AbortSignal 取消
  onChange={(viewConfig) => {/* 持久化 viewConfig */}}
/>
```

可控 vs 不可控:
- **不可控**(简单嵌入):传 `defaultValue`,组件自管 viewConfig
- **可控**(viewConfig 跟应用 state 同步):传 `value` + `onChange`

---

## 架构 — 加新数据源

`PivotTable` 只要满足 `Metadata + onQuery` 协议,数据源就能换。新数据源(如 Excel)的伪代码:

```ts
// 1. 解析数据源 → Metadata
const metadata: Metadata = parseXlsxToMetadata(xlsxFile);

// 2. 实现 onQuery
const onQuery = async (query: Query): Promise<CellSet> => {
  const filtered = applyDimensionFilter(rows, query.dimensionFilter);
  const aggregated = groupByAndAggregate(filtered, query.rows, query.columns);
  return buildCellSet(aggregated, query.pageSettings);
};

// 3. 像 SmartbiClient 一样接进来
<PivotTable metadata={metadata} onQuery={onQuery} ... />
```

具体可行性 / 工作量见私有讨论。Excel 路径需要自己写 in-memory OLAP(group-by + aggregate),工作量 ~半周(adhoc 模式)~ 一周(完整透视聚合)。

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
