/**
 * 验证当前 translateCustomElements 输出能让后端正常处理。
 * 用真实 metadata + 真实 viewConfig + 真实 buildQuery 走全链路。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryCase(label: string, customField: import('../src/types/viewConfig.js').CustomField, mName: string) {
  const vc = buildViewConfig({
    rows: [{ fieldName: customField.id, type: customField.kind === 'enum_group' ? 'EnumGroup' : 'RangeGroup' }],
    values: [buildValueField({ measureName: mName })],
    customFields: [customField],
  });
  const q = buildQuery(vc, { id: MODEL_ID } as never, { rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10 });
  // 注:上面 metadata 是 stub,真实 customElements 翻译需要真 metadata
  return q;
}

/** 进程级失败计数 — 任一 case ✗ 时退出 1,让 CI 标红 */
let failCount = 0;
function recordFail() { failCount += 1; }

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  // 找一个真 STRING dim(值能任意 group)+ 同 view 的 measure
  const stringDim = metadata.fields.find((f) => f.valueType === 'STRING' && f.name !== '品牌名称'
    ? false : f.valueType === 'STRING')!;
  const dim = stringDim;
  const m = metadata.measures.find((mm) => {
    // 跨 view 也行,但跨 view 时关系路径要校验
    return mm.viewId === dim.viewId;
  }) ?? metadata.measures[0]!;
  console.log(`使用 dim=${dim.name}(${dim.viewId}), measure=${m.name}(${m.viewId})`);

  // Case 1: enum_group + show_individually
  console.log('\n=== Case 1: enum_group + show_individually(OriginalValue) ===');
  let vc = buildViewConfig({
    rows: [{ fieldName: 'eg1', type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: 'eg1', name: 'probe', kind: 'enum_group',
      baseField: dim.name,
      groups: [{ label: '组A', members: ['x'] }],
      ungroupedHandling: 'show_individually',
    }],
  });
  let q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10 });
  console.log('   customElements:', JSON.stringify(q.customElements, null, 2));
  try { await client.executeQuery(q); console.log('   ✓ PASS'); }
  catch (e) { recordFail(); const m = (e as Error).message?.match(/"message":"([^"]+)"/); console.log('   ✗ FAIL —', m?.[1] ?? (e as Error).message?.slice(0, 200)); }

  // Case 2: enum_group + merge_as_other
  console.log('\n=== Case 2: enum_group + merge_as_other(SpecificValue) ===');
  vc = buildViewConfig({
    rows: [{ fieldName: 'eg2', type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: 'eg2', name: 'probe', kind: 'enum_group',
      baseField: dim.name,
      groups: [{ label: '组A', members: ['x'] }],
      ungroupedHandling: 'merge_as_other',
      ungroupedLabel: '其他',
    }],
  });
  q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10 });
  console.log('   customElements:', JSON.stringify(q.customElements, null, 2));
  try { await client.executeQuery(q); console.log('   ✓ PASS'); }
  catch (e) { recordFail(); const m = (e as Error).message?.match(/"message":"([^"]+)"/); console.log('   ✗ FAIL —', m?.[1] ?? (e as Error).message?.slice(0, 200)); }

  // Case 3: range_group
  console.log('\n=== Case 3: range_group ===');
  // 找数值维度
  const numDim = metadata.fields.find((f) =>
    f.viewId === m.viewId && ['INTEGER', 'LONG', 'DOUBLE', 'BIGDECIMAL', 'BIGINT', 'FLOAT'].includes(f.valueType ?? ''),
  );
  if (!numDim) {
    console.log('   (没找到同 view 的数值维度,skip)');
  } else {
    vc = buildViewConfig({
      rows: [{ fieldName: 'rg1', type: 'RangeGroup' }],
      values: [buildValueField({ measureName: m.name })],
      customFields: [{
        id: 'rg1', name: 'probe', kind: 'range_group',
        baseField: numDim.name,
        ranges: [
          { min: null, max: 100, label: '低' },
          { min: 100, max: null, label: '高' },
        ],
      }],
    });
    q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10 });
    console.log('   customElements:', JSON.stringify(q.customElements, null, 2));
    try { await client.executeQuery(q); console.log('   ✓ PASS'); }
    catch (e) { recordFail(); const m = (e as Error).message?.match(/"message":"([^"]+)"/); console.log('   ✗ FAIL —', m?.[1] ?? (e as Error).message?.slice(0, 200)); }
  }
}

main()
  .then(() => {
    if (failCount > 0) {
      console.error(`\n${failCount} 个 case ✗ — 后端 schema 可能漂移`);
      process.exit(1);
    }
  })
  .catch((e) => { console.error(e); process.exit(1); });
