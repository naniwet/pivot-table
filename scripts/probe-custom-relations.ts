/**
 * Probe CustomRelation customElement — 验证后端接受 RelationGraphPanel 配出来的
 * 查询级关系覆盖层(viewConfig.customRelations → query.customElements[CustomRelation])。
 *
 * 流程:
 *   1. fetch metadata,打印原始 metadata.relationGraph.relations 给参考
 *   2. 自动挑前 2 个有字段的 view + 各自第 1 个字段,做 EQUALS 连线
 *   3. 构造 ViewConfig + customRelations[1 条] → buildQuery → 打印 CustomRelation customElement
 *   4. baseline:先发一个不含 customRelations 的查询(确认 query 本身正常)
 *   5. variant: 发含 CustomRelation 的查询,看后端是否接受
 *
 * 跑法:
 *   SMARTBI_TOKEN=st_xxx \
 *   SMARTBI_BASE=http://your-host:port/smartbi/smartbix \
 *   SMARTBI_MODEL_ID=your_model_id \
 *   npx tsx scripts/probe-custom-relations.ts
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type {
  CustomRelationConfig,
  ViewConfig,
} from '../src/types/viewConfig.js';
import type { DataSetField, Metadata } from '../src/types/metadata.js';
import { requireProbeEnv } from './lib/probeEnv.js';

const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
// probe 调到 5000 让 backend 的完整错误体能 dump 出来
(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

const PAGE_SETTINGS = {
  rowPageNo: 1,
  rowPageSize: 50,
  columnPageNo: 1,
  columnPageSize: 50,
};

function summarizeBaseGraph(metadata: Metadata): void {
  const graph = metadata.relationGraph as { relations?: unknown } | undefined;
  const rels = Array.isArray(graph?.relations) ? graph!.relations : [];
  console.log(`   metadata.relationGraph.relations: ${rels.length} 条`);
  for (const r of rels.slice(0, 5)) {
    const x = r as Record<string, unknown>;
    console.log(
      `     ${String(x.srcViewId)} --[${String(x.cardinalityType ?? '?')}]--> ${String(x.destViewId)}`,
    );
  }
  if (rels.length > 5) console.log(`     ... (+${rels.length - 5} more)`);
}

function pickUsableViews(metadata: Metadata) {
  const fieldsByView = new Map<string, DataSetField[]>();
  for (const f of metadata.fields) {
    if (!f.viewId) continue;
    const arr = fieldsByView.get(f.viewId) ?? [];
    arr.push(f);
    fieldsByView.set(f.viewId, arr);
  }
  const usable = metadata.views.filter((v) => (fieldsByView.get(v.id)?.length ?? 0) > 0);
  return { fieldsByView, usable };
}

function tryExecute(label: string, query: ReturnType<typeof buildQuery>): Promise<void> {
  return client
    .executeQuery(query)
    .then((res) => {
      console.log(`   ✓ ${label} PASS — rows=${res.rows.length} columns=${res.columns.length}`);
    })
    .catch((err: unknown) => {
      const e = err as Error & { status?: number; originalDetail?: string };
      console.log(`   ✗ ${label} FAIL — ${e.message}`);
      if (e.originalDetail) {
        console.log(`     originalDetail: ${e.originalDetail.slice(0, 2000)}`);
      }
    });
}

async function main(): Promise<void> {
  console.log('1) metadata...');
  const metadata = await client.fetchMetadata(MODEL_ID);
  console.log(`   ${metadata.id} / ${metadata.name}`);
  console.log(`   views: ${metadata.views.length}  fields: ${metadata.fields.length}  measures: ${metadata.measures.length}`);
  console.log(`   relationGraph: ${metadata.relationGraph ? 'yes' : 'no'}`);
  summarizeBaseGraph(metadata);

  // pick base dim + measure for any query
  const baseDim = metadata.fields.find((f) => f.valueType === 'STRING');
  const baseMeasure = metadata.measures[0];
  if (!baseDim || !baseMeasure) {
    console.log('需要至少 1 个 STRING 字段 + 1 个 measure;abort');
    process.exit(0);
  }

  // baseline:不含 customRelations 的简单 query
  console.log('\n2) baseline query(无 customRelations):');
  const baselineVC = buildViewConfig({
    rows: [{ fieldName: baseDim.name, type: 'Dimension' }],
    values: [buildValueField({ measureName: baseMeasure.name })],
  });
  const baselineQ = buildQuery(baselineVC, metadata, PAGE_SETTINGS);
  console.log('   customElements:', JSON.stringify(baselineQ.customElements));
  await tryExecute('baseline', baselineQ);

  // pick 2 usable views
  const { fieldsByView, usable } = pickUsableViews(metadata);
  if (usable.length < 2) {
    console.log('\n后端 metadata 不足 2 个有字段的 view — 没法构造跨表关系。abort.');
    return;
  }
  const left = usable[0]!;
  const right = usable[1]!;
  const leftField = fieldsByView.get(left.id)![0]!;
  const rightField = fieldsByView.get(right.id)![0]!;

  console.log('\n3) 构造 CustomRelation:');
  console.log(`   left:  ${left.name} (${left.id}) . ${leftField.name}`);
  console.log(`   right: ${right.name} (${right.id}) . ${rightField.name}`);

  const customRel: CustomRelationConfig = {
    id: 'probe-rel-1',
    name: 'probe-custom-relation',
    enabled: true,
    leftViewId: left.id,
    rightViewId: right.id,
    leftCardinality: 'ONE',
    rightCardinality: 'MANY',
    direction: 'Single',
    conditions: [{ leftFieldId: leftField.id, rightFieldId: rightField.id, operator: 'EQUALS' }],
    isWeak: true,
    isFilter: false,
  };

  const vc: ViewConfig = {
    ...baselineVC,
    customRelations: [customRel],
  };
  const q = buildQuery(vc, metadata, PAGE_SETTINGS);
  const relElements = q.customElements.filter(
    (e: { _enum: string }) => e._enum === 'CustomRelation',
  );
  console.log('\n4) 翻译后的 query.customElements[CustomRelation]:');
  console.log(JSON.stringify(relElements, null, 2));

  if (relElements.length === 0) {
    console.log(
      '\n⚠ translateCustomRelations 返回 0 条 — 多半是字段反查失败:\n' +
        `  - leftField.viewId="${leftField.viewId}" 期望 ===  leftViewId="${left.id}"\n` +
        `  - rightField.viewId="${rightField.viewId}" 期望 === rightViewId="${right.id}"\n` +
        '  - 或 metadata.views[].id / fields[].viewId 不对齐。脚本未发送 query。',
    );
    return;
  }

  console.log('\n5) 发送 query(含 CustomRelation)给后端:');
  await tryExecute('variant', q);
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
