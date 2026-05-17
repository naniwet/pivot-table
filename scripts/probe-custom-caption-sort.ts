/**
 * 探 ByCustomCaption 的正确发送格式。
 * 候选 3 个:
 *   A. DimensionSort + sortBy: ByCustomCaption(deprecated,我们当前 translator 用的)
 *   B. MeasureSortEx + measure: Customize(schema 新接口)
 *   C. DimensionSortEx 加 sortBy 扩展(看 backend 是否允许)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import { requireProbeEnv } from './lib/probeEnv.js';

const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryWithSort(label: string, sortObj: object) {
  const metadata = await client.fetchMetadata(MODEL_ID);
  // 用一个有多个 row member 的 dim
  const dim = 'ShipRegion2';
  const m = metadata.measures[0]!.name;
  const vc = buildViewConfig({
    rows: [{ fieldName: dim, type: 'Dimension' }],
    values: [buildValueField({ measureName: m })],
  });
  const q = buildQuery(vc, metadata, { rowPageNo: 1, rowPageSize: 20, columnPageNo: 1, columnPageSize: 50 });
  // 强行替换 rowSorts
  const qPatched = { ...q, rowSorts: [sortObj] } as unknown as ReturnType<typeof buildQuery>;
  try {
    const res = await client.executeQuery(qPatched);
    const order = res.rows.map((r) => r[0]?.name).filter(Boolean).join(' → ');
    console.log(`✓ ${label}\n   顺序: ${order}\n`);
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const m = e.originalDetail?.match(/"message":"([^"]+)"/);
    console.log(`✗ ${label}\n   ${m?.[1] ?? e.message}\n`);
  }
}

async function main() {
  // 期望顺序(user-specified):
  const order = ['华北', '华东', '华南', '华中', '西北', '东北', '西南'];
  console.log('Expected sort: ', order.join(' → '), '\n');

  // A:DimensionSort + sortBy: ByCustomCaption(当前 translator)
  await tryWithSort('A) DimensionSort + sortBy:ByCustomCaption', {
    _enum: 'DimensionSort',
    dimension: 'ShipRegion2',
    direction: 'ASC',
    sortBy: { _enum: 'ByCustomCaption', customCaption: order },
  });

  // B:MeasureSortEx + measure: Customize(schema 新接口)
  await tryWithSort('B) MeasureSortEx + measure:Customize', {
    _enum: 'MeasureSortEx',
    measure: {
      _enum: 'Customize',
      sortField: 'ShipRegion2',
      customCaption: order,
    },
    direction: 'ASC',
  });

  // C:DimensionSortEx 加 sortBy 扩展
  await tryWithSort('C) DimensionSortEx + sortBy:ByCustomCaption', {
    _enum: 'DimensionSortEx',
    dimension: 'ShipRegion2',
    direction: 'ASC',
    sortBy: { _enum: 'ByCustomCaption', customCaption: order },
  });

  // D:baseline 无 sort 看默认顺序
  await tryWithSort('D) baseline 无 sort', {
    _enum: 'DimensionSortEx',
    dimension: 'ShipRegion2',
    direction: 'ASC',
  });
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
