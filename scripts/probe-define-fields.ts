/**
 * Probe EnumGroupColumn.define 真实字段名
 *   - 基础形式来自 PRD appendix(推测)
 *   - "Column: null" 错误暗示某个引用字段名错 → 反序列化为 null
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement, Query } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

// 调高错误信息切片上限,看完整 stack
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
    console.log(`    ↳ ${e.message}`);
    return false;
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const m = metadata.measures[0]!;
  const dim = metadata.fields.find((f) => f.viewId === m.viewId)!;
  const view = metadata.views.find((v) => v.id === m.viewId)!;

  const cfId = 'probe_eg';
  const colName = `${cfId}_col`;
  const baseVc = buildViewConfig({
    rows: [{ fieldName: cfId, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: cfId, name: 'probe', kind: 'enum_group',
      baseField: dim.name, groups: [{ label: '组A', members: ['x'] }],
      ungroupedHandling: 'show_individually',
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

  console.log('=== 用 column 字段(已确认正确)+ 真实 year 值,探查 groups / handling 命名 ===');
  // 找一个真实 STRING 维度(品牌名称),用真实可能存在的成员值
  const stringDim = metadata.fields.find((f) => f.valueType === 'STRING' && f.name === '品牌名称');
  const useDim = stringDim ?? dim;
  const useView = metadata.views.find((v) => v.id === useDim.viewId)!;

  function makeCE2(define: Record<string, unknown>): CustomElement[] {
    return [
      {
        _enum: 'CustomColumn',
        viewName: useView.name,
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
          dimension: cfId, level: cfId, view: useView.name, column: colName, isCalc: false,
        }],
      } as unknown as CustomElement,
    ];
  }
  // 注:基础 query 仍是先前那个,但 customField 可能 row 字段不是同个 view → 这步只是看 customElements 反序列化是否过
  const baseVc2 = buildViewConfig({
    rows: [{ fieldName: cfId, type: 'EnumGroup' }],
    values: [buildValueField({ measureName: m.name })],
    customFields: [{
      id: cfId, name: 'probe', kind: 'enum_group',
      baseField: useDim.name, groups: [{ label: '组A', members: [] }],
      ungroupedHandling: 'show_individually',
    }],
  });
  const baseQuery2 = buildQuery(baseVc2, metadata, {
    rowPageNo: 1, rowPageSize: 10, columnPageNo: 1, columnPageSize: 10,
  });

  const groups = [{ label: '组A', values: ['Brand A', 'Brand B'] }];
  const variants: Array<{ label: string; define: Record<string, unknown> }> = [
    { label: 'column + groups[label/values] + otherHandling', define: { column: useDim.name, groups, otherHandling: 'SHOW_INDIVIDUALLY', otherLabel: '' } },
    { label: 'column + groups[label/members]', define: { column: useDim.name, groups: [{ label: '组A', members: ['Brand A'] }], otherHandling: 'SHOW_INDIVIDUALLY', otherLabel: '' } },
    { label: 'column + groups[label/items]', define: { column: useDim.name, groups: [{ label: '组A', items: ['Brand A'] }], otherHandling: 'SHOW_INDIVIDUALLY', otherLabel: '' } },
    { label: 'column + 没 otherHandling/otherLabel', define: { column: useDim.name, groups } },
    { label: 'column + ungroupedHandling 小写', define: { column: useDim.name, groups, ungroupedHandling: 'show_individually', ungroupedLabel: '' } },
    { label: 'column + handling 单字段', define: { column: useDim.name, groups, handling: 'SHOW_INDIVIDUALLY' } },
    { label: 'column + showOther: true', define: { column: useDim.name, groups, showOther: true, otherLabel: '' } },
    { label: 'column 全空(看后端必填字段报错)', define: { column: useDim.name } },
  ];
  // 用 baseQuery2(同一 view)
  for (const v of variants) {
    await tryQuery(v.label, { ...baseQuery2, customElements: makeCE2(v.define) });
  }
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
