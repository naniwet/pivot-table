/**
 * SmartbiClient 测试 — 仅验证请求拼装与错误传递（响应内容由 probe 脚本观察后再补类型）
 */
import { describe, expect, it, vi } from 'vitest';

import type { Query } from '../../types/query.js';

import { SmartbiClient } from './SmartbiClient.js';

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
    const client = new SmartbiClient({ baseUrl: 'http://10.10.202.100:28082/smartbi', fetch });
    await client.fetchMetadata('I8a8aa3ed/with slash').catch(() => {});

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(
      'http://10.10.202.100:28082/smartbi/api/augmentedDataSet/I8a8aa3ed%2Fwith%20slash',
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
