/**
 * Probe CalcColumn 路径(行级表达式 + measure 包装)
 *
 * 用户场景 6:均价 = 销售额/数量,需要可对均价再 SUM/AVG。
 * MDX CustomCalcMeasure(已通过)是度量级表达式,不可再聚合。
 * CalcColumn 是行级,SQL 引擎做 row-level eval 后再 GROUP BY 聚合。
 *
 * 待确认:
 *   - CalcColumn.expr 字符串格式(Smartbi 表达式语言?MDX?SQL?)
 *   - 引用其他 measure 的语法 — `[name]` / `${name}` / 直接 name?
 *   - viewName 字段填什么(calc 应不属任一物理表)
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE!;
const MODEL_ID = process.env.SMARTBI_MODEL_ID!;

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

let failCount = 0;

async function tryQuery(
  label: string,
  customElements: CustomElement[],
  metadata: import('../src/types/metadata.js').Metadata,
) {
  // 用最小 viewConfig:1 row dim + 该 calc measure
  const cfId = 'cf_unit_price';
  const vc = buildViewConfig({
    rows: [{ fieldName: 'column2_Year2', type: 'Dimension' }],
    values: [buildValueField({ measureName: cfId })],
    customFields: [{
      id: cfId, name: '均价', kind: 'calc_measure',
      dataFormat: '#,##0.00',
      expression: 'placeholder',
      ast: null,
    }],
  });
  const baseQ = buildQuery(vc, metadata, {
    rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 5,
  });
  // 替换 customElements 为我们手工构造
  const q = { ...baseQ, customElements };
  try {
    await client.executeQuery(q);
    console.log(`  ✓ PASS  ${label}`);
  } catch (err) {
    failCount++;
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? e.message;
    const m = detail.match(/"message":"([^"]+)"/);
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`    ↳ ${m?.[1] ?? detail.slice(0, 250)}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  // 优先找两个 same-view measure(CalcColumn 行级算需要同表)
  const byView = new Map<string, typeof metadata.measures>();
  for (const m of metadata.measures) {
    if (!m.viewId) continue;
    const list = byView.get(m.viewId) ?? [];
    list.push(m);
    byView.set(m.viewId, list);
  }
  let m1 = metadata.measures[0]!;
  let m2 = metadata.measures[1] ?? m1;
  for (const list of byView.values()) {
    if (list.length >= 2) { m1 = list[0]; m2 = list[1]; break; }
  }
  const col1 = (m1 as { name: string; viewId: string | null; sqlColumnName?: string }).sqlColumnName ?? m1.name;
  const view1 = metadata.views.find((v) => v.id === m1.viewId)!;
  console.log(`measures: ${m1.name} (view=${m1.viewId}), ${m2.name} (view=${m2.viewId})`);
  console.log(`view: name=${view1.name}, id=${view1.id}`);
  console.log(`m1.sqlColumnName=${col1}\n`);

  const cfId = 'cf_unit_price';
  const colName = `${cfId}_col`;

  function makeCE(calcExpr: string, viewName: string): CustomElement[] {
    return [
      // 1) CustomColumn(CalcColumn)— 行级表达式列
      {
        _enum: 'CustomColumn',
        viewName,
        column: {
          name: colName,
          alias: '均价',
          desc: '',
          valueType: 'DOUBLE',
          columnType: 'DOUBLE',
          dataFormat: '#,##0.00',
          visible: true,
          maskRules: '',
          define: {
            _enum: 'CalcColumn',
            expr: calcExpr,
          },
        },
      } as unknown as CustomElement,
      // 2) CustomMeasure — 把 column 包成 measure(默认 SUM)
      {
        _enum: 'CustomMeasure',
        measure: {
          name: cfId,
          alias: '均价',
          desc: '',
          category: 'Measures',
          dataType: 'DOUBLE',
          aggregator: 'SUM',
          dataFormat: '#,##0.00',
          maskRule: '',
        },
        measureBinding: {
          measure: cfId,
          view: viewName,
          column: colName,
        },
      } as unknown as CustomElement,
    ];
  }

  console.log('=== expr 字符串形态 ===');
  // Smartbi 文档 / 跟 EnumGroupColumn 经验 — `column: ColumnName` 接受 string;
  // CalcColumn.expr 接受啥?probe 几种引用形式
  const m1Name = m1.name;
  const m2Name = m2.name;
  // measure 自身没 sqlColumnName,但 metadata.fields 里同 viewId 的 field 才是物理列
  type FieldLite = { name: string; viewId?: string | null; sqlColumnName?: string | null };
  const sameViewFields = (metadata.fields as FieldLite[]).filter((f) => f.viewId === m1.viewId);
  // refDataSetFieldId 末尾段 = field name 段(eg ".../销售成本_1753..." → ".../销售成本")
  const refToFieldName = (refId: string | null | undefined) => {
    if (!refId) return null;
    const tail = refId.split('-').pop()!;
    const stripped = tail.replace(/_\d+$/, '');
    return sameViewFields.find((f) => f.name === stripped)?.name ?? null;
  };
  const f1 = refToFieldName((m1 as { refDataSetFieldId?: string }).refDataSetFieldId) ?? sameViewFields[0]?.name ?? m1.name;
  const f2 = refToFieldName((m2 as { refDataSetFieldId?: string }).refDataSetFieldId) ?? sameViewFields[1]?.name ?? m2.name;
  console.log(`field 物理列: ${f1}, ${f2}\n`);

  for (const v of [
    { label: `expr="[f1]/[f2]"(MDX 风 + 物理列名)`, expr: `[${f1}]/[${f2}]` },
    { label: `expr="\${f1}/\${f2}"(Smartbi 模板 + 物理列名)`, expr: `\${${f1}}/\${${f2}}` },
    { label: `expr="f1/f2"(裸物理列名)`, expr: `${f1}/${f2}` },
    { label: `expr="[m1]/[m2]"(MDX 风 + measure name)`, expr: `[${m1Name}]/[${m2Name}]` },
    { label: 'expr=数字字面量 "1.0"', expr: '1.0' },
  ]) {
    await tryQuery(v.label, makeCE(v.expr, view1.name), metadata);
  }

  if (failCount > 0) {
    console.log(`\n${failCount} 个 case ✗ — 后续修代码前先看 PASS 的形态`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
