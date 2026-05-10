/**
 * 用户给出的后端 Scala 源码:
 *   case class EnumGroup(name: String, values: List[Option[String]])
 *   case class RangeGroup(name: String, min: Option[String], max: Option[String], includeMin: Boolean, includeMax: Boolean)
 *   EnumGroupColumn(column: ColumnName, groups: List[EnumGroup], defaultGroup: OtherGroup)
 *
 * 已知:
 *   - groups[].name(不是 label)
 *   - 还有 defaultGroup: OtherGroup(不是 otherHandling/otherLabel)
 *   - column: ColumnName 可能是结构化对象(不是单 String)
 *
 * probe:
 *   1. ColumnName:是 string 还是 { name, view } 等
 *   2. OtherGroup 的 shape
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement, Query } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi/smartbix';
const MODEL_ID = process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryQuery(label: string, query: Query): Promise<boolean> {
  try {
    await client.executeQuery(query);
    console.log(`  ✓ PASS  ${label}`);
    return true;
  } catch (err) {
    const e = err as Error;
    console.log(`  ✗ FAIL  ${label}`);
    // 只取 message 字段(去 stack 噪音)
    const m = e.message?.match(/"message":"([^"]+)"/);
    console.log(`    ↳ ${m?.[1] ?? e.message?.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const m = metadata.measures[0]!;
  const dim = metadata.fields.find((f) => f.viewId === m.viewId && f.valueType === 'STRING') ??
              metadata.fields.find((f) => f.viewId === m.viewId)!;
  const view = metadata.views.find((v) => v.id === m.viewId)!;

  console.log(`baseField: ${dim.name} viewName: ${view.name}`);

  const cfId = 'probe_eg';
  const colName = `${cfId}_col`;
  const baseVc = buildViewConfig({
    rows: [{ fieldName: cfId, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: cfId, name: 'probe', kind: 'enum_group',
      baseField: dim.name, groups: [], ungroupedHandling: 'show_individually',
    }],
  });
  const baseQuery = buildQuery(baseVc, metadata, {
    rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10,
  });

  function makeCE(define: Record<string, unknown>): CustomElement[] {
    return [
      {
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName, alias: 'probe', desc: '',
          valueType: 'STRING', columnType: 'STRING',
          dataFormat: '', visible: true, maskRules: '',
          define: { _enum: 'EnumGroupColumn', ...define },
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
          dimension: cfId, level: cfId, view: view.name, column: colName, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
  }

  console.log('\n=== Round 3: 用源码确认的 OtherGroup 子类型 ===');
  // enum OtherGroup:
  //   case SpecificValue(value: String, prefix: Option[String] = None)
  //   case OriginalValue
  const groups = [{ name: '组A', values: ['Brand A'] }];

  const variants = [
    { label: '{ _enum: "OriginalValue" }', dg: { _enum: 'OriginalValue' } },
    { label: '"OriginalValue" 字符串字面量', dg: 'OriginalValue' as unknown },
    { label: '{ _enum: "OriginalValue", value: null }', dg: { _enum: 'OriginalValue', value: null } },
    { label: 'SpecificValue(value:"其他") (已知通过)', dg: { _enum: 'SpecificValue', value: '其他' } },
    { label: 'SpecificValue(value:"") 空 value', dg: { _enum: 'SpecificValue', value: '' } },
  ];

  for (const v of variants) {
    await tryQuery(v.label, { ...baseQuery, customElements: makeCE({ column: dim.name, groups, defaultGroup: v.dg }) });
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
