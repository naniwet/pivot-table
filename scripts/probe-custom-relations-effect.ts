/**
 * 确认正确形态 CustomRelation 是否真被 backend 使用(不是无声忽略)。
 *
 * 用同形态 + fake column → 期望报错(字段找不到);
 * 用同形态 + 不可能成立的条件 → 期望 0 行 / SQL 报错。
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildQuery } from '../src/core/queryBuilder/buildQuery.js';
import { buildValueField, buildViewConfig } from '../src/fixtures/builders.js';
import { requireProbeEnv } from './lib/probeEnv.js';

const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 9000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryPost(label: string, relation: object | null): Promise<void> {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const dim = metadata.fields.find((f) => f.valueType === 'STRING')!.name;
  const m = metadata.measures[0]!.name;
  const vc = buildViewConfig({
    rows: [{ fieldName: dim, type: 'Dimension' }],
    values: [buildValueField({ measureName: m })],
  });
  const base = buildQuery(vc, metadata, {
    rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50,
  });
  const customElements = relation
    ? [{ _enum: 'CustomRelation', relation }]
    : [];
  const q = { ...base, customElements };
  try {
    const res = await client.executeQuery(q as ReturnType<typeof buildQuery>);
    console.log(`✓ ${label} — rows=${res.rows.length} cols=${res.columns.length}`);
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? '';
    const m = detail.match(/"message":"([^"]+)"/);
    console.log(`✗ ${label} — ${m?.[1] ?? e.message}`);
  }
}

async function main() {
  const metadata = await client.fetchMetadata(MODEL_ID);
  const cat = metadata.views.find((v) => v.name === 'categories')!;
  const prod = metadata.views.find((v) => v.name === 'products')!;
  const catID = metadata.fields.find((f) => f.viewId === cat.id && /CategoryID/i.test(f.name))!;
  const prodCatID = metadata.fields.find((f) => f.viewId === prod.id && /CategoryID/i.test(f.name))!;

  // a) baseline 不带 customRelation
  await tryPost('a) baseline 无 customRelation', null);

  // b) 正确形态:cat.CategoryID = prod.CategoryID
  await tryPost('b) 正确形态(真实字段名)', {
    left: cat.name, right: prod.name,
    leftCardinality: 'ONE', rightCardinality: 'MANY',
    direction: 'Single',
    condition: {
      _enum: 'BinaryExpr', op: '=',
      left: { _enum: 'ColumnRef', view: cat.name, column: catID.sqlColumnName },
      right: { _enum: 'ColumnRef', view: prod.name, column: prodCatID.sqlColumnName },
    },
    isWeak: true, isFilter: false,
  });

  // c) 假 column → backend 应该报字段找不到(D case 我们见过这格式)
  await tryPost('c) 假 column(应报字段找不到)', {
    left: cat.name, right: prod.name,
    leftCardinality: 'ONE', rightCardinality: 'MANY',
    direction: 'Single',
    condition: {
      _enum: 'BinaryExpr', op: '=',
      left: { _enum: 'ColumnRef', view: cat.name, column: 'FAKE_COL_NOT_EXIST' },
      right: { _enum: 'ColumnRef', view: prod.name, column: 'ALSO_FAKE' },
    },
    isWeak: true, isFilter: false,
  });

  // d) 不可能成立的条件 — 用 product.ProductID = order.OrderID(类型 ID 但完全不相关)
  const orders = metadata.views.find((v) => v.name === 'orders')!;
  const orderID = metadata.fields.find((f) => f.viewId === orders.id && /OrderID/i.test(f.name))!;
  const prodID = metadata.fields.find((f) => f.viewId === prod.id && /ProductID/i.test(f.name))!;
  await tryPost('d) 不可能成立(product.ProductID=orders.OrderID)', {
    left: prod.name, right: orders.name,
    leftCardinality: 'ONE', rightCardinality: 'MANY',
    direction: 'Single',
    condition: {
      _enum: 'BinaryExpr', op: '=',
      left: { _enum: 'ColumnRef', view: prod.name, column: prodID.sqlColumnName },
      right: { _enum: 'ColumnRef', view: orders.name, column: orderID.sqlColumnName },
    },
    isWeak: true, isFilter: false,
  });

  // e) replace 原 categories→products 关系(应该跟 baseline 同结果,因为 backend 已自动用)
  await tryPost('e) 真实 categories<->products 关系', {
    left: cat.name, right: prod.name,
    leftCardinality: 'ONE', rightCardinality: 'MANY',
    direction: 'Single',
    condition: {
      _enum: 'BinaryExpr', op: '=',
      left: { _enum: 'ColumnRef', view: cat.name, column: catID.sqlColumnName },
      right: { _enum: 'ColumnRef', view: prod.name, column: prodCatID.sqlColumnName },
    },
    isWeak: true, isFilter: false,
  });
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
