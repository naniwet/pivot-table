/**
 * Probe: adhoc 模式下"销售额 > 500" 这种 measure 当原始列过滤,
 *        Smartbi DetailQuery 后端到底吃哪条 filter 路径?
 *
 * 跑法:
 *   SMARTBI_TOKEN=xxx npx tsx scripts/probe-adhoc-measure-filter.ts
 *   (token 同 .env.local 里的 VITE_SMARTBI_TOKEN)
 *
 * 测 4 个 case,找哪个返成功 + 行数 < 全量:
 *   A. dimensionFilter.ByLevel{level: '<measure name>', ...}    ← 当前 UI 实现
 *   B. dimensionFilter.ByLevel{level: '<physical column>'}      ← 解析到物理列再 ByLevel
 *   C. query.filters[FieldFilter{field, filter:ByValue}]         ← 平铺 FieldFilter 路径
 *   D. measureFilters[TupleFilter{filter:ByMeasure}]            ← 度量过滤(应该 HAVING 语义,在 detail 下应不工作)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildAdhocQuery } from '../src/core/queryBuilder/buildAdhocQuery.js';
import { buildViewConfig } from '../src/fixtures/builders.js';
import type { Filter, FieldFilter, Query, TupleFilter } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID =
  process.env.SMARTBI_MODEL_ID!;
const THRESHOLD = Number(process.env.PROBE_THRESHOLD ?? 500);

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryQuery(label: string, q: Query): Promise<void> {
  try {
    const cs = await client.executeQuery(q);
    console.log(`  ✓ ${label} — rows=${cs.rows.length}, totalRowCount=${cs.totalRowCount}`);
    if (cs.rows.length > 0 && cs.rows.length <= 5) {
      console.log(`    sample row members:`, cs.rows[0]!.map((m) => m.name).join(' | '));
    }
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? e.message;
    console.log(`  ✗ ${label}`);
    console.log(`    ↳ ${detail.slice(0, 300)}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const measure = metadata.measures[0]!;
  // 物理列名解析(参考 customElements.findPhysicalColumn 的逻辑)
  let physicalColumn = measure.name;
  if (measure.refDataSetFieldId) {
    const f = metadata.fields.find((ff) => ff.id === measure.refDataSetFieldId);
    if (f) physicalColumn = f.name;
  } else if (measure.aliasFromDb) {
    physicalColumn = measure.aliasFromDb;
  }
  const dim = metadata.levels[0]!;

  console.log(`metadata: model=${metadata.id}`);
  console.log(`  measure: name='${measure.name}', physicalColumn='${physicalColumn}'`);
  console.log(`  dim:     name='${dim.name}'`);
  console.log(`  threshold: ${measure.name} > ${THRESHOLD}\n`);

  // 基线 query:不过滤,只取前 5 行 — 用于对比"是否真的过滤了"
  const vc = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
  });
  vc.pageState.rowPageSize = 5;
  const baseQuery = buildAdhocQuery(vc, metadata, vc.pageState);

  console.log('=== 基线(无 filter)===');
  await tryQuery('baseline (no filter)', baseQuery);

  // —— Case A:dimensionFilter.ByLevel{level=measureName} —— 当前 UI 实现
  console.log('\n=== Case A:dimensionFilter.ByLevel{level: measureName}(我当前的实现)===');
  const qA: Query = {
    ...baseQuery,
    dimensionFilter: {
      filter: {
        _enum: 'ByLevel',
        level: measure.name,
        operator: 'GreaterThan',
        value: THRESHOLD,
      } as Filter,
    },
  };
  await tryQuery('A: ByLevel(measureName)', qA);

  // —— Case B:dimensionFilter.ByLevel{level=physicalColumn} ——
  console.log('\n=== Case B:dimensionFilter.ByLevel{level: physicalColumn} ===');
  const qB: Query = {
    ...baseQuery,
    dimensionFilter: {
      filter: {
        _enum: 'ByLevel',
        level: physicalColumn,
        operator: 'GreaterThan',
        value: THRESHOLD,
      } as Filter,
    },
  };
  await tryQuery('B: ByLevel(physicalColumn)', qB);

  // —— Case C:query.filters: FieldFilter[]{field, filter:ByValue} ——
  console.log('\n=== Case C:query.filters[FieldFilter{ByValue}] ===');
  const qC: Query = {
    ...baseQuery,
    filters: [
      {
        _enum: 'FieldFilter',
        field: measure.name,
        filter: {
          _enum: 'ByValue',
          operator: 'GreaterThan',
          value: THRESHOLD,
        },
      } as FieldFilter,
    ],
  };
  await tryQuery('C: FieldFilter(measureName, ByValue)', qC);

  // —— Case C2:同 C 但 field=physicalColumn ——
  console.log('\n=== Case C2:query.filters[FieldFilter{field=physicalColumn, ByValue}] ===');
  const qC2: Query = {
    ...baseQuery,
    filters: [
      {
        _enum: 'FieldFilter',
        field: physicalColumn,
        filter: {
          _enum: 'ByValue',
          operator: 'GreaterThan',
          value: THRESHOLD,
        },
      } as FieldFilter,
    ],
  };
  await tryQuery('C2: FieldFilter(physicalColumn, ByValue)', qC2);

  // —— Case D:measureFilters[TupleFilter{ByMeasure}] —— HAVING 语义,detail 下应失败
  console.log('\n=== Case D:measureFilters[TupleFilter{ByMeasure}] ===');
  const qD: Query = {
    ...baseQuery,
    measureFilters: [
      {
        _enum: 'TupleFilter',
        filter: {
          _enum: 'ByMeasure',
          measure: measure.name,
          measureContext: 'InGlobal',
          operator: 'GreaterThan',
          value: THRESHOLD,
        },
      } as TupleFilter,
    ],
  };
  await tryQuery('D: measureFilter ByMeasure', qD);

  console.log('\n=== 结论 ===');
  console.log('看哪条 case rows 数 < baseline 的同时 totalRowCount 也变小 → 过滤生效');
  console.log('过滤生效 + 不报错的那条 = 后端真支持的路径');
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
