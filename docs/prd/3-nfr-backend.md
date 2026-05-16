# 3. 非功能需求与后端契约

> **📍 实施状态**：性能/缓存/错误处理/埋点 接口/浏览器/i18n 范围都按 PRD 落地。
>
> **后端契约**已通过 18 个 probe 脚本固化（`../pivot-table/scripts/probe-*.ts`），不再依赖人工口头对齐。schema 漂移任意一项 probe 都会立刻报错，作为后端协议契约的"活文档"。

## 1. 性能

| 指标 | 目标 | Phase | 备注 |
|---|---|---|---|
| 首屏（含 metadata 加载） | < 2 秒 | P0 | metadata 文件应缓存，复访 < 500ms |
| 拖拽 → 触发 query 间隔 | < 100ms（debounce） | P0 | 不含 query 时间 |
| 渲染单页（默认 50×50 ≤ 2500 单元格） | < 200ms（不含 query 时间） | P0 | 原生 DOM，不需虚拟滚动 |
| Query 取消（用户连续操作时） | 必须支持 | P0 | 旧请求取消，避免乱序 |
| 单页支持上限 | 后端单次返回 ≤ rowPageSize × columnPageSize（默认 2500 cells） | P0 | 超出范围必须翻页 |

**说明**：本组件不为单页超过分页范围的大量 cells 做性能保证。如果业务场景需要展示数万 cells，需要：
- P0 阶段：调小默认 pageSize 强制翻页
- P4+ 阶段：评估虚拟滚动方案

---

## 2. 缓存（明确分层）

| 层级 | 责任方 | 范围 | 控制 |
|---|---|---|---|
| **L0 — 组件内 query 去重** | PivotTable 组件 | 按 `Query` JSON 的 hash 去重，避免连续拖拽产生 N 个相同请求；命中后短期内（默认 30 秒）复用上次结果 | 通过 `cacheType` prop 控制：`CACHE`（默认）/`UNCACHE`（透传）/`CLEAR`（清并重查） |
| **L1 — 翻页缓存** | PivotTable 组件 | 同一 viewConfig 下的不同 page 缓存（最多 20 页），用户来回翻页不重复查 | 同上 |
| **L2 — 业务级缓存** | 宿主在 `onQuery` 内自定义 | 跨视图/跨用户复用、Redis/CDN 等 | 宿主自己实现 |

**职责边界**：
- 组件**不做**业务级缓存（不知道鉴权/租户/失效策略）
- 宿主**不需要**做 query 级去重（组件 L0 已处理）
- 用户点"刷新"按钮 → 组件清 L0/L1 + 透传 `cacheType: CLEAR` 给宿主

---

## 3. 错误处理与恢复

| 错误类型 | 行为 | viewConfig 状态 |
|---|---|---|
| Query 失败（业务错误） | 顶部 banner 显示后端 message，重试按钮；旧数据保留可继续阅读 | 不回滚（用户可继续操作） |
| Query 失败（网络/超时） | "加载失败，请重试"，重试按钮 | 不回滚 |
| Metadata 失败 | 阻塞性错误，整个组件展示错误页 + 重试 | — |
| 字段已删除/重命名 | viewConfig 容错（保留配置项，红框标记，提示用户移除） | 保留，不自动删除 |
| 字段无访问权限 | 字段树置灰；已配置的字段提示并允许移除 | 保留 |
| 用户操作期间发生错误 | 当前操作不生效，但 viewConfig 不回滚；用户可手动撤销 | 不回滚 |
| 连续多次 query 失败（≥ 3 次） | 自动暂停后续 query，显示"操作过快，请检查后重试" | — |

**关键原则**：viewConfig **永不自动回滚**。即使 query 失败，用户的拖拽配置也保留 — 让用户自己决定撤销或调整。这避免了"我刚拖的字段莫名其妙没了"的体验灾难。

---

## 4. 可访问性 — P2+

- 键盘导航（Tab / 方向键）
- ARIA 标签（表头、单元格、按钮）
- 暗色模式（CSS variables 切换）

P0 不做，但 CSS 设计要为暗色模式预留 token 化空间。

---

## 5. 浏览器兼容

- Chrome / Edge：最近 2 个大版本
- Firefox：最近 2 个大版本
- Safari：最近 2 个大版本
- ❌ 不支持 IE

---

## 6. 国际化

| Phase | 范围 |
|---|---|
| P0–P2 | 仅 zh-CN |
| P4+ | 增加 en-US，UI 字符串集中管理 |

⚠️ 注意：metadata 中的字段 alias、measure name、dataFormat 标识（如"百分比"、"yyyy年Q季"）大部分是中文。即使做 en-US，metadata 内容仍由 Smartbi 后端提供，本组件不翻译。

---

## 7. 埋点与度量

P0 必埋点（让 1-product.md 1.4 节"成功度量"可测量）：

| 事件名 | 触发时机 | 关键属性 |
|---|---|---|
| `pivot.view_loaded` | 默认视图首次渲染完成 | modelId, viewConfig, loadDuration |
| `pivot.field_dragged` | 用户拖拽字段到 DropZone | fieldName, fieldType, sourceZone, targetZone |
| `pivot.field_removed` | 用户从 DropZone 移除字段 | fieldName, zone |
| `pivot.drill` | 用户展开/折叠 hierarchy 节点 | direction(expand/collapse), level, memberPath |
| `pivot.sort_changed` | 用户切换排序 | field, direction |
| `pivot.page_changed` | 翻页 | axis(row/column), pageNo |
| `pivot.export` | 用户导出 | format(csv/xlsx), rowCount |
| `pivot.refresh` | 用户点刷新 | — |
| `pivot.error` | 任意错误 | type(query/metadata/network), message |
| `pivot.query` | 每次发起 query | queryHash, fromCache(L0/L1/none), duration |

**P1+ 增量**：`quickcalc_applied` / `filter_applied` / `view_saved` / `expression_created` / `group_created` 等。

**实现方式**：通过 props 提供 `onTrack: (event, properties) => void` 回调，由宿主对接埋点平台。组件不直接发送埋点。

⚠️ 阻塞项：埋点平台的具体格式（GA / 神策 / 自研？）必须 P0 启动前对齐 — 见 [1-product.md](1-product.md) 第 5 节阻塞项 6。

---

## 8. 后端契约

### 8.1 Query 接口（已存在，不改动）

- **Endpoint**：`POST /smartbi/smartbix/api/augmentedQuery/queryFromSmartCubeByName`
- **Request schema**：见 `query-schema.json`
- **Response schema**：见 `cellset-schema.json`
- **认证**：复用宿主系统的 cookie / token，由宿主在 `onQuery` 内处理

### 8.2 Metadata 接口（已存在）

- 返回字段树 JSON，结构见 metadata 样例
- **待确认**：具体 endpoint URL 和参数（见 [1-product.md](1-product.md) 阻塞项 1）

### 8.3 对后端的诉求清单 — 已通过 probe 脚本固化

> **现状**：原 9 项后端诉求**全部已对齐**，并通过 18 个 probe 脚本固化为可重跑契约。任何 schema 漂移会被对应 probe 立刻发现。

| # | 原诉求 | 状态 | 锁定 probe |
|---|---|---|---|
| 1 | metadata 接口 URL 和参数 | ✅ | `probe-metadata-level-lookup.ts` + `SmartbiClient` |
| 2 | PageSettings 默认值 | ✅ | `probe-baseline.ts` |
| 3 | 错误码规范 | ✅ | 已在 `usePivotQuery` + `ErrorBoundary` 集中处理 |
| 4 | Query 超时和取消 | ✅ | `usePivotQuery` 实现 AbortSignal（按 ADR-011） |
| 5 | EnumGroupColumn / RangeGroupColumn schema | ✅ | `probe-final.ts` + `probe-customelement.ts` |
| 6 | CustomCalcMeasure MDX 校验/容错 | ✅ | `probe-calc-final.ts` + `probe-calc-measure.ts` |
| 7 | 维度成员加载接口 | ✅ | `core/queryBuilder/buildMemberQuery.ts` |
| 8 | DrillThrough 接口形态 | ✅ DetailQuery + filter 方案，`probe-adhoc-end-to-end.ts` 锁定 |
| 9 | Query 大小上限 | ✅ 已定 `DRILL_THROUGH_MAX_ROWS`，宿主可调 |

**完整 probe 清单**（`../pivot-table/scripts/probe-*.ts`）：

| Probe | 锁定的协议 |
|---|---|
| probe-baseline | 基础 PivotQuery |
| probe-final | 自建字段（enum/range） |
| probe-calc-final / probe-calc-measure | 计算度量 |
| probe-calc-column | 行级计算字段 |
| probe-adhoc-cross / probe-adhoc-end-to-end | adhoc 模式 + 度量过滤 |
| probe-adhoc-customdim-filter | adhoc 维度过滤 |
| probe-adhoc-measure-filter | adhoc 度量 having |
| probe-customelement | customElements 各种类型 |
| probe-define-fields | 字段定义边界 case |
| probe-metadata-level-lookup | metadata level 查找 |
| probe-leveltype-real | level type 真实形态 |
| probe-edge-cases | 边界 case 集合 |
| probe-correct-shape | 形态 happy path |
| probe-bisect | 二分定位 schema 差异工具 |
| probe-same-view | 同视图复现 |
| probe-backend / probe-define-fields | 背景探测 |
| probe-output | 输出格式参考 |

可一键 smoke：`npm run probe:smoke`（baseline + final + calc + adhoc）。
