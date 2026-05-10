/**
 * Probe Smartbi 后端，dump 真实响应形态。
 *
 * 用途：
 *   - 验证 SmartbiClient 请求拼装在真实环境里能通
 *   - 看 metadata / CellSet 真实 JSON 形态，对比 [src/types/](../src/types/) 找 drift
 *
 * 用法:
 *   SMARTBI_BASE=http://your-host:port/path \
 *   SMARTBI_TOKEN=st_xxx \
 *   SMARTBI_MODEL_ID=your_model_id \
 *   npx tsx scripts/probe-backend.ts
 *
 * 该脚本只读 — 一次 GET resource tree、一次 POST 简易 query。
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../src/fixtures/builders.js';
import type { CellSet } from '../src/types/cellSet.js';
import type { Metadata } from '../src/types/metadata.js';
import type { Query } from '../src/types/query.js';
import type { ViewConfig } from '../src/types/viewConfig.js';

const TOKEN = process.env.SMARTBI_TOKEN;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

if (!TOKEN) {
  console.error('SMARTBI_TOKEN env var not set; pass like: SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-backend.ts');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'probe-output');

function dump(name: string, data: unknown): void {
  const path = join(outDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  → wrote ${path}`);
}

function summary(label: string, value: unknown): void {
  if (value === null || value === undefined) {
    console.log(`${label}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    console.log(`${label}: array len=${value.length}`);
    if (value.length > 0) {
      console.log(`  [0] keys: ${Object.keys(value[0] ?? {}).join(', ')}`);
    }
    return;
  }
  if (typeof value === 'object') {
    console.log(`${label}: object keys=${Object.keys(value as object).join(', ')}`);
    return;
  }
  console.log(`${label}: ${typeof value} = ${String(value).slice(0, 80)}`);
}

async function main(): Promise<void> {
  console.log(`base=${BASE}  modelId=${MODEL_ID}\n`);

  const client = new SmartbiClient({
    baseUrl: BASE,
    auth: { token: TOKEN! },
    smxEncode: true, // FieldTree 接口在 user 的 curl 里带，先打开
  });

  // 确保 outDir 存在
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }

  // === Probe 1: metadata ===
  console.log('=== Probe 1: GET resource tree (metadata) ===');
  try {
    const meta = (await client.fetchMetadata(MODEL_ID)) as unknown;
    summary('metadata', meta);
    if (meta && typeof meta === 'object') {
      const m = meta as Record<string, unknown>;
      summary('  metadata.dimensions', m.dimensions);
      summary('  metadata.measures', m.measures);
      summary('  metadata.namedsets', m.namedsets);
    }
    dump('metadata', meta);
  } catch (e) {
    console.error('metadata FAILED:', (e as Error).message);
  }

  // === Probe 2: simple query ===
  console.log('\n=== Probe 2: POST executeQuery (PivotQuery, 1 row dim + 1 measure) ===');
  // 用用户给的示例的最简形：行 = the_date_Year2，列 = 销售额_m
  // DimensionField 必带 level（非 hierarchy 时 level=dimension=fieldName）
  const query = {
    modelId: MODEL_ID,
    queryType: 'PivotQuery',
    rows: ['the_date_Year2'],
    columns: ['销售额_m'],
    fields: [
      {
        _enum: 'DimensionField',
        name: 'the_date_Year2',
        dimension: 'the_date_Year2',
        level: 'the_date_Year2',
        subTotal: 'HIDDEN',
      },
      { _enum: 'MeasureField', name: '销售额_m', measure: '销售额_m' },
    ],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageSettings: {
      compressEmptyRows: true,
      compressEmptyColumns: false,
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
      showGrandTotal: false,
      subTotalAtEnd: true,
      isCrossTable: true,
      useFormat: true,
      useDataType: true,
      useTransform: true,
      handleSpecial: true,
      isAsyncQueryColumnHeader: false,
    },
    customElements: [],
    // engineType: 不传，让后端默认；DimensionField 必带 level
  } as unknown as Query;

  try {
    const cs = (await client.executeQuery(query)) as unknown;
    summary('cellset', cs);
    if (cs && typeof cs === 'object') {
      const c = cs as Record<string, unknown>;
      summary('  rowFields', c.rowFields);
      summary('  columnFields', c.columnFields);
      summary('  columnMetadataArray', c.columnMetadataArray);
      summary('  rows', c.rows);
      summary('  columns', c.columns);
      summary('  data', c.data);
      summary('  totalRowCount', c.totalRowCount);
    }
    dump('cellset', cs);
  } catch (e) {
    console.error('query FAILED:', (e as Error).message);
  }

  // === Probe 3: ADR-004 hierarchy drill ===
  console.log('\n=== Probe 3: ADR-004 hierarchy drill (custom-the_date, 4 levels) ===');
  try {
    // 重新拿一次 metadata（local helper 需要，avoid retyping）
    const meta = (await client.fetchMetadata(MODEL_ID)) as Metadata;
    await probeHierarchyDrill(client, meta);
  } catch (e) {
    console.error('hierarchy probe FAILED:', (e as Error).message);
  }

  console.log(`\nProbe outputs saved to ${outDir}/`);
}

/**
 * ADR-004 C2 hierarchy drill probe
 *
 * 三步（drillDepth 1 → 2 → 3）：
 *   Q1: drillDepth=1 → query.rows=[Year]                 → 期望仅看年
 *   Q2: drillDepth=2 → query.rows=[Year, Quarter]        → 期望 year × quarter 笛卡尔积
 *   Q3: drillDepth=3 → query.rows=[Year, Quarter, Month] → 三级笛卡尔积
 *
 * 验证：
 *   1. 每步 query.filters = []（drill 不再产 hierarchy filter，C2 关键改动）
 *   2. 每步 query.rows 是逐渐变长的 level 名数组
 *   3. 后端返回的 row tuple 长度等于 drillDepth
 *   4. row 数随 drillDepth 单调增长（笛卡尔积）
 */
async function probeHierarchyDrill(client: SmartbiClient, metadata: Metadata): Promise<void> {
  const HIER = 'custom-the_date'; // 4 levels: Year/Quarter/Month/Day
  const MEASURE = '销售额_m';

  function makeViewConfig(drillDepth: number): ViewConfig {
    return buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth })],
      values: [buildValueField({ measureName: MEASURE })],
    });
  }

  function summarizeRows(cs: CellSet): {
    rowCount: number;
    tupleLen: number;
    levels: string[];
    sampleTuples: string[][];
  } {
    const tupleLen = cs.rows[0]?.length ?? 0;
    const levels = Array.from(new Set(cs.rows.flatMap((r) => r.map((m) => m.level))));
    const sampleTuples = cs.rows.slice(0, 3).map((row) => row.map((m) => m.name));
    return { rowCount: cs.rows.length, tupleLen, levels, sampleTuples };
  }

  for (let depth = 1; depth <= 3; depth++) {
    const vc = makeViewConfig(depth);
    const q = buildQuery(vc, metadata, vc.pageState);
    console.log(`\n[Q${depth}] drillDepth=${depth}`);
    console.log('  query.rows    =', JSON.stringify(q.rows));
    console.log('  query.filters =', JSON.stringify(q.filters));
    console.log('  query.fields  =', q.fields.length, 'entries');
    try {
      const r = await client.executeQuery(q);
      const s = summarizeRows(r);
      console.log(
        `  → cellset rows=${s.rowCount}, tuple len=${s.tupleLen}, levels=[${s.levels.join(', ')}]`,
      );
      console.log(`     first 3 tuples:`, JSON.stringify(s.sampleTuples));
      dump(`hierarchy-q${depth}`, { query: q, cellset: r });
    } catch (e) {
      console.error(`  ❌ Q${depth} FAILED:`, (e as Error).message);
      return;
    }
  }

  console.log('\n[verdict] ADR-004 C2 strategy works iff:');
  console.log('  - Q1 query.filters=[]，rows=[1 level]，tuple len=1');
  console.log('  - Q2 query.filters=[]，rows=[2 levels]，tuple len=2');
  console.log('  - Q3 query.filters=[]，rows=[3 levels]，tuple len=3');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
