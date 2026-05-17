/**
 * 探 backend 对 query.fields 含 column DimensionField.subTotal='SHOW' 的响应:
 *   - cellSet 多出哪些 column member?(subtotal member)
 *   - subtotal cell 在 data 数组里 row/column 是什么 index?
 *   - level / dimension 上有什么标记?
 *
 * 用于 P6+ 列树折叠时拿后端正确按 aggregator 算的父级聚合 cell。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import { requireProbeEnv } from './lib/probeEnv.js';

const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);

  // 找一个 hierarchy / 多 level dim 当 column
  // 优先找 metadata.levels 里有多 level 的
  const hier = metadata.nodes.find((n) => n.type === 'HIERARCHY' && n.children.length > 1);
  if (!hier) {
    console.log('No multi-level hierarchy in metadata; abort.');
    return;
  }
  console.log(`Using column hierarchy: ${hier.name} (${hier.children.length} levels)`);

  const m = metadata.measures[0]!.name;
  const rowDim = metadata.fields.find((f) => f.valueType === 'STRING')!.name;
  console.log(`Row: ${rowDim}  Column: ${hier.name}  Measure: ${m}\n`);

  // 不带 subTotal — baseline
  const vcA = buildViewConfig({
    rows: [{ fieldName: rowDim, type: 'Dimension' }],
    columns: [{ fieldName: hier.name, type: 'Hierarchy', drillDepth: hier.children.length }],
    values: [buildValueField({ measureName: m })],
  });
  const qA = buildQuery(vcA, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 200 });
  console.log('Baseline query (无 subTotal) columns 字段:');
  console.log(' ', qA.columns);
  console.log(' ', JSON.stringify(qA.fields));

  try {
    const resA = await client.executeQuery(qA);
    console.log(`✓ baseline: ${resA.columns.length} column tuples × ${resA.rows.length} rows`);
    console.log('  前 5 个 column member tuples:');
    resA.columns.slice(0, 5).forEach((tuple, i) => {
      const desc = tuple.map((m) => `${m.dimension}/${m.level}/${m.name}`).join(' | ');
      console.log(`    [${i}] ${desc}`);
    });
  } catch (err) {
    console.log('✗ baseline failed:', (err as Error).message);
    return;
  }

  // 带 subTotal=SHOW(在 column hierarchy 的 levels 上加)
  // buildQuery 已经支持 SET_FIELD_SUB_TOTAL → 我们直接构造 columns 加 subTotal
  console.log('\n---\n');
  const vcB = buildViewConfig({
    rows: [{ fieldName: rowDim, type: 'Dimension' }],
    columns: [
      {
        fieldName: hier.name,
        type: 'Hierarchy',
        drillDepth: hier.children.length,
        subTotal: 'SHOW',
      },
    ],
    values: [buildValueField({ measureName: m })],
  });
  const qB = buildQuery(vcB, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 200 });
  console.log('With column subTotal=SHOW; fields:');
  console.log(JSON.stringify(qB.fields, null, 2));

  try {
    const resB = await client.executeQuery(qB);
    console.log(`\n✓ subTotal=SHOW: ${resB.columns.length} column tuples × ${resB.rows.length} rows`);
    console.log('  前 10 个 column member tuples(看是否多出 subtotal):');
    resB.columns.slice(0, 10).forEach((tuple, i) => {
      const desc = tuple.map((m) => `${m.dimension}/${m.level}/${m.name}`).join(' | ');
      console.log(`    [${i}] ${desc}`);
    });
    console.log(`  total tuples: ${resB.columns.length}`);
  } catch (err) {
    console.log('✗ subTotal=SHOW failed:', (err as Error).message);
    const e = err as { originalDetail?: string };
    if (e.originalDetail) console.log('  detail:', e.originalDetail.slice(0, 800));
  }

  // 同样试 HIERARCHY_SHOW(层级合计)
  console.log('\n---\n');
  const vcC = buildViewConfig({
    rows: [{ fieldName: rowDim, type: 'Dimension' }],
    columns: [
      {
        fieldName: hier.name,
        type: 'Hierarchy',
        drillDepth: hier.children.length,
        subTotal: 'HIERARCHY_SHOW',
      },
    ],
    values: [buildValueField({ measureName: m })],
  });
  const qC = buildQuery(vcC, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 200 });

  try {
    const resC = await client.executeQuery(qC);
    console.log(`✓ HIERARCHY_SHOW: ${resC.columns.length} column tuples`);
    console.log('  前 15 个:');
    resC.columns.slice(0, 15).forEach((tuple, i) => {
      const desc = tuple.map((m) => `${m.dimension}/${m.level}/${m.name}`).join(' | ');
      console.log(`    [${i}] ${desc}`);
    });
  } catch (err) {
    console.log('✗ HIERARCHY_SHOW failed:', (err as Error).message);
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
