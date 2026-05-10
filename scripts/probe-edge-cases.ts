/**
 * Probe customElements 边界:
 *   - OtherGroup.SpecificValue 的 prefix 字段(probe-correct-shape.ts 之前撞 SQL 拼接 bug)
 *   - RangeGroup includeMin / includeMax 4 种闭开组合
 *   - groups 真实数据(用 prepare 真实成员值)
 *
 * 运行:
 *   SMARTBI_TOKEN=st_xxx SMARTBI_BASE=... npx tsx scripts/probe-edge-cases.ts
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement, Query } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

/**
 * probe-edge-cases 是 schema 边界探查 — 部分 case 是**预期失败**的(后端 SQL bug / Scala 严格类型),
 * 用来验证我们前端的 customElements 翻译落在「后端能接受」的子集里。
 *
 * CI 角度:这个脚本不应因预期失败而 exit 1。改为只输出 PASS/FAIL,人工 review。
 */
async function tryQuery(label: string, query: Query): Promise<boolean> {
  try {
    await client.executeQuery(query);
    console.log(`  ✓ PASS  ${label}`);
    return true;
  } catch (err) {
    const m = (err as Error).message?.match(/"message":"([^"]+)"/);
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`    ↳ ${m?.[1] ?? (err as Error).message?.slice(0, 250)}`);
    return false;
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const m = metadata.measures[0]!;
  const stringDim = metadata.fields.find(
    (f) => f.viewId === m.viewId && f.valueType === 'STRING',
  );
  const numDim = metadata.fields.find(
    (f) => f.viewId === m.viewId &&
    ['INTEGER', 'LONG', 'DOUBLE', 'BIGDECIMAL', 'BIGINT', 'FLOAT'].includes(f.valueType ?? ''),
  );
  if (!stringDim || !numDim) {
    console.log(`同 view 找不到 STRING+数值 维度对(view=${metadata.views.find(v=>v.id===m.viewId)?.name})`);
    return;
  }
  const view = metadata.views.find((v) => v.id === m.viewId)!;
  console.log(`measure=${m.name}, stringDim=${stringDim.name}, numDim=${numDim.name}, view=${view.name}\n`);

  // ============ Round 1: SpecificValue.prefix ============
  console.log('=== Round 1: OtherGroup.SpecificValue.prefix 字段 ===');
  const cfId1 = 'probe_eg_prefix';
  const colName1 = `${cfId1}_col`;
  function makeEnumCE(defaultGroup: unknown, groups: Array<{ name: string; values: unknown[] }>): CustomElement[] {
    return [
      {
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName1, alias: 'probe', desc: '',
          valueType: 'STRING', columnType: 'STRING',
          dataFormat: '', visible: true, maskRules: '',
          define: {
            _enum: 'EnumGroupColumn',
            column: stringDim.name,
            groups,
            defaultGroup,
          },
        },
      } as unknown as CustomElement,
      {
        _enum: 'CustomDimension',
        dimension: {
          name: cfId1, alias: 'probe', desc: '', hasAll: true,
          levels: [{
            name: cfId1, alias: 'probe', desc: '',
            levelType: { _enum: 'GENERIC' },
            dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId1, level: cfId1, view: view.name, column: colName1, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
  }
  const enumVc = buildViewConfig({
    rows: [{ fieldName: cfId1, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: cfId1, name: 'probe', kind: 'enum_group',
      baseField: stringDim.name,
      groups: [{ label: '组A', members: ['__VAL__'] }],
      ungroupedHandling: 'merge_as_other',
    }],
  });
  const enumQuery = buildQuery(enumVc, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 5 });

  const groupsBaseline = [{ name: '组A', values: ['__BRAND_A__'] }];
  for (const v of [
    { label: 'SpecificValue + prefix omitted(none)', dg: { _enum: 'SpecificValue', value: '其他' } },
    { label: 'SpecificValue + prefix:null', dg: { _enum: 'SpecificValue', value: '其他', prefix: null } },
    { label: 'SpecificValue + prefix:""(空字符串)', dg: { _enum: 'SpecificValue', value: '其他', prefix: '' } },
    { label: 'SpecificValue + prefix:"非:"', dg: { _enum: 'SpecificValue', value: '其他', prefix: '非:' } },
  ]) {
    await tryQuery(v.label, { ...enumQuery, customElements: makeEnumCE(v.dg, groupsBaseline) });
  }

  // ============ Round 2: RangeGroup includeMin/Max 4 组合 ============
  console.log('\n=== Round 2: RangeGroup includeMin/includeMax 闭开 4 组合 ===');
  const cfId2 = 'probe_rg';
  const colName2 = `${cfId2}_col`;
  const rangeVc = buildViewConfig({
    rows: [{ fieldName: cfId2, type: 'RangeGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: cfId2, name: 'probe', kind: 'range_group',
      baseField: numDim.name,
      ranges: [
        { min: null, max: 100, label: '低' },
        { min: 100, max: null, label: '高' },
      ],
    }],
  });
  const rangeQuery = buildQuery(rangeVc, metadata, { rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 5 });

  function makeRangeCE(includeMin: boolean, includeMax: boolean): CustomElement[] {
    return [
      {
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName2, alias: 'probe', desc: '',
          valueType: 'STRING', columnType: 'STRING',
          dataFormat: '', visible: true, maskRules: '',
          define: {
            _enum: 'RangeGroupColumn',
            column: numDim.name,
            groups: [
              { name: '低', min: null, max: '100', includeMin, includeMax },
              { name: '中', min: '100', max: '200', includeMin, includeMax },
              { name: '高', min: '200', max: null, includeMin, includeMax },
            ],
            defaultGroup: 'OriginalValue',
          },
        },
      } as unknown as CustomElement,
      {
        _enum: 'CustomDimension',
        dimension: {
          name: cfId2, alias: 'probe', desc: '', hasAll: true,
          levels: [{
            name: cfId2, alias: 'probe', desc: '',
            levelType: { _enum: 'GENERIC' },
            dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId2, level: cfId2, view: view.name, column: colName2, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
  }
  for (const [imin, imax] of [
    [true, false],   // [min, max) — 我们前端默认
    [true, true],    // [min, max] — 闭闭
    [false, true],   // (min, max] — 开闭
    [false, false],  // (min, max) — 开开
  ] as const) {
    await tryQuery(`includeMin=${imin}, includeMax=${imax}`, { ...rangeQuery, customElements: makeRangeCE(imin, imax) });
  }

  console.log('\n=== Round 3: 同时 ranges 边界值多种(null / 数字 / 字符串) ===');
  // Smartbi RangeGroup.min/max 是 Option[String](Scala),null 表示 None,字符串表示 Some
  for (const variant of [
    { label: 'min:null + max:"100"(下半区)', groups: [{ name: '低', min: null, max: '100', includeMin: true, includeMax: false }] },
    { label: 'min:"100" + max:null(上半区)', groups: [{ name: '高', min: '100', max: null, includeMin: true, includeMax: false }] },
    { label: 'min:null + max:null(全集)', groups: [{ name: '所有', min: null, max: null, includeMin: true, includeMax: false }] },
    { label: 'min:数值字面量(100,not "100")— Scala 不接受', groups: [{ name: 'X', min: 100 as unknown as string, max: null, includeMin: true, includeMax: false }] },
  ]) {
    const ce: CustomElement[] = [
      {
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName2, alias: 'probe', desc: '',
          valueType: 'STRING', columnType: 'STRING',
          dataFormat: '', visible: true, maskRules: '',
          define: {
            _enum: 'RangeGroupColumn',
            column: numDim.name,
            groups: variant.groups,
            defaultGroup: 'OriginalValue',
          },
        },
      } as unknown as CustomElement,
      {
        _enum: 'CustomDimension',
        dimension: {
          name: cfId2, alias: 'probe', desc: '', hasAll: true,
          levels: [{
            name: cfId2, alias: 'probe', desc: '',
            levelType: { _enum: 'GENERIC' },
            dataFormat: '', valueType: 'STRING', maskRule: '',
          }],
        },
        levelBindings: [{
          dimension: cfId2, level: cfId2, view: view.name, column: colName2, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
    await tryQuery(variant.label, { ...rangeQuery, customElements: ce });
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
