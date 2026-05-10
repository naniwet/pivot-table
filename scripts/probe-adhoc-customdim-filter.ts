/**
 * Probe: 验证用户提议的"先建 CustomDimension 指向 column1,再 ByLevel 引用"路径
 *
 * 跟之前的 probe-adhoc-measure-filter 对比:
 *   B 路径 = 直接 ByLevel{level: 'column1'} — 依赖后端宽松解析
 *   E 路径 = 在 query.customElements 里 declare CustomDimension,ByLevel 引用 synthetic level name
 *
 * E 路径如果 work,就是用户提议的"正确做法":
 *   - 显式声明,不依赖后端隐式行为
 *   - 协议层面跟 calc_column / dim_as_measure 同构,可信
 */
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildAdhocQuery } from '../src/core/queryBuilder/buildAdhocQuery.js';
import { buildViewConfig } from '../src/fixtures/builders.js';
import type { CustomElement, Filter, Query } from '../src/types/query.js';

const TOKEN = process.env.SMARTBI_TOKEN!;
const BASE = process.env.SMARTBI_BASE ?? 'http://10.10.202.100:28082/smartbi/smartbix';
const MODEL_ID = process.env.SMARTBI_MODEL_ID ?? 'I8a8aa3ed018ff259f259763901900f943a901c9a';
const THRESHOLD = Number(process.env.PROBE_THRESHOLD ?? 99999999);

(globalThis as { __SMARTBI_ERR_LIMIT__?: number }).__SMARTBI_ERR_LIMIT__ = 5000;
const client = new SmartbiClient({ baseUrl: BASE, auth: { token: TOKEN } });

async function tryQuery(label: string, q: Query): Promise<void> {
  try {
    const cs = await client.executeQuery(q);
    console.log(`  ✓ ${label} — rows=${cs.rows.length}`);
    if (cs.rows.length > 0 && cs.rows.length <= 5) {
      console.log(`    sample row members:`, cs.rows[0]!.map((m) => m.name).join(' | '));
    }
  } catch (err) {
    const e = err as Error & { originalDetail?: string };
    const detail = e.originalDetail ?? e.message;
    console.log(`  ✗ ${label}`);
    console.log(`    ↳ ${detail.slice(0, 350)}`);
  }
}

async function main() {
  const md = await client.fetchMetadata(MODEL_ID);
  const measure = md.measures[0]!;
  // 解析 physical view + column(参考 customElements 的 findPhysicalColumn)
  let viewName = '';
  let physColumn = measure.name;
  if (measure.refDataSetFieldId) {
    const f = md.fields.find((ff) => ff.id === measure.refDataSetFieldId);
    if (f) {
      physColumn = f.name;
      // 找 view name(从 metadata.views 按 viewId 匹配)
      const view = (md as { views?: Array<{ id: string; name: string }> }).views?.find(
        (v) => v.id === f.viewId,
      );
      viewName = view?.name ?? '';
    }
  }
  const dim = md.levels[0]!;
  const synthLevelName = `__filter_${measure.name}`; // 唯一 id

  console.log(`measure: ${measure.name}, physColumn=${physColumn}, view=${viewName}`);
  console.log(`synth level name: ${synthLevelName}\n`);

  // 基线
  const vc = buildViewConfig({
    rows: [{ fieldName: dim.name, type: 'Dimension' }],
    queryMode: 'adhoc',
  });
  vc.pageState.rowPageSize = 5;
  const base = buildAdhocQuery(vc, md, vc.pageState);

  // 构造 CustomDimension(跟 calc_column 同构)
  const customDim: CustomElement = {
    _enum: 'CustomDimension',
    dimension: {
      name: synthLevelName,
      alias: measure.name,
      desc: '',
      hasAll: true,
      levels: [
        {
          name: synthLevelName,
          alias: measure.name,
          desc: '',
          levelType: { _enum: 'GENERIC' },
          dataFormat: '',
          valueType: 'DOUBLE',
          maskRule: '',
        },
      ],
    },
    levelBindings: [
      {
        dimension: synthLevelName,
        level: synthLevelName,
        view: viewName,
        column: physColumn,
        isCalc: false,
      },
    ],
  } as unknown as CustomElement;

  console.log(`=== Case E:declare CustomDimension + ByLevel(synth level name)— 用户提议路径 ===`);
  const qE: Query = {
    ...base,
    customElements: [customDim],
    dimensionFilter: {
      filter: {
        _enum: 'ByLevel',
        level: synthLevelName,
        operator: 'GreaterThan',
        value: THRESHOLD,
      } as Filter,
    },
  };
  await tryQuery('E: customElements + ByLevel(synthLevel)', qE);

  // 对照:不 declare customDim,直接 ByLevel synthLevel(应失败)
  console.log(`\n=== Case E':不 declare,只 ByLevel(synth level name) — 对照,应失败 ===`);
  const qEPrime: Query = {
    ...base,
    customElements: [],
    dimensionFilter: {
      filter: {
        _enum: 'ByLevel',
        level: synthLevelName,
        operator: 'GreaterThan',
        value: THRESHOLD,
      } as Filter,
    },
  };
  await tryQuery("E': only ByLevel(synthLevel) without declaration", qEPrime);

  console.log(`\n=== 结论 ===`);
  console.log(`E threshold=${THRESHOLD}:rows=0 表示过滤生效;rows=5 表示无过滤`);
  console.log(`E' 应该报错(level 没声明)— 验证 declaration 是否真的有效`);
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
