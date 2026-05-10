/**
 * 序列化兼容性回归测试 — viewConfig 是公开持久化协议
 *
 * 目的:**钉死历史 shape 仍可读**。任何 schema 变更想保持向后兼容,
 * 这里的 fixture 都得通过 `validateViewConfig` + `buildQuery` 不抛错。
 *
 * 反悔成本:CLAUDE.md "几乎不可逆 — 数据 schema"。这条 test suite 红了 = schema 破坏了
 * 历史用户保存的视图,需要 review:
 *   - 加新必填字段?改 optional + 给 default
 *   - 改 union shape?保留旧 case 解析路径
 *   - 删字段?用 deprecation 注释先 mark 一段时间,等 migration
 *
 * 历史里程碑:
 *   - v0.0.1(P0):rows / columns / values / filters / pageState
 *   - v0.0.2(P1):measureFilters / customFields[] / quickCalc / aggregator override
 *   - v0.0.3(P2):customFields 含 calc_measure(ast 可能 null,老序列化)
 *   - v0.0.4(P3):pageState 多 displayMode / chartType / freeze* / compress* 等
 *   - v0.0.5(P5):queryMode='adhoc' / extensions.__pivotSnapshot__ / 4 种 customField
 *   - v0.0.6(本月):customField 第 5 种 dim_as_measure / calc_column
 *
 * 不是为每个 milestone 加 fixture — 是为每个**容易破坏兼容**的 shape 钉一个 case。
 */
import { describe, expect, it } from 'vitest';

import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { ViewConfig } from '../../types/viewConfig.js';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { buildQueryFor } from '../queryBuilder/buildQueryFor.js';
import { validateViewConfig } from '../queryBuilder/validators.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

const SALES = FIELD_IDS.salesMeasure;
const HIER = FIELD_IDS.shipRegionHierarchy;
const PROVINCE = FIELD_IDS.provinceLevel;

/** 历史最小 ViewConfig — P0 时代的最薄 shape */
const v0_0_1_minimal: ViewConfig = {
  rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
  columns: [],
  values: [{ measureName: SALES, aggregator: null, quickCalc: null }],
  filters: [],
  measureFilters: [], // P1 加,但老 shape 里也不会有问题(空数组)
  rowSorts: [],
  columnSorts: [],
  pageState: {
    rowPageNo: 1,
    rowPageSize: 50,
    columnPageNo: 1,
    columnPageSize: 50,
  },
  customFields: [], // P2 加,老 shape 默认空数组(P0 序列化也得能反序列回 [])
  extensions: null,
};

describe('viewConfig 序列化兼容性 — v0.0.1 P0 最小 shape', () => {
  // 这个 case 同时覆盖:
  //   - validate 通过(必填字段都在)
  //   - buildQuery 产 PivotQuery
  //   - aggregator=null / extensions=null 等 P0 老序列化默认值不抛错
  // (之前拆 3 个 it 是 spec restatement,合并)
  it('validate 通过 + buildQuery 产 PivotQuery', () => {
    expect(() => validateViewConfig(v0_0_1_minimal, metaIndex)).not.toThrow();
    const q = buildQueryFor(v0_0_1_minimal, orderModelMetadata, v0_0_1_minimal.pageState);
    expect(q?.queryType).toBe('PivotQuery');
    expect(q?.rows).toEqual([PROVINCE]);
    expect(q?.columns).toEqual([SALES]);
  });
});

describe('viewConfig 序列化兼容性 — v0.0.2 P1 度量过滤 + Hierarchy', () => {
  const v0_0_2: ViewConfig = {
    rows: [{ fieldName: HIER, type: 'Hierarchy', drillDepth: 2 }],
    columns: [],
    values: [{ measureName: SALES, aggregator: 'AVG', quickCalc: null }],
    filters: [
      { kind: 'leaf', field: PROVINCE, operator: 'In', value: ['江苏'] },
    ],
    measureFilters: [
      {
        kind: 'leaf',
        measureName: SALES,
        operator: 'GreaterThan',
        value: 1000,
      },
    ],
    rowSorts: [{ type: 'ByMeasure', measureName: SALES, direction: 'DESC' }],
    columnSorts: [],
    pageState: {
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
    },
    customFields: [],
    extensions: null,
  };

  it('validateViewConfig 通过 + Hierarchy 展开 drillDepth=2', () => {
    expect(() => validateViewConfig(v0_0_2, metaIndex)).not.toThrow();
    const q = buildQueryFor(v0_0_2, orderModelMetadata, v0_0_2.pageState);
    // Hierarchy drillDepth=2 → query.rows 展开 2 个 level
    expect(q?.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('measureFilter leaf(P1 引入,旧 kind:undefined 兼容)', () => {
    const oldShape = {
      ...v0_0_2,
      measureFilters: [
        // 老序列化没 kind 字段(P3 才加 union),按 leaf 处理
        { measureName: SALES, operator: 'GreaterThan', value: 1000 } as never,
      ],
    };
    expect(() => validateViewConfig(oldShape, metaIndex)).not.toThrow();
  });
});

describe('viewConfig 序列化兼容性 — v0.0.3 P2 自建字段 + ast=null 兼容', () => {
  const cfWithNullAst: ViewConfig = {
    ...v0_0_1_minimal,
    customFields: [
      {
        id: 'cm_legacy',
        name: '比率',
        kind: 'calc_measure',
        dataFormat: '百分比',
        expression: '[a]/[b]',
        ast: null, // ← 老序列化的 P0/P1 stub
      },
    ],
    values: [{ measureName: 'cm_legacy', aggregator: null, quickCalc: null }],
  };

  it('ast=null 不抛错 — translateCustomElements 跳过该 element,buildQuery 仍产出', () => {
    expect(() => validateViewConfig(cfWithNullAst, metaIndex)).not.toThrow();
    const q = buildQueryFor(cfWithNullAst, orderModelMetadata, cfWithNullAst.pageState);
    expect(q).not.toBeNull();
    // ast=null → customElements 不含 CustomCalcMeasure(被 translator 跳过)
    const calcEls = q?.customElements.filter(
      (e) => '_enum' in e && e._enum === 'CustomCalcMeasure',
    );
    expect(calcEls).toHaveLength(0);
  });
});

describe('viewConfig 序列化兼容性 — v0.0.4 P3 pageState 字段不全也能反序列化', () => {
  // 老 viewConfig 只有最小 pageState — P3+ 加的 displayMode/chartType/freeze* 等都缺
  const v0_0_4_minimalPageState: ViewConfig = {
    ...v0_0_1_minimal,
    pageState: {
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
      // 没 displayMode / freezeHeader / compressEmpty* / showGrandTotal 等 — 走默认
    },
  };

  it('全部新字段 undefined 不影响 buildQuery', () => {
    expect(() => validateViewConfig(v0_0_4_minimalPageState, metaIndex)).not.toThrow();
    const q = buildQueryFor(
      v0_0_4_minimalPageState,
      orderModelMetadata,
      v0_0_4_minimalPageState.pageState,
    );
    expect(q).not.toBeNull();
  });
});

describe('viewConfig 序列化兼容性 — v0.0.5 P5 adhoc + extensions.pivotSnapshot', () => {
  const v0_0_5_withSnapshot: ViewConfig = {
    rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
    columns: [],
    values: [{ measureName: SALES, aggregator: null, quickCalc: null }], // adhoc 不空 values 也合法
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageState: {
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
    },
    customFields: [],
    queryMode: 'adhoc',
    extensions: {
      __pivotSnapshot__: {
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        columns: [],
        values: [{ measureName: SALES, aggregator: null, quickCalc: null }],
        columnSorts: [],
      },
    },
  };

  it('queryMode=adhoc + extensions 含 pivotSnapshot → buildQueryFor 走 adhoc 分支', () => {
    expect(() => validateViewConfig(v0_0_5_withSnapshot, metaIndex)).not.toThrow();
    const q = buildQueryFor(
      v0_0_5_withSnapshot,
      orderModelMetadata,
      v0_0_5_withSnapshot.pageState,
    );
    expect(q?.queryType).toBe('DetailQuery');
  });

  // 不再单测 "extensions=null" — 已被 v0.0.1 minimal 覆盖(它就 extensions: null)

  it('queryMode 缺省(undefined)等同 pivot', () => {
    const v: ViewConfig = { ...v0_0_1_minimal };
    delete (v as { queryMode?: 'pivot' | 'adhoc' }).queryMode;
    const q = buildQueryFor(v, orderModelMetadata, v.pageState);
    expect(q?.queryType).toBe('PivotQuery');
  });
});

describe('viewConfig 序列化兼容性 — v0.0.6 5 种 customField 都能反序列化', () => {
  const v0_0_6_allCustomKinds: ViewConfig = {
    rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
    columns: [],
    values: [{ measureName: SALES, aggregator: null, quickCalc: null }],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageState: {
      rowPageNo: 1,
      rowPageSize: 50,
      columnPageNo: 1,
      columnPageSize: 50,
    },
    customFields: [
      // 1. calc_measure(MDX)
      {
        id: 'cm1',
        name: '比率',
        kind: 'calc_measure',
        dataFormat: '百分比',
        expression: '[a]/[b]',
        ast: null,
      },
      // 2. enum_group(分组)
      {
        id: 'eg1',
        name: '区域分组',
        kind: 'enum_group',
        baseField: PROVINCE,
        groups: [{ label: '沿海', members: ['江苏', '浙江'] }],
        ungroupedHandling: 'show_individually',
      },
      // 3. range_group(区间)
      {
        id: 'rg1',
        name: '价格分段',
        kind: 'range_group',
        baseField: PROVINCE,
        ranges: [{ min: 0, max: 100, label: '低' }],
      },
      // 4. calc_column(行级计算列)— P5+ 加
      {
        id: 'cc1',
        name: '均价',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: '[销售额]/[数量]',
        ast: null,
      },
      // 5. dim_as_measure(维度转度量)— P5+ 加
      {
        id: 'dam1',
        name: '销售员(COUNT_DISTINCT)',
        kind: 'dim_as_measure',
        sourceField: '城市分组',
        aggregator: 'COUNT_DISTINCT',
        dataFormat: '',
      },
    ],
    extensions: null,
  };

  it('5 种 kind 共存,validateViewConfig 通过', () => {
    expect(() =>
      validateViewConfig(v0_0_6_allCustomKinds, metaIndex),
    ).not.toThrow();
  });

  it('JSON.stringify → JSON.parse round-trip 等值(纯数据 shape,无函数)', () => {
    const json = JSON.stringify(v0_0_6_allCustomKinds);
    const restored = JSON.parse(json) as ViewConfig;
    expect(restored).toEqual(v0_0_6_allCustomKinds);
    // restored 还能继续过 validate
    expect(() => validateViewConfig(restored, metaIndex)).not.toThrow();
  });
});

// 不再单独 JSON round-trip 测试 — v0.0.6 那条已经覆盖最复杂 shape 的 round-trip
// (5 种 customField 都 round-trip OK,其他更简单的 shape 不可能有问题)

// ============================================================
// v0.0.7(本月)— pageState.conditionalFormats 新增 optional 字段
// ============================================================
describe('viewConfig 序列化兼容性 — v0.0.7 条件格式化', () => {
  it('老 viewConfig 无 conditionalFormats 字段 → 渲染按"无规则"处理(不抛错)', () => {
    // v0_0_1_minimal pageState 没 conditionalFormats — 应该跑通
    expect(() => validateViewConfig(v0_0_1_minimal, metaIndex)).not.toThrow();
    const q = buildQueryFor(v0_0_1_minimal, orderModelMetadata, v0_0_1_minimal.pageState);
    expect(q).not.toBeNull();
  });

  it('threshold + dataBar 共存 → JSON round-trip 等值', () => {
    const vc: ViewConfig = {
      ...v0_0_1_minimal,
      pageState: {
        ...v0_0_1_minimal.pageState,
        conditionalFormats: [
          {
            id: 'th1',
            measure: SALES,
            kind: 'threshold',
            conditions: [
              { op: 'gt', value: 1000, style: { bg: '#ef4444', bold: true } },
              { op: 'between', value: [0, 100], style: { fg: '#22c55e' } },
            ],
          },
          {
            id: 'db1',
            measure: SALES,
            kind: 'dataBar',
            color: '#3b82f6',
            range: 'auto',
          },
          {
            id: 'db2',
            measure: SALES,
            kind: 'dataBar',
            color: '#10b981',
            range: { min: 0, max: 1 },
          },
        ],
      },
    };
    expect(() => validateViewConfig(vc, metaIndex)).not.toThrow();
    expect(JSON.parse(JSON.stringify(vc))).toEqual(vc);
  });
});
