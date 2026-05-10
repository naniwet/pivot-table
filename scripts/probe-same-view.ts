/**
 * 用同一个 view 的字段(避免跨表关系路径问题),搞清楚 viewName / baseColumn 的真实形式
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement, Query } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryQuery(label: string, query: Query): Promise<void> {
  try {
    await client.executeQuery(query);
    console.log(`  ✓ PASS  ${label}`);
  } catch (err) {
    const e = err as Error;
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`    ↳ ${e.message?.slice(0, 300)}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);

  // 找:第一个 measure 所在 view 中的某个 STRING 字段
  const m = metadata.measures[0]!;
  console.log(`measure: ${m.name} viewId=${m.viewId}`);
  const sameViewDim = metadata.fields.find(
    (f) => f.viewId === m.viewId && f.valueType === 'STRING',
  );
  if (!sameViewDim) {
    // 找不到同 view 的 STRING dim → 找 INTEGER dim 改用
    const intDim = metadata.fields.find(
      (f) => f.viewId === m.viewId && f.valueType !== null,
    );
    console.log('同 view 没 STRING 维度,可用维度:', intDim?.name, intDim?.valueType);
    if (!intDim) return;
  }
  const dim = sameViewDim ?? metadata.fields.find((f) => f.viewId === m.viewId)!;
  const view = metadata.views.find((v) => v.id === m.viewId)!;
  console.log(`baseField: ${dim.name} (id=${dim.id})`);
  console.log(`view: name=${view.name} id=${view.id} alias=${view.alias} aliasFromDb=${view.aliasFromDb}`);
  console.log(`view.define.tableName=${(view.define as { tableName: string }).tableName}`);

  const cfId = 'probe_eg';
  const colName = `${cfId}_col`;

  const baseVc = buildViewConfig({
    rows: [{ fieldName: cfId, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [
      {
        id: cfId, name: 'probe', kind: 'enum_group',
        baseField: dim.name,
        groups: [{ label: '组A', members: ['x'] }],
        ungroupedHandling: 'show_individually',
      },
    ],
  });
  const baseQuery = buildQuery(baseVc, metadata, {
    rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10,
  });

  function makeCE(viewIdentifier: string, baseColVal: string): CustomElement[] {
    return [
      {
        _enum: 'CustomColumn',
        viewName: viewIdentifier,
        column: {
          name: colName, alias: 'probe', desc: '',
          valueType: 'STRING', columnType: 'STRING',
          dataFormat: '', visible: true, maskRules: '',
          define: {
            _enum: 'EnumGroupColumn',
            baseColumn: baseColVal,
            groups: [{ label: '组A', values: ['x'] }],
            otherHandling: 'SHOW_INDIVIDUALLY',
            otherLabel: '',
          },
        },
      } as unknown as CustomElement,
      {
        _enum: 'CustomDimension',
        dimension: {
          name: cfId, alias: 'probe', desc: '', hasAll: true,
          levels: [{
            name: cfId, alias: 'probe', desc: '',
            levelType: { _enum: 'GENERIC' },
            dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId, level: cfId, view: viewIdentifier, column: colName, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
  }

  console.log('\n=== view 标识 + baseColumn 组合矩阵 ===');
  for (const v of [
    { label: 'view.name', value: view.name },
    { label: 'view.id', value: view.id },
    { label: 'view.alias', value: view.alias },
  ]) {
    for (const bc of [
      { label: 'dim.name', value: dim.name },
      { label: 'dim.id', value: dim.id },
    ]) {
      await tryQuery(
        `viewName=${v.label}("${v.value}"), baseColumn=${bc.label}`,
        { ...baseQuery, customElements: makeCE(v.value, bc.value) },
      );
    }
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
