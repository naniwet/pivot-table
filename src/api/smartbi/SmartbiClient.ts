/**
 * SmartbiClient — 把 Smartbi 后端两个接口包成一个轻量 client
 *
 * 职责（Unix）：
 *   - URL / headers / auth 拼装
 *   - JSON 解码 + 错误包装（保留 status + body 前若干字符）
 *   - AbortSignal 透传（ADR-011）
 *
 * 不做：
 *   - 缓存（usePivotQuery 已 L0 缓存）
 *   - 重试（usePivotQuery 失败熔断 + refetch）
 *   - 不做请求拦截 / 全局错误 toast — 那是宿主应用的事
 *
 * 架构边界：
 *   本文件是 Smartbi 后端**适配器**，理论上应在独立 package。P0 同 repo 方便联调；
 *   pivot-table 组件本身（[PivotTable.tsx](../../components/PivotTable/PivotTable.tsx)）
 *   完全后端无关，只通过 `onQuery` callback 与本 client 协作。
 *
 * 真实接口（用户提供的 curl 示例）：
 *   GET  /api/pages/resourcetreedata/?providerName=null&datasetId=<id>      → metadata
 *   POST /api/augmentedQuery/queryFromSmartCubeByName  body: Query JSON     → CellSet
 */

import { normalizeMetadata } from '../../core/metadata/normalizeMetadata.js';
import type { CellSet } from '../../types/cellSet.js';
import { smartbiErrorFromResponse } from '../../types/error.js';
import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';

/**
 * Smartbi 资源目录树节点(/api/catalogs/withPathChildren 返回元素)。
 *   - 文件夹:type='DEFAULT_TREENODE' / 'SELF_TREENODE' / *_FOLDER,children=null 表示未展开
 *   - 数据模型(叶子):type='AUGMENTED_DATASET' / 'MT_MODEL' / 'TABULAR_DATASET' 等,id 即 modelId
 *
 * children 一律 null — 接口是 lazy 的,每个文件夹要再调一次接口拿子节点。
 */
export interface CatalogNode {
  id: string;
  name: string;
  alias: string;
  desc: string;
  type: string;
  order?: number;
  children: CatalogNode[] | null;
  pid: string | null;
  aliasPath: string;
  extended?: string | null;
}

/** 数据模型根 id — fetchCatalogChildren 的起点 */
export const PUBLIC_DATASET_ROOT_ID = 'PUBLIC_DATASET';

/**
 * fetchCatalogChildren 接受的资源类型集合 — 把文件夹 + 各类"模型/数据集"都拉出来,
 * 用户在 picker 里看完整目录就行,选叶子时再过滤(isCatalogLeaf 判断)。
 */
export const DEFAULT_CATALOG_ACCEPT_TYPES: readonly string[] = [
  'DEFAULT_TREENODE',
  'SELF_TREENODE',
  'AUGMENTED_DATASET',
  'MT_MODELS',
  'MT_MODEL',
  'MT_DATAMODELS',
  'TABULAR_DATASET',
  'TABULAR_DATASET_METRICS_SET',
  'TABULAR_DATASET_METRICS_SET_FOLDER',
];

/** 节点是不是"可选的数据模型叶子"(对应 ModelPicker 的选中目标) */
export function isCatalogLeaf(node: CatalogNode): boolean {
  return (
    node.type === 'AUGMENTED_DATASET' ||
    node.type === 'MT_MODEL' ||
    node.type === 'TABULAR_DATASET' ||
    node.type === 'TABULAR_DATASET_METRICS_SET'
  );
}

/** 节点是不是"可展开文件夹" — 跟 isCatalogLeaf 互补,其他 type 当 unknown,UI 渲染时按文件夹处理 */
export function isCatalogFolder(node: CatalogNode): boolean {
  return !isCatalogLeaf(node);
}

export interface SmartbiAuth {
  /** JWT token (e.g. `st_eyJ...`)；以 `Authorization: Bearer <token>` 发送 */
  token?: string;
  /** 浏览器复用 cookie session（`fetch credentials: 'include'`） */
  useCookies?: boolean;
}

export interface SmartbiClientOptions {
  /** 后端根,如 `http://your-host:port/smartbi` */
  baseUrl: string;
  auth?: SmartbiAuth;
  /** 自定义 fetch（测试 / SSR 注入），默认 globalThis.fetch */
  fetch?: typeof globalThis.fetch;
  /**
   * 是否对响应附 `smx-encode: encode` 头（FieldTree metadata 接口在用户 curl 里带；
   * query 接口没带）。按需打开。
   */
  smxEncode?: boolean;
}

export class SmartbiClient {
  private readonly baseUrl: string;
  private readonly auth: SmartbiAuth;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly smxEncode: boolean;

  constructor(opts: SmartbiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.auth = opts.auth ?? {};
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.smxEncode = opts.smxEncode ?? false;
  }

  /**
   * GET 数据集元数据 — 用 AugmentedDataSet 接口(2026-05-07 改),
   * 直接返回新 Metadata 类型(views/fields/levels/measures/calcMeasures/namedSets/nodes)。
   */
  async fetchMetadata(modelId: string, ctx?: { signal?: AbortSignal }): Promise<Metadata> {
    const url = `${this.baseUrl}/api/augmentedDataSet/${encodeURIComponent(modelId)}`;
    const res = await this.fetchFn(url, this.buildInit({ method: 'GET', signal: ctx?.signal }));
    if (!res.ok) throw await this.errorFromResponse(res, 'fetchMetadata');
    const json = (await res.json()) as unknown;
    return normalizeMetadata(parseMetadataResponse(json));
  }

  /**
   * POST Query → CellSet（PivotTable.onQuery 用）
   *
   * 后端 "Required request body is missing" 错误归因(2026-05-07 实测):
   *   不是真的 body 空 — 是 AbortController 中途 abort 时,Vite proxy 可能把
   *   partial request(headers 已发,body 未发完)转给后端 Tomcat,Spring 看到
   *   Content-Length>0 但 body 流读不出 → 抛 HttpMessageNotReadableException。
   *   这是良性日志噪音(client 端 abort error 已在 useTreeQueries / usePivotQuery
   *   静默吞掉,不影响 UX)。
   *
   * 客户端层防御:发出前显式拦截 query=undefined / stringify=空 的退化情况,
   * 让真出问题时报错明确(而不是看 Spring log 找半天)。
   */
  async executeQuery(query: Query, ctx?: { signal?: AbortSignal }): Promise<CellSet> {
    if (!query || typeof query !== 'object') {
      throw new Error(
        `[smartbi:executeQuery] query 非法(typeof=${typeof query});检查上游 buildQuery / buildBranchQuery 是否返回 undefined`,
      );
    }
    const body = JSON.stringify(query);
    if (!body || body === 'null' || body === 'undefined') {
      throw new Error(
        `[smartbi:executeQuery] JSON.stringify(query) 产生 ${JSON.stringify(body)}(空 body)`,
      );
    }
    // signal 已 aborted → 提前 throw,避免发出 partial request(让 Spring 噪音少一些)
    if (ctx?.signal?.aborted) {
      throw new DOMException('Aborted before fetch', 'AbortError');
    }
    const url = `${this.baseUrl}/api/augmentedQuery/queryFromSmartCubeByName`;
    const res = await this.fetchFn(
      url,
      this.buildInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctx?.signal,
      }),
    );
    if (!res.ok) throw await this.errorFromResponse(res, 'executeQuery');
    const json = (await res.json()) as unknown;
    return parseCellSetResponse(json);
  }

  /**
   * 便捷：返回符合 PivotTable.onQuery 签名的函数。
   *
   * 用法：
   *   const client = new SmartbiClient({ baseUrl, auth: { token } });
   *   <PivotTable onQuery={client.asOnQuery()} ... />
   */
  asOnQuery(): (q: Query, ctx: { signal: AbortSignal }) => Promise<CellSet> {
    return (q, ctx) => this.executeQuery(q, ctx);
  }

  /**
   * 拉资源目录的子节点 — 树是 lazy 的:每个文件夹要按 id 单独 call 一次。
   *
   * 用法:
   *   const root = await client.fetchCatalogChildren(PUBLIC_DATASET_ROOT_ID);
   *   const folderChildren = await client.fetchCatalogChildren(folder.id);
   *
   * acceptTypes 默认拉所有"文件夹 + 各类模型/数据集",ModelPicker 渲染时用
   * `isCatalogLeaf` 判断哪些可选。调用方有特殊需求(只要 AUGMENTED_DATASET)再传过滤。
   */
  async fetchCatalogChildren(
    catalogId: string,
    ctx?: { signal?: AbortSignal },
    acceptTypes: readonly string[] = DEFAULT_CATALOG_ACCEPT_TYPES,
  ): Promise<CatalogNode[]> {
    const url = `${this.baseUrl}/api/catalogs/withPathChildren`;
    const res = await this.fetchFn(
      url,
      this.buildInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({
          id: catalogId,
          acceptTypes: [...acceptTypes],
          ignoreNoResourceFolder: false,
        }),
        signal: ctx?.signal,
      }),
    );
    if (!res.ok) throw await this.errorFromResponse(res, 'fetchCatalogChildren');
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error(
        `[smartbi:fetchCatalogChildren] expected array response, got ${typeof json}`,
      );
    }
    return json as CatalogNode[];
  }

  /**
   * 按关键词搜索资源目录 — 返回多条完整路径(root → hit),每条路径里最后一个 node 是匹配项。
   *   - 用户在 ModelPicker 输入搜索 → 调用本方法,把结果扁平成 hit 列表
   *   - 路径信息用于显示 aliasPath(用户能知道命中节点在哪个文件夹下)
   *   - acceptType 跟 fetchCatalogChildren 同语义(默认拉所有"文件夹 + 各类模型/数据集")
   */
  async searchCatalog(
    keyword: string,
    ctx?: { signal?: AbortSignal },
    acceptTypes: readonly string[] = DEFAULT_CATALOG_ACCEPT_TYPES,
  ): Promise<CatalogNode[][]> {
    const url = `${this.baseUrl}/api/catalogs/nodesAndParent`;
    const res = await this.fetchFn(
      url,
      this.buildInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({
          condition: keyword,
          purview: 'READ',
          limit: -1,
          // 注意:后端这个接口字段叫 acceptType(单数);fetchCatalogChildren 用 acceptTypes(复数)
          acceptType: [...acceptTypes],
          ignoreNoResourceFolder: false,
        }),
        signal: ctx?.signal,
      }),
    );
    if (!res.ok) throw await this.errorFromResponse(res, 'searchCatalog');
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error(
        `[smartbi:searchCatalog] expected array of paths, got ${typeof json}`,
      );
    }
    return json as CatalogNode[][];
  }

  private buildInit(extra: RequestInit): RequestInit {
    const headers = new Headers(extra.headers);
    headers.set('Accept', 'application/json, text/plain, */*; charset=utf-8');
    if (this.auth.token) headers.set('Authorization', `Bearer ${this.auth.token}`);
    if (this.smxEncode) headers.set('smx-encode', 'encode');
    return {
      ...extra,
      headers,
      credentials: this.auth.useCookies ? 'include' : 'same-origin',
    };
  }

  private async errorFromResponse(res: Response, op: string): Promise<Error> {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    // probe debug 时调到 5000;production 300 字够
    const limit = (globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ ?? 300;
    const trimmedDetail = detail.slice(0, limit);
    // SmartbiError 自带 status / code / messageZh / hint 用于上层分类处理
    // message 保留 `[smartbi:op] status detail` 老格式向后兼容(toString 仍 work)
    const err = smartbiErrorFromResponse(res.status, trimmedDetail, op);
    return err;
  }
}

/**
 * 真实响应可能直接是 Metadata，也可能裹一层 envelope（如 `{ success, data }`）。
 * 根据探测结果再细化；当前 best-effort 解包。
 */
/**
 * /api/augmentedDataSet/{id} 通常直接返回 Metadata,但兜底处理 envelope:
 *   - 直接 Metadata: { id, name, views, fields, levels, measures, ... }
 *   - 包裹 envelope: { success, data: Metadata }
 */
function parseMetadataResponse(raw: unknown): Metadata {
  if (raw && typeof raw === 'object' && 'data' in raw && !('nodes' in raw)) {
    return (raw as { data: Metadata }).data;
  }
  return raw as Metadata;
}

function parseCellSetResponse(raw: unknown): CellSet {
  if (raw && typeof raw === 'object' && 'data' in raw && !('rows' in raw)) {
    return (raw as { data: CellSet }).data;
  }
  return raw as CellSet;
}
