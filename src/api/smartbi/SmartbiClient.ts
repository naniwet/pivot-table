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
