/**
 * SmartbiClient 测试 — 仅验证请求拼装与错误传递（响应内容由 probe 脚本观察后再补类型）
 */
import { describe, expect, it, vi } from 'vitest';

import type { Query } from '../../types/query.js';

import {
  DEFAULT_CATALOG_ACCEPT_TYPES,
  isCatalogFolder,
  isCatalogLeaf,
  PUBLIC_DATASET_ROOT_ID,
  SmartbiClient,
  type CatalogNode,
} from './SmartbiClient.js';

const EMPTY_CELLSET = JSON.stringify({
  rowFields: [],
  columnFields: [],
  columnMetadataArray: [],
  rows: [],
  columns: [],
  data: [],
  fieldNameToUniqueId: {},
  totalRowCount: 0,
});

function makeFetch(body: string, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof globalThis.fetch;
}

describe('SmartbiClient — request shape', () => {
  it('GET augmentedDataSet at the documented URL with id encoded', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://example.test/smartbi', fetch });
    await client.fetchMetadata('I8a8aa3ed/with slash').catch(() => {});

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(
      'http://example.test/smartbi/api/augmentedDataSet/I8a8aa3ed%2Fwith%20slash',
    );
    expect((init as RequestInit).method).toBe('GET');
  });

  it('POST executeQuery to /api/augmentedQuery/queryFromSmartCubeByName with JSON body', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x/smartbi/', fetch });
    const query = { modelId: 'm1', queryType: 'PivotQuery', engineType: 'MDX' } as unknown as Query;
    await client.executeQuery(query);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://x/smartbi/api/augmentedQuery/queryFromSmartCubeByName');
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    const headers = i.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(i.body as string)).toMatchObject({ modelId: 'm1' });
  });

  it('strips trailing slashes from baseUrl', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x/smartbi////', fetch });
    await client.fetchMetadata('m').catch(() => {});
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toMatch(/http:\/\/x\/smartbi\/api\/augmentedDataSet\/m/);
  });
});

describe('SmartbiClient — auth', () => {
  it('attaches Authorization: Bearer when token is given', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', auth: { token: 'st_abc' }, fetch });
    await client.fetchMetadata('m').catch(() => {});
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer st_abc');
  });

  it('does NOT attach Authorization when no token', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    await client.fetchMetadata('m').catch(() => {});
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('sets credentials: include when useCookies=true', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', auth: { useCookies: true }, fetch });
    await client.fetchMetadata('m').catch(() => {});
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('attaches smx-encode header when smxEncode=true', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', smxEncode: true, fetch });
    await client.fetchMetadata('m').catch(() => {});
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get('smx-encode')).toBe('encode');
  });
});

describe('SmartbiClient — abort & errors', () => {
  it('forwards AbortSignal from ctx into fetch', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    const controller = new AbortController();
    await client.executeQuery({} as Query, { signal: controller.signal });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it('throws Error with status code on non-2xx', async () => {
    const fetch = makeFetch('boom', 500);
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    await expect(client.fetchMetadata('m')).rejects.toThrow(/smartbi:fetchMetadata/);
    await expect(client.fetchMetadata('m')).rejects.toThrow(/500/);
  });

  it('asOnQuery() returns a function compatible with PivotTable.onQuery signature', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    const onQuery = client.asOnQuery();
    const result = await onQuery({} as Query, { signal: new AbortController().signal });
    expect(result).toMatchObject({ rowFields: [], totalRowCount: 0 });
  });
});

describe('SmartbiClient — response unwrapping (best-effort, refine after probe)', () => {
  it('unwraps `{ data: <CellSet> }` envelope when present', async () => {
    const fetch = makeFetch(JSON.stringify({ data: JSON.parse(EMPTY_CELLSET), success: true }));
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    const result = await client.executeQuery({} as Query);
    expect(result).toMatchObject({ rowFields: [], totalRowCount: 0 });
  });

  it('returns raw body when it already looks like a CellSet', async () => {
    const fetch = makeFetch(EMPTY_CELLSET);
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    const result = await client.executeQuery({} as Query);
    expect(result).toMatchObject({ rowFields: [] });
  });
});

describe('SmartbiClient.fetchCatalogChildren — 资源目录 lazy 树', () => {
  const SAMPLE_NODES: CatalogNode[] = [
    {
      id: 'folder-1',
      name: 'FoodWare',
      alias: 'FoodWare',
      desc: '',
      type: 'DEFAULT_TREENODE',
      children: null,
      pid: null,
      aliasPath: '数据集\\FoodWare',
    },
    {
      id: 'model-1',
      name: 'foodware_0613',
      alias: 'foodware_0613',
      desc: '',
      type: 'AUGMENTED_DATASET',
      children: null,
      pid: 'folder-1',
      aliasPath: '数据集\\FoodWare\\foodware_0613',
    },
  ];

  it('POST /api/catalogs/withPathChildren 携带 id + acceptTypes', async () => {
    const fetch = makeFetch(JSON.stringify(SAMPLE_NODES));
    const client = new SmartbiClient({ baseUrl: 'http://x/smartbi', fetch });
    const result = await client.fetchCatalogChildren(PUBLIC_DATASET_ROOT_ID);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://x/smartbi/api/catalogs/withPathChildren');
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    const body = JSON.parse(i.body as string);
    expect(body.id).toBe('PUBLIC_DATASET');
    expect(body.acceptTypes).toEqual([...DEFAULT_CATALOG_ACCEPT_TYPES]);
    expect(body.ignoreNoResourceFolder).toBe(false);
    expect(result).toEqual(SAMPLE_NODES);
  });

  it('支持自定义 acceptTypes(过滤资源类型)', async () => {
    const fetch = makeFetch(JSON.stringify(SAMPLE_NODES));
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    await client.fetchCatalogChildren('folder-1', undefined, ['AUGMENTED_DATASET']);

    const body = JSON.parse(
      ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.acceptTypes).toEqual(['AUGMENTED_DATASET']);
  });

  it('非数组响应 → throw(防御:接口返回 envelope / 错误时不让上层拿到坏值)', async () => {
    const fetch = makeFetch(JSON.stringify({ success: false }));
    const client = new SmartbiClient({ baseUrl: 'http://x', fetch });
    await expect(client.fetchCatalogChildren('x')).rejects.toThrow(/expected array/);
  });
});

describe('isCatalogLeaf / isCatalogFolder', () => {
  const node = (type: string): CatalogNode => ({
    id: 'x', name: 'x', alias: 'x', desc: '', type, children: null, pid: null, aliasPath: '',
  });

  it('AUGMENTED_DATASET / MT_MODEL / TABULAR_DATASET → leaf(可选模型)', () => {
    expect(isCatalogLeaf(node('AUGMENTED_DATASET'))).toBe(true);
    expect(isCatalogLeaf(node('MT_MODEL'))).toBe(true);
    expect(isCatalogLeaf(node('TABULAR_DATASET'))).toBe(true);
    expect(isCatalogLeaf(node('TABULAR_DATASET_METRICS_SET'))).toBe(true);
  });

  it('DEFAULT_TREENODE / *_FOLDER → folder(可展开)', () => {
    expect(isCatalogFolder(node('DEFAULT_TREENODE'))).toBe(true);
    expect(isCatalogFolder(node('SELF_TREENODE'))).toBe(true);
    expect(isCatalogFolder(node('TABULAR_DATASET_METRICS_SET_FOLDER'))).toBe(true);
  });

  it('leaf 跟 folder 互补 — 任何 type 二者恰一', () => {
    for (const t of ['AUGMENTED_DATASET', 'DEFAULT_TREENODE', 'UNKNOWN_TYPE']) {
      expect(isCatalogLeaf(node(t)) !== isCatalogFolder(node(t))).toBe(true);
    }
  });
});
