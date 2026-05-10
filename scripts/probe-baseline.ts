/**
 * Probe 一个无 customElements 的简单 query,看后端基线接受不接受。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi/smartbix';
const MODEL_ID = process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';

const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function main() {
  console.log('1) metadata...');
  const metadata = await client.fetchMetadata(MODEL_ID);
  console.log(`   ${metadata.id} / ${metadata.name}`);
  console.log(`   first measure: ${metadata.measures[0]?.name}`);
  console.log(`   first STRING field: ${metadata.fields.find(f => f.valueType === 'STRING')?.name}`);

  // 极简 query — 1 维度 + 1 度量,无 customElements
  const dim = metadata.fields.find((f) => f.valueType === 'STRING')!.name;
  const m = metadata.measures[0]!.name;

  const vc = buildViewConfig({
    rows: [{ fieldName: dim, type: 'Dimension' }],
    values: [buildValueField({ measureName: m })],
  });
  const q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 });

  console.log('\n2) baseline query (无 customElements):');
  console.log('   query.rows:', q.rows);
  console.log('   query.columns:', q.columns);
  console.log('   query.customElements:', q.customElements);
  console.log('   query.pageSettings:', JSON.stringify(q.pageSettings));

  try {
    const res = await client.executeQuery(q);
    console.log('   ✓ PASS — 拿到 cellSet,rows=' + res.rows.length);
  } catch (err) {
    const e = err as Error;
    console.log('   ✗ FAIL —', e.message?.slice(0, 300));
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
