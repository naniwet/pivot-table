/**
 * 跑一个含 hierarchy(包括 LEVEL_TIME_*)的真实查询,
 * 看 cellset.columnMetadataArray[].levelType 真实形式
 *  + metadata.levels[].levelType 真实形式 + 真实 enum 值有哪些
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  console.log('=== metadata.levels[].levelType 形式 ===');
  const seenLevels = new Map<string, unknown>();
  for (const lv of metadata.levels) {
    const lt = (lv as unknown as { levelType: unknown }).levelType;
    const k = JSON.stringify(lt);
    if (!seenLevels.has(k)) {
      seenLevels.set(k, lt);
      console.log(`  ${typeof lt} ${k}  (例:${lv.name})`);
    }
  }
  if (seenLevels.size === 0) console.log('  (没 levels)');

  // 用 metadata 里的 hierarchy 跑一个查询
  const dim = metadata.fields.find((f) => f.valueType === 'STRING')?.name;
  const m = metadata.measures[0]?.name;
  if (!dim || !m) { console.log('找不到 dim 或 measure'); return; }

  // 直接发一个 query,拉 cellset 看 columnMetadataArray[].levelType
  const query = {
    modelId: metadata.id,
    queryType: 'PivotQuery' as const,
    rows: [dim],
    columns: [m],
    fields: [],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageSettings: {
      compressEmptyRows: true,
      compressEmptyColumns: true,
      rowPageNo: 1,
      rowPageSize: 5,
      columnPageNo: 1,
      columnPageSize: 5,
      showGrandTotal: true,
      isCrossTable: true,
      totalAtEnd: 'true,true',
      useFormat: true,
      useDataType: true,
      useTransform: true,
      handleSpecial: true,
      isAsyncQueryColumnHeader: false,
    },
    customElements: [],
  };
  const cellSet = await client.executeQuery(query as never);
  console.log('\n=== cellset.columnMetadataArray[].levelType 形式 ===');
  const seenCS = new Map<string, unknown>();
  for (const cm of cellSet.columnMetadataArray ?? []) {
    const lt = (cm as unknown as { levelType: unknown }).levelType;
    const k = JSON.stringify(lt);
    if (!seenCS.has(k)) {
      seenCS.set(k, lt);
      console.log(`  ${typeof lt} ${k}  (字段:${(cm as unknown as { name: string }).name})`);
    }
  }

  // 也 dump 一份 metadata levels[0] 结构供参考
  console.log('\n=== metadata.levels[0] 全文 ===');
  console.log(JSON.stringify(metadata.levels[0], null, 2));
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
