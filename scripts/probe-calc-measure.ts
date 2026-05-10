/**
 * Probe customField calc_measure(计算度量)端到端是否能 work
 *
 * 当前前端翻译:
 *   { _enum: 'CustomCalcMeasure', measure: { name, dataFormat, expression, ast } }
 *
 * Schema(query-schema.json)说 CalcMeasure required:
 *   name / alias / desc / category / dataType / dataFormat / maskRule / expr (MDX)
 *
 * 显然前端目前出的字段名 + 必填字段都跟 schema 对不上 — 实测看后端到底要什么。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { parseExpression } from '../src/core/expression/parseExpression.js';
import { astToMdx } from '../src/core/expression/astToMdx.js';
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
    const e = err as Error & { originalDetail?: string; status?: number; code?: string };
    console.log(`  ✗ FAIL  ${label}`);
    // SmartbiError 把后端 detail 存在 originalDetail
    const detail = e.originalDetail ?? e.message;
    console.log(`    ↳ ${detail.slice(0, 600)}`);
    return false;
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  // 找 2 个 measure 用来构造 calc 表达式
  const m1 = metadata.measures[0];
  const m2 = metadata.measures[1] ?? metadata.measures[0];
  if (!m1 || !m2) { console.log('measures 不够'); return; }
  console.log(`measures: ${m1.name}, ${m2.name}\n`);

  const cfId = 'probe_calc';
  const userExpr = `[${m1.name}]/[${m2.name}]`;
  const ast = parseExpression(userExpr);
  const mdx = astToMdx(ast);
  console.log(`user expression: ${userExpr}`);
  console.log(`generated MDX:   ${mdx}\n`);

  const baseVc = buildViewConfig({
    rows: [{ fieldName: 'column2_Year', type: 'Dimension' }],
    values: [
      buildValueField({ measureName: m1.name }),
      buildValueField({ measureName: cfId }), // calc_measure 通过 id 引用
    ],
    customFields: [{
      id: cfId, name: '比率', kind: 'calc_measure',
      dataFormat: '#,##0.00',
      expression: userExpr,
      ast,
    }],
  });
  const baseQ = buildQuery(baseVc, metadata, {
    rowPageNo: 1, rowPageSize: 5, columnPageNo: 1, columnPageSize: 5,
  });

  function makeCE(measure: Record<string, unknown>): CustomElement[] {
    return [
      {
        _enum: 'CustomCalcMeasure',
        measure,
      } as unknown as CustomElement,
    ];
  }

  console.log('--- baseQ.rows / columns / fields(对照看 calc 引用) ---');
  console.log('rows:', baseQ.rows);
  console.log('columns:', baseQ.columns);
  console.log('fields:', JSON.stringify(baseQ.fields, null, 2));
  console.log();

  console.log('=== Round A: measure.name = cf.id(query.columns 引用的就是它) ===');
  await tryQuery('measure.name=cfId,alias=cf.name,expr=MDX', {
    ...baseQ,
    customElements: makeCE({
      name: cfId, alias: '比率', desc: '', category: 'Measures',
      dataType: 'DOUBLE', dataFormat: '#,##0.00', maskRule: '',
      expr: mdx,
    }),
  });

  console.log('\n=== Round B: name=cfId + expr 用 ast(对象,不是字符串) ===');
  await tryQuery('name=cfId, expr=ast 对象', {
    ...baseQ,
    customElements: makeCE({
      name: cfId, alias: '比率', dataFormat: '#,##0.00',
      expr: ast,
    }),
  });

  console.log('\n=== Round C: 兜底 — 简化用户表达式 expr ===');
  await tryQuery('name=cfId, expr=user 表达式', {
    ...baseQ,
    customElements: makeCE({
      name: cfId, alias: '比率', dataFormat: '#,##0.00',
      expr: userExpr,
    }),
  });

  console.log('\n=== Round 0: 完全不发 customElements,看 baseline ===');
  await tryQuery('baseline:无 customElements(probe_calc 没注册)', { ...baseQ, customElements: [] });

  console.log('\n=== Round 1: 当前前端形态 ===');
  const currentCE = makeCE({
    name: '比率', dataFormat: '#,##0.00', expression: userExpr, ast,
  });
  console.log('  customElements:', JSON.stringify(currentCE, null, 2));
  await tryQuery('current { name, dataFormat, expression, ast }', {
    ...baseQ,
    customElements: currentCE,
  });

  console.log('\n=== Round 2: schema 标准 ===');
  await tryQuery('schema:{ name, alias, desc, category, dataType, dataFormat, maskRule, expr }', {
    ...baseQ,
    customElements: makeCE({
      name: '比率',
      alias: '比率',
      desc: '',
      category: 'Measures',
      dataType: 'DOUBLE',
      dataFormat: '#,##0.00',
      maskRule: '',
      expr: mdx,
    }),
  });

  console.log('\n=== Round 3: schema + ast 也带上 ===');
  await tryQuery('schema + ast', {
    ...baseQ,
    customElements: makeCE({
      name: '比率',
      alias: '比率',
      desc: '',
      category: 'Measures',
      dataType: 'DOUBLE',
      dataFormat: '#,##0.00',
      maskRule: '',
      expr: mdx,
      ast,
    }),
  });

  console.log('\n=== Round 4: expr 字段用业务表达式(不是 MDX) ===');
  await tryQuery('expr=用户业务表达式', {
    ...baseQ,
    customElements: makeCE({
      name: '比率', alias: '比率', desc: '', category: 'Measures',
      dataType: 'DOUBLE', dataFormat: '#,##0.00', maskRule: '',
      expr: userExpr, // [销售额_m]/[销售成本_m]
    }),
  });

  console.log('\n=== Round 5: 仅 name + expr 看哪些是真必填 ===');
  await tryQuery('minimal:{ name, expr }', {
    ...baseQ,
    customElements: makeCE({ name: '比率', expr: mdx }),
  });

  console.log('\n=== Round 6: expression 字段名(老前端) + 其他 schema 字段 ===');
  await tryQuery('expression(name) + schema 其他字段', {
    ...baseQ,
    customElements: makeCE({
      name: '比率', alias: '比率', desc: '', category: 'Measures',
      dataType: 'DOUBLE', dataFormat: '#,##0.00', maskRule: '',
      expression: mdx,
    }),
  });
}

main().catch((err) => { console.error('probe failed:', err); process.exit(1); });
