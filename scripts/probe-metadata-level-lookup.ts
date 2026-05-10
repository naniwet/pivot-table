/**
 * 看 metadata 里 measure 'column1_m' 的物理列 'column1' 有没有对应 level 声明
 * + 用户一旦想做 measure 当原始列过滤,优先级:
 *   1. 找到对应 level → 用 level.name 走 ByLevel(最官方)
 *   2. 找不到 → 在 query.customElements 里声明一个 customDimension 指向 column1
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function main() {
  const md = await client.fetchMetadata(MODEL_ID);
  const measure = md.measures[0]!;
  console.log(`measure: ${measure.name}`);
  console.log(`  refDataSetFieldId=${measure.refDataSetFieldId ?? '(none)'}`);
  console.log(`  aliasFromDb=${(measure as { aliasFromDb?: string }).aliasFromDb ?? '(none)'}`);
  // physical column 解析:跟 customElements.findPhysicalColumn 同逻辑
  let phys = measure.name;
  if (measure.refDataSetFieldId) {
    const f = md.fields.find((ff) => ff.id === measure.refDataSetFieldId);
    if (f) phys = f.name;
  }
  console.log(`  resolved physicalColumn = ${phys}\n`);

  console.log('=== 找跟 physicalColumn 对应的 level ===');
  const candidateLevels = md.levels.filter((l) => {
    const lAny = l as Record<string, unknown>;
    return (
      l.name === phys ||
      lAny.sqlColumnName === phys ||
      lAny.refDataSetFieldId === measure.refDataSetFieldId ||
      lAny.refDataSetField === measure.refDataSetFieldId
    );
  });
  if (candidateLevels.length === 0) {
    console.log(`  ✗ metadata.levels 中没有任何 level 指向 '${phys}'`);
  } else {
    console.log(`  ✓ 找到 ${candidateLevels.length} 个候选 level:`);
    for (const l of candidateLevels) {
      console.log(`    - name=${l.name}, full=${JSON.stringify(l).slice(0, 200)}`);
    }
  }

  console.log('\n=== fields 中 column1 长什么样 ===');
  const f = md.fields.find((ff) => ff.name === phys);
  if (f) {
    console.log(`  ${JSON.stringify(f, null, 2).slice(0, 500)}`);
  } else {
    console.log(`  没找到 fields[name=${phys}]`);
  }

  console.log('\n=== levels 全列(看看 level 命名规律)===');
  for (const l of md.levels.slice(0, 6)) {
    console.log(`  name=${l.name}`);
    console.log(`  ${JSON.stringify(l).slice(0, 250)}`);
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
