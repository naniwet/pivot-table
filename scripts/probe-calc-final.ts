/**
 * 最终验证:translateCustomElements 修过后,calc_measure 端到端能跑
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { parseExpression } from '../src/core/expression/parseExpression.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi/smartbix';
const MODEL_ID = process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

let failCount = 0;

async function tryCase(label: string, vc: ReturnType<typeof buildViewConfig>, metadata: import('../src/types/metadata.js').Metadata) {
  const q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 5 });
  console.log(`  customElements:`, JSON.stringify(q.customElements, null, 2));
  try {
    const res = await client.executeQuery(q);
    console.log(`  ✓ PASS  ${label} — rows=${res.rows.length}`);
  } catch (err) {
    failCount++;
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? e.message;
    console.log(`  ✗ FAIL  ${label} — ${detail.slice(0, 300)}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const m1 = metadata.measures[0]!;
  const m2 = metadata.measures[1] ?? m1;

  // 给 mode=column 找两个 same-view measure(行级算需同表)
  const byView = new Map<string, typeof metadata.measures>();
  for (const m of metadata.measures) {
    if (!m.viewId) continue;
    const list = byView.get(m.viewId) ?? [];
    list.push(m);
    byView.set(m.viewId, list);
  }
  let m1col = m1;
  let m2col = m2;
  for (const list of byView.values()) {
    if (list.length >= 2) { m1col = list[0]; m2col = list[1]; break; }
  }

  console.log(`mdx measures: ${m1.name}, ${m2.name}`);
  console.log(`column-mode measures (same-view): ${m1col.name}, ${m2col.name} (view=${m1col.viewId})\n`);

  console.log('=== Case 1: 比率 = m1 / m2 ===');
  await tryCase(
    '比率',
    buildViewConfig({
      rows: [{ fieldName: 'column2_Year', type: 'Dimension' }],
      values: [
        buildValueField({ measureName: m1.name }),
        buildValueField({ measureName: 'cf_ratio' }),
      ],
      customFields: [{
        id: 'cf_ratio',
        name: '比率',
        kind: 'calc_measure',
        dataFormat: '#,##0.00',
        expression: `[${m1.name}]/[${m2.name}]`,
        ast: parseExpression(`[${m1.name}]/[${m2.name}]`),
      }],
    }),
    metadata,
  );

  console.log('\n=== Case 2: 加法 m1 + m2 ===');
  await tryCase(
    '总和',
    buildViewConfig({
      rows: [{ fieldName: 'column2_Year', type: 'Dimension' }],
      values: [
        buildValueField({ measureName: 'cf_sum' }),
      ],
      customFields: [{
        id: 'cf_sum',
        name: '总和',
        kind: 'calc_measure',
        dataFormat: '',
        expression: `[${m1.name}]+[${m2.name}]`,
        ast: parseExpression(`[${m1.name}]+[${m2.name}]`),
      }],
    }),
    metadata,
  );

  console.log('\n=== Case 3: 跟原 measure 同时,对比值 ===');
  await tryCase(
    '原值 + calc_measure',
    buildViewConfig({
      rows: [{ fieldName: 'column2_Year', type: 'Dimension' }],
      values: [
        buildValueField({ measureName: m1.name }),
        buildValueField({ measureName: m2.name }),
        buildValueField({ measureName: 'cf_diff' }),
      ],
      customFields: [{
        id: 'cf_diff',
        name: '差',
        kind: 'calc_measure',
        dataFormat: '',
        expression: `[${m1.name}]-[${m2.name}]`,
        ast: parseExpression(`[${m1.name}]-[${m2.name}]`),
      }],
    }),
    metadata,
  );

  // calc_column 用 **物理列名**(不是 measure name)— 找两个 measure 对应的底层 field
  const f1 = metadata.fields.find((f) => f.id === m1col.refDataSetFieldId);
  const f2 = metadata.fields.find((f) => f.id === m2col.refDataSetFieldId);
  const c1 = f1?.name ?? m1col.aliasFromDb;
  const c2 = f2?.name ?? m2col.aliasFromDb;
  console.log(`calc_column 用物理列: ${c1}, ${c2}`);

  // calc_column 产生的是 CustomDimension(同 enum_group/range_group),所以拖在 row 区,
  // 不是 value 区;验证后端接受该 schema 形态。
  // "对均价再 SUM/AVG" 走的是"维度转度量"独立机制(此 probe 范围外)。
  // 注:calc_column 的列必须跟 row 维度在同一关系路径上(后端 JOIN 限制),否则报
  //   "勾选的字段不在同一个关系路径上"。下面 case 用 calc_column 单独作 row 维,
  //   靠 sales_fact 自身度量(销售额_m / 销售成本_m)聚合 → 单 view 不需要 JOIN。
  const sameView_m = (() => {
    // 找跟 c1/c2 同 view 的 measure(必须是 sales_fact 内的)
    return metadata.measures.find((m) => m.viewId === m1col.viewId);
  })();

  console.log('\n=== Case 4: calc_column 单独作 row 维度(行级 a/b 表达式列) ===');
  await tryCase(
    '行级 calc → dim',
    buildViewConfig({
      rows: [
        { fieldName: 'cf_unit_dim', type: 'Dimension' }, // ← calc_column 单独在 row 区
      ],
      values: [buildValueField({ measureName: sameView_m?.name ?? m1.name })],
      customFields: [{
        id: 'cf_unit_dim',
        name: '均价_dim',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: `[${c1}]/[${c2}]`,
        ast: parseExpression(`[${c1}]/[${c2}]`),
      }],
    }),
    metadata,
  );

  console.log('\n=== Case 5: calc_column 加法表达式 ===');
  await tryCase(
    'calc_column +',
    buildViewConfig({
      rows: [
        { fieldName: 'cf_unit_dim2', type: 'Dimension' },
      ],
      values: [buildValueField({ measureName: sameView_m?.name ?? m1.name })],
      customFields: [{
        id: 'cf_unit_dim2',
        name: 'sum',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: `[${c1}]+[${c2}]`,
        ast: parseExpression(`[${c1}]+[${c2}]`),
      }],
    }),
    metadata,
  );

  if (failCount > 0) {
    console.error(`\n${failCount} 个 case ✗`);
    process.exit(1);
  }
  console.log('\n全部 PASS — calc_measure 端到端 OK');
}

main().catch((err) => { console.error('probe failed:', err); process.exit(1); });
