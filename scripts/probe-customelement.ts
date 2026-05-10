/**
 * Probe customElements 真实可接受的 schema 形式
 *
 * 后端 SmartCubeDeserializer 报 "cannot deserialize: no _enum field" 但没说哪个字段。
 * 这个脚本逐一变化 customElements 的可疑字段(levelType 等)发请求,
 * 捕获 response,告诉我们**哪个变体真能通**。
 *
 * 用法:
 *   SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-customelement.ts
 *
 * 输出:
 *   每个变体一行,带 ✓/✗ + status + error 摘要(若有)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { Metadata } from '../src/types/metadata.js';
import type { Query, CustomElement } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi';
const MODEL_ID =
  process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';

if (!TOKEN) {
  console.error('SMARTBI_TOKEN env var 没设;用法: SMARTBI_TOKEN=st_xxx npx tsx scripts/probe-customelement.ts');
  process.exit(1);
}

const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function loadMetadata(): Promise<Metadata> {
  console.log('1) 拉 metadata...');
  return client.fetchMetadata(MODEL_ID);
}

/** 给定 levelType 变体,构造一个含 EnumGroup customElement 的 query 并发送 */
async function tryVariant(
  variantName: string,
  metadata: Metadata,
  levelType: unknown,
  defineFieldNames: { baseField: string; groupValuesKey: string; otherHandling?: string; otherHandlingKey?: string },
): Promise<{ ok: boolean; status?: number; errMsg?: string }> {
  // 找一个真实存在的维度字段当 baseField
  const dim = metadata.fields.find((f) => f.valueType === 'STRING')?.name;
  if (!dim) return { ok: false, errMsg: '没找到 STRING 维度字段' };

  const cf = {
    id: 'probe_eg',
    name: 'probe 分组',
    kind: 'enum_group' as const,
    baseField: dim,
    groups: [{ label: '组A', members: ['x'] }],
    ungroupedHandling: 'show_individually' as const,
  };

  // 用第一个 measure 当 value field
  const mName = metadata.measures[0]?.name;
  if (!mName) return { ok: false, errMsg: '没找到 measure' };

  // 手工拼 customElement(不通过 translateCustomElements,这样能逐变体试)
  const viewName =
    metadata.fields.find((f) => f.name === dim)?.viewId
      ? metadata.views.find((v) => v.id === metadata.fields.find((f) => f.name === dim)!.viewId)?.name ?? dim
      : dim;
  const columnName = `${cf.id}_col`;

  const customElements: CustomElement[] = [
    {
      _enum: 'CustomColumn',
      viewName,
      column: {
        name: columnName,
        alias: cf.name,
        desc: '',
        valueType: 'STRING',
        columnType: 'STRING',
        dataFormat: '',
        visible: true,
        maskRules: '',
        define: {
          _enum: 'EnumGroupColumn',
          [defineFieldNames.baseField]: dim,
          groups: cf.groups.map((g) => ({
            label: g.label,
            [defineFieldNames.groupValuesKey]: g.members,
          })),
          ...(defineFieldNames.otherHandlingKey
            ? { [defineFieldNames.otherHandlingKey]: defineFieldNames.otherHandling ?? 'SHOW_INDIVIDUALLY' }
            : {}),
        } as unknown,
      } as unknown,
    } as unknown as CustomElement,
    {
      _enum: 'CustomDimension',
      dimension: {
        name: cf.id,
        alias: cf.name,
        desc: '',
        hasAll: true,
        levels: [
          {
            name: cf.id,
            alias: cf.name,
            desc: '',
            levelType,
            dataFormat: '',
            valueType: 'STRING',
            maskRule: '',
          },
        ],
      },
      levelBindings: [
        {
          dimension: cf.id,
          level: cf.id,
          view: viewName,
          column: columnName,
          isCalc: false,
        },
      ],
    } as unknown as CustomElement,
  ];

  // 用 buildQuery 拼好基础 query 再加 customElements + 把 cf.id 拖到 row
  const baseQuery: Query = buildQuery(
    buildViewConfig({
      rows: [{ fieldName: cf.id, type: 'EnumGroup' }],
      values: [buildValueField({ measureName: mName })],
      customFields: [cf],
    }),
    metadata,
    {
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
    },
  );
  // 替换 customElements 为我们手工拼的(走当前变体)
  const query: Query = { ...baseQuery, customElements };

  try {
    await client.executeQuery(query);
    return { ok: true };
  } catch (err) {
    const e = err as Error & { status?: number };
    return {
      ok: false,
      status: e.status,
      errMsg: e.message?.slice(0, 200),
    };
  }
}

async function main() {
  const metadata = await loadMetadata();
  console.log(`  metadata: id=${metadata.id} name=${metadata.name}`);

  // 变体表 — cellset 实测后端真实 levelType 形式是 { _enum: 'GENERIC', type: '' }
  const levelTypeVariants: Array<{ label: string; value: unknown }> = [
    { label: '{ _enum: "GENERIC", type: "" } (cellset 实测形式)', value: { _enum: 'GENERIC', type: '' } },
    { label: '{ _enum: "GENERIC" }', value: { _enum: 'GENERIC' } },
    { label: '{ _enum: "LEVEL" }', value: { _enum: 'LEVEL' } },
    { label: '{ _enum: "TIME_YEAR" }', value: { _enum: 'TIME_YEAR' } },
    { label: 'string "GENERIC"', value: 'GENERIC' },
    { label: 'null', value: null },
  ];

  // EnumGroupColumn define 字段命名变体
  const defineVariants: Array<{
    label: string;
    fields: { baseField: string; groupValuesKey: string; otherHandlingKey?: string };
  }> = [
    {
      label: 'baseColumn + values + otherHandling',
      fields: { baseField: 'baseColumn', groupValuesKey: 'values', otherHandlingKey: 'otherHandling' },
    },
    {
      label: 'baseField + members + ungroupedHandling',
      fields: { baseField: 'baseField', groupValuesKey: 'members', otherHandlingKey: 'ungroupedHandling' },
    },
  ];

  console.log('\n2) probe levelType 形式(EnumGroupColumn 用 baseColumn/values/otherHandling):');
  for (const v of levelTypeVariants) {
    const r = await tryVariant(v.label, metadata, v.value, defineVariants[0]!.fields);
    const tag = r.ok ? '✓ PASS' : `✗ FAIL${r.status ? ` (${r.status})` : ''}`;
    console.log(`  ${tag.padEnd(14)} levelType = ${v.label}`);
    if (!r.ok && r.errMsg) console.log(`    ↳ ${r.errMsg}`);
  }

  console.log('\n3) probe EnumGroupColumn define 字段命名(levelType 用第 1 步通过的形式):');
  // 假设 step 2 找到一个 OK 的;若全失败,这步用 _enum 占位
  const okLT = levelTypeVariants[0]!.value; // 默认第一个,跑下来再看真实结果
  for (const v of defineVariants) {
    const r = await tryVariant(v.label, metadata, okLT, v.fields);
    const tag = r.ok ? '✓ PASS' : `✗ FAIL${r.status ? ` (${r.status})` : ''}`;
    console.log(`  ${tag.padEnd(14)} define = ${v.label}`);
    if (!r.ok && r.errMsg) console.log(`    ↳ ${r.errMsg}`);
  }

  console.log('\n完成。把上面输出贴回来 → 我按通过的变体改 customElements。');
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
