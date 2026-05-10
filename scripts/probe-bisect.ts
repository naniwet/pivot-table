/**
 * Bisect:lvelType={_enum:'GENERIC'} 已确认通过反序列化,
 * 现在排查 EnumGroupColumn.define 哪个字段名/值导致 "Column: null not found"
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
    const e = err as Error & { status?: number };
    const msg = e.message?.slice(0, 250);
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`    ↳ ${msg}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const dim = metadata.fields.find((f) => f.valueType === 'STRING')!;
  const m = metadata.measures[0]!.name;
  const view = metadata.views.find((v) => v.id === dim.viewId)!;

  console.log(`baseField: ${dim.name} (id=${dim.id})`);
  console.log(`view: name=${view.name} id=${view.id} alias=${view.alias}`);

  const cfId = 'probe_eg';
  const colName = `${cfId}_col`;

  // 基础 vc(列出 customField 的 id 在 row 里)
  const baseVc = buildViewConfig({
    rows: [{ fieldName: cfId, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m })],
    customFields: [
      {
        id: cfId,
        name: 'probe',
        kind: 'enum_group',
        baseField: dim.name,
        groups: [{ label: '组A', members: ['x'] }],
        ungroupedHandling: 'show_individually',
      },
    ],
  });
  const baseQuery = buildQuery(baseVc, metadata, {
    rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10,
  });

  // 通用 levelType(已知 OK)
  const goodLevelType = { _enum: 'GENERIC' };

  // ============== Bisect 1: 用 dim.name vs dim.id 当 baseColumn ==============
  console.log('\n=== Bisect 1: baseColumn = name vs id ===');
  for (const baseColVal of [
    { label: `dim.name = "${dim.name}"`, value: dim.name },
    { label: `dim.id = "${dim.id.slice(0, 50)}..."`, value: dim.id },
  ]) {
    const ce: CustomElement[] = [
      {
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName,
          alias: 'probe',
          desc: '',
          valueType: 'STRING',
          columnType: 'STRING',
          dataFormat: '',
          visible: true,
          maskRules: '',
          define: {
            _enum: 'EnumGroupColumn',
            baseColumn: baseColVal.value,
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
            levelType: goodLevelType, dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId, level: cfId, view: view.name, column: colName, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
    await tryQuery(baseColVal.label, { ...baseQuery, customElements: ce });
  }

  // ============== Bisect 2: viewName = view.name vs view.id vs view.alias ==============
  console.log('\n=== Bisect 2: viewName + levelBindings.view ===');
  for (const v of [
    { label: `name = "${view.name}"`, value: view.name },
    { label: `id = "${view.id}"`, value: view.id },
    { label: `alias = "${view.alias}"`, value: view.alias },
  ]) {
    const ce: CustomElement[] = [
      {
        _enum: 'CustomColumn',
        viewName: v.value,
        column: {
          name: colName,
          alias: 'probe',
          desc: '',
          valueType: 'STRING',
          columnType: 'STRING',
          dataFormat: '',
          visible: true,
          maskRules: '',
          define: {
            _enum: 'EnumGroupColumn',
            baseColumn: dim.name,
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
            levelType: goodLevelType, dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId, level: cfId, view: v.value, column: colName, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
    await tryQuery(v.label, { ...baseQuery, customElements: ce });
  }

  // ============== Bisect 3: 不要 EnumGroupColumn,直接 column.define = { _enum: 'Column' } 透传字段 ==============
  console.log('\n=== Bisect 3: 用最简的 { _enum: "Column" } 而非 EnumGroupColumn ===');
  const ce: CustomElement[] = [
    {
      _enum: 'CustomColumn',
      viewName: view.name,
      column: {
        name: colName,
        alias: 'probe',
        desc: '',
        valueType: 'STRING',
        columnType: 'STRING',
        dataFormat: '',
        visible: true,
        maskRules: '',
        define: {
          _enum: 'Column',
          // 不知道字段名,先尝试空对象
        },
      },
    } as unknown as CustomElement,
    {
      _enum: 'CustomDimension',
      dimension: {
        name: cfId, alias: 'probe', desc: '', hasAll: true,
        levels: [{
          name: cfId, alias: 'probe', desc: '',
          levelType: goodLevelType, dataFormat: '', valueType: 'STRING', maskRule: '',
        }],
      },
      levelBindings: [{
        dimension: cfId, level: cfId, view: view.name, column: colName, isCalc: false,
      }],
    } as unknown as CustomElement,
  ];
  await tryQuery('column.define = { _enum: "Column" }(空)', { ...baseQuery, customElements: ce });
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
