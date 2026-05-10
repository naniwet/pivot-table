/**
 * Probe: 端到端验证 buildAdhocQuery 的 preprocess 逻辑跟后端真的对得上
 * (单测能保证 query payload 形状正确,这里验证后端真按预期执行过滤)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildAdhocQuery } from '../src/core/queryBuilder/buildAdhocQuery.js';
import { buildLeafFilter, buildViewConfig } from '../src/fixtures/builders.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi/smartbix';
const MODEL_ID = process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryQuery(label: string, q: ReturnType<typeof buildAdhocQuery>): Promise<number> {
  try {
    const cs = await client.executeQuery(q);
    console.log(`  ✓ ${label} — rows=${cs.rows.length}`);
    return cs.rows.length;
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    console.log(`  ✗ ${label}`);
    console.log(`    ↳ ${(e.originalDetail ?? e.message).slice(0, 250)}`);
    return -1;
  }
}

async function main() {
  const md = await client.fetchMetadata(MODEL_ID);
  const measure = md.measures[0]!;
  const dim = md.levels[0]!;
  console.log(`measure='${measure.name}', dim='${dim.name}'\n`);

  // Case 1:无过滤 baseline
  console.log('=== 1. 无过滤 baseline ===');
  const vcBase = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
  });
  vcBase.pageState.rowPageSize = 5;
  await tryQuery('baseline', buildAdhocQuery(vcBase, md, vcBase.pageState));

  // Case 2:用户场景"销售额>500" — 拖 measure 进 dim filter 区
  console.log('\n=== 2. measure 拖入 dim filter,值大阈值(应过滤光所有行)===');
  const vcBigT = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
    filters: [
      buildLeafFilter({ field: measure.name, operator: 'GreaterThan', value: 99999999 }),
    ],
  });
  vcBigT.pageState.rowPageSize = 5;
  const qBigT = buildAdhocQuery(vcBigT, md, vcBigT.pageState);
  console.log(`  q.customElements.length=${qBigT.customElements.length}`);
  console.log(`  q.dimensionFilter=${JSON.stringify(qBigT.dimensionFilter).slice(0, 200)}`);
  const rowsBigT = await tryQuery('big threshold', qBigT);
  console.log(`  ${rowsBigT === 0 ? '✓ 过滤生效(rows=0)' : '⚠ 过滤未生效?'}`);

  // Case 3:小阈值(应所有行通过)
  console.log('\n=== 3. measure filter 小阈值(应所有行通过)===');
  const vcSmallT = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
    filters: [buildLeafFilter({ field: measure.name, operator: 'GreaterThan', value: 0 })],
  });
  vcSmallT.pageState.rowPageSize = 5;
  const rowsSmallT = await tryQuery('small threshold', buildAdhocQuery(vcSmallT, md, vcSmallT.pageState));
  console.log(`  ${rowsSmallT === 5 ? '✓ 过滤生效(rows=5)' : '⚠ rows=' + rowsSmallT}`);

  // Case 4:dim+measure 复合 OR — 这是 user 关心的 AND/OR 跨维度组合场景
  console.log('\n=== 4. (dim=any-value OR measure>大阈值) — OR 跨 dim+measure ===');
  const dimSampleValue = 'sample';
  const vcOr = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
    filters: [
      {
        kind: 'group',
        op: 'Or',
        children: [
          buildLeafFilter({ field: dim.name, operator: 'Equals', value: dimSampleValue }),
          buildLeafFilter({ field: measure.name, operator: 'GreaterThan', value: 99999999 }),
        ],
      },
    ],
  });
  vcOr.pageState.rowPageSize = 5;
  const qOr = buildAdhocQuery(vcOr, md, vcOr.pageState);
  console.log(`  q.dimensionFilter._enum=${(qOr.dimensionFilter?.filter as { _enum: string })._enum}`);
  await tryQuery('OR composition', qOr);
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
