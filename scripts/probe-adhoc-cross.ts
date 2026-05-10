/**
 * 验证 adhoc DetailQuery 设置 isCrossTable=true 后,多 row 字段都能拿回
 * (用户反馈:不开 isCrossTable 时只返前 2 列)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildAdhocQuery } from '../src/core/queryBuilder/buildAdhocQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryCase(label: string, q: ReturnType<typeof buildAdhocQuery>) {
  try {
    const res = await client.executeQuery(q);
    const firstRow = res.rows[0];
    const memberCount = firstRow?.length ?? 0;
    console.log(`  ✓ ${label}`);
    console.log(`    rows=${res.rows.length}, members per row=${memberCount}`);
    if (firstRow) {
      console.log(`    first row members:`, firstRow.map((m) => m.name).join(' | '));
    }
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? e.message;
    console.log(`  ✗ ${label}`);
    console.log(`    ↳ ${detail.slice(0, 250)}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const lvls = metadata.levels;
  const measure = metadata.measures[0]!;
  console.log(`first 4 levels: ${lvls.slice(0, 4).map((l) => l.name).join(', ')}`);
  console.log(`first measure: ${measure.name}\n`);

  // Case A:多 dim row + 1 measure(模拟用户的 adhoc 场景)
  const vc = buildViewConfig({
    rows: [
      { fieldName: lvls[0]!.name, type: 'Dimension' },
      { fieldName: lvls[1]!.name, type: 'Dimension' },
      { fieldName: lvls[2]!.name, type: 'Dimension' },
      { fieldName: measure.name, type: 'Dimension' }, // measure 当 dim 处理(adhoc 风格)
    ],
    values: [buildValueField({ measureName: measure.name })],
    queryMode: 'adhoc',
  });

  console.log('=== Case A: isCrossTable=true(当前默认) ===');
  const qTrue = buildAdhocQuery(vc, metadata, vc.pageState);
  console.log(`  query.rows=${JSON.stringify(qTrue.rows)}`);
  console.log(`  pageSettings.isCrossTable=${qTrue.pageSettings.isCrossTable}`);
  await tryCase('isCrossTable=true', qTrue);

  console.log('\n=== Case B: isCrossTable=false(对比) ===');
  const qFalse = { ...qTrue, pageSettings: { ...qTrue.pageSettings, isCrossTable: false } };
  await tryCase('isCrossTable=false', qFalse);
}

main().catch((err) => { console.error('probe failed:', err); process.exit(1); });
