/**
 * Probe backend 对 3 个未实装 sort 变体的实际支持:
 *
 *   1. ByMeasure.sortField — schema 有 optional sortField,我们都没传
 *   2. DimensionAttr — 用另一个 dim 的字典序对此 dim 排
 *   3. SortDimensionByMeasure — 维度组合下的度量值排序(includePreDimension)
 *
 * 每个 variant 跟 baseline 比 row 顺序,变了 = 真生效,没变 = 后端忽略。
 *
 * 用一个固定模型:rows=[Province(level 2)], values=[销售额],
 *   再加一个 grouping dim(Region/Hierarchy)用来测 DimensionAttr / SortDimensionByMeasure。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import { requireProbeEnv } from './lib/probeEnv.js';

const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryWithSort(label: string, sortObj: object): Promise<string | null> {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const dim = 'ShipProvince2';
  const m = metadata.measures[0]!.name;
  const vc = buildViewConfig({
    rows: [{ fieldName: dim, type: 'Dimension' }],
    values: [buildValueField({ measureName: m })],
  });
  const q = buildQuery(vc, metadata, {
    rowPageNo: 1, rowPageSize: 20, columnPageNo: 1, columnPageSize: 50,
  });
  const qPatched = { ...q, rowSorts: [sortObj] } as unknown as ReturnType<typeof buildQuery>;
  try {
    const res = await client.executeQuery(qPatched);
    const order = res.rows.map((r) => r[0]?.name).filter(Boolean).join(' → ');
    console.log(`✓ ${label}\n   ${order}\n`);
    return order;
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const m = e.originalDetail?.match(/"message":"([^"]+)"/);
    console.log(`✗ ${label}\n   ${m?.[1] ?? e.message}\n`);
    return null;
  }
}

async function main() {
  console.log('═══ baseline 对照 ═══\n');
  const baseline = await tryWithSort('A) baseline ASC(字典序)', {
    _enum: 'DimensionSortEx', dimension: 'ShipProvince2', direction: 'ASC',
  });
  const baselineByMeasure = await tryWithSort('B) ByMeasure(销售额) 无 sortField', {
    _enum: 'MeasureSortEx',
    measure: { _enum: 'ByMeasure', name: '销售额_1624531356707' },
    direction: 'DESC',
  });

  console.log('═══ 候选 1: ByMeasure.sortField ═══\n');
  await tryWithSort('C1) ByMeasure + sortField=ShipProvince2', {
    _enum: 'MeasureSortEx',
    measure: { _enum: 'ByMeasure', name: '销售额_1624531356707', sortField: 'ShipProvince2' },
    direction: 'DESC',
  });
  await tryWithSort('C2) ByMeasure + sortField=ShipRegion2', {
    _enum: 'MeasureSortEx',
    measure: { _enum: 'ByMeasure', name: '销售额_1624531356707', sortField: 'ShipRegion2' },
    direction: 'DESC',
  });

  console.log('═══ 候选 2: DimensionAttr ═══\n');
  await tryWithSort('D1) DimensionAttr sortField=ShipProvince2, dimension=ShipRegion2', {
    _enum: 'MeasureSortEx',
    measure: {
      _enum: 'DimensionAttr',
      sortField: 'ShipProvince2',
      dimension: 'ShipRegion2',
    },
    direction: 'ASC',
  });
  await tryWithSort('D2) DimensionAttr sortField=ShipProvince2, dimension=ShipCity2', {
    _enum: 'MeasureSortEx',
    measure: {
      _enum: 'DimensionAttr',
      sortField: 'ShipProvince2',
      dimension: 'ShipCity2',
    },
    direction: 'ASC',
  });

  console.log('═══ 候选 3: SortDimensionByMeasure ═══\n');
  await tryWithSort('E1) SortDimensionByMeasure includePreDimension=false', {
    _enum: 'MeasureSortEx',
    measure: {
      _enum: 'SortDimensionByMeasure',
      name: '销售额_1624531356707',
      sortField: 'ShipProvince2',
      includePreDimension: false,
    },
    direction: 'DESC',
  });
  await tryWithSort('E2) SortDimensionByMeasure includePreDimension=true', {
    _enum: 'MeasureSortEx',
    measure: {
      _enum: 'SortDimensionByMeasure',
      name: '销售额_1624531356707',
      sortField: 'ShipProvince2',
      includePreDimension: true,
    },
    direction: 'DESC',
  });

  console.log('═══ 分析 ═══');
  console.log('baseline ASC(字典序):', baseline);
  console.log('baseline ByMeasure DESC:', baselineByMeasure);
  console.log('对比上方各 case 的 order,跟 baseline 一致 = 后端忽略(变体未实装);');
  console.log('  跟 baseline 不一样 = 真生效。');
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
