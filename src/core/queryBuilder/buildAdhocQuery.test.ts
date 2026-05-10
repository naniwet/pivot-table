/**
 * buildAdhocQuery 测试 — 不变量:
 *   I1. queryType='DetailQuery'
 *   I2. rows 顺序保留 + Hierarchy 展开 levels
 *   I3. dimensionFilter 透传
 *   I4. fields/columns/measureFilters/customElements 全空
 *   I5. rowSorts BASC/BDESC 降级 ASC/DESC
 */
import { describe, expect, it } from 'vitest';

import {
  buildHierarchyRow,
  buildLeafFilter,
  buildValueField,
  buildViewConfig,
  defaultPageState,
} from '../../fixtures/builders.js';
import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildAdhocQuery } from './buildAdhocQuery.js';

describe('buildAdhocQuery', () => {
  it('I1: queryType=DetailQuery,基础形态', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.queryType).toBe('DetailQuery');
    expect(q.modelId).toBe(orderModelMetadata.id);
  });

  it('I2: rows 顺序保留,Hierarchy 自动展开 levels', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince2', type: 'Dimension' },
        buildHierarchyRow({ drillDepth: 2 }),
        { fieldName: 'OrderID2', type: 'Dimension' },
      ],
      values: [buildValueField()],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    // Dimension 字段 + Hierarchy 顶层+次层 + 另一个 Dimension
    expect(q.rows).toEqual(['ShipProvince2', 'ShipProvince2', 'ShipRegion2', 'OrderID2']);
  });

  it('I3: 维度过滤透传到 dimensionFilter', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
      filters: [buildLeafFilter({ field: 'ShipProvince2', value: ['北京'] })],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.dimensionFilter).not.toBeNull();
    expect(JSON.stringify(q.dimensionFilter)).toContain('ShipProvince2');
  });

  it('I4-base: 没拖 measure 进过滤区时 customElements 仍为空(回归保护)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField({ aggregator: 'AVG' })],
      measureFilters: [
        { kind: 'leaf', measureName: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 100 },
      ],
      customFields: [
        {
          id: 'cm1',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '',
          expression: '[销售额]/100',
          ast: null,
        },
      ],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.fields).toEqual([]);
    expect(q.columns).toEqual([]);
    expect(q.measureFilters).toEqual([]);
    expect(q.customElements).toEqual([]);
    // measure / column / customField 状态保留在 viewConfig 但 adhoc query 不带
  });

  it('I5: BASC/BDESC 自动降级到 ASC/DESC', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
      rowSorts: [
        { type: 'ByDimension', fieldName: 'ShipProvince2', direction: 'BASC' },
      ],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.rowSorts).toEqual([
      { _enum: 'DimensionSort', dimension: 'ShipProvince2', direction: 'ASC' },
    ]);
  });

  it('ByMeasure 排序 adhoc 模式下被丢弃(adhoc 无度量轴)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
      rowSorts: [
        { type: 'ByMeasure', measureName: FIELD_IDS.salesMeasure, direction: 'DESC' },
        { type: 'ByDimension', fieldName: 'ShipProvince2', direction: 'ASC' },
      ],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.rowSorts).toHaveLength(1);
    expect(q.rowSorts[0]).toMatchObject({ dimension: 'ShipProvince2' });
  });

  // ============================================================
// adhoc 下 Measure 当原始列过滤(场景 1 — 销售额>500)
// 设计:viewConfig.filters 里塞 measureName 当 leaf.field;build 时:
//   1. 检测 leaf.field 指向 measure → 在 query.customElements push CustomDimension
//      声明一个 synth dim 包装物理 view + column
//   2. 把 leaf.field 替换成 synth dim/level 的 name(__measure_filter_<measureName>)
//   3. translateDimensionFilter 翻译时 emit ByLevel{level: synth name}
// 后端按 customElements 协议 lookup synth dim,找到底层 column 真过滤(probe E 实证)
// ============================================================
  it('优先匹配真 level:metadata.levels 有同 refDataSetFieldId 的 level → 直接用 level.name,不 declare customDim', () => {
    // 临时构造一个 metadata:把 salesMeasure 关联到一个 level(共用 refDataSetFieldId)
    // 模拟"销售额 measure 跟 销售额 level 指向同物理字段"的常见场景
    const sharedFieldId = 'shared-physical-field-id-test';
    const m0 = orderModelMetadata.measures[0]!;
    const lv0 = orderModelMetadata.levels[0]!;
    const md = {
      ...orderModelMetadata,
      measures: [{ ...m0, refDataSetFieldId: sharedFieldId }],
      levels: [
        ...orderModelMetadata.levels,
        { ...lv0, name: '销售额_lv', refDataSetFieldId: sharedFieldId },
      ],
    };
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      filters: [buildLeafFilter({ field: m0.name, operator: 'GreaterThan', value: 500 })],
    });
    const q = buildAdhocQuery(vc, md, defaultPageState);
    // 命中真 level → 不需要 declare customDim
    expect(q.customElements).toEqual([]);
    // dimensionFilter ByLevel 直接引用真 level 的 name
    const dimFilter = q.dimensionFilter as { filter: { _enum: string; level: string } };
    expect(dimFilter.filter._enum).toBe('ByLevel');
    expect(dimFilter.filter.level).toBe('销售额_lv');
  });

  it('measure 拖入 dim filter 区 → query.customElements 多一个 CustomDimension 包装它', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      filters: [buildLeafFilter({ field: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 500 })],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.customElements).toHaveLength(1);
    const ce = q.customElements[0]! as { _enum: string; dimension: { name: string }; levelBindings: Array<{ level: string; column: string; view: string }> };
    expect(ce._enum).toBe('CustomDimension');
    expect(ce.dimension.name).toBe(`__measure_filter_${FIELD_IDS.salesMeasure}`);
    // levelBinding 指向底层物理 view + column
    expect(ce.levelBindings).toHaveLength(1);
    expect(ce.levelBindings[0]!.view).toBe('orders');     // ordersView.name
    expect(ce.levelBindings[0]!.column).toBe('销售额');    // salesMeasure.aliasFromDb
  });

  it('measure 拖入 dim filter → dimensionFilter ByLevel 引用 synth name(不是 measureName)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      filters: [buildLeafFilter({ field: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 500 })],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    const synthName = `__measure_filter_${FIELD_IDS.salesMeasure}`;
    const dimFilter = q.dimensionFilter as { filter: { _enum: string; level?: string } };
    expect(dimFilter.filter._enum).toBe('ByLevel');
    expect(dimFilter.filter.level).toBe(synthName);
    // level 不是裸的 measureName(synth name 会有 __measure_filter_ 前缀)
    expect(dimFilter.filter.level).not.toBe(FIELD_IDS.salesMeasure);
  });

  it('同一 measure 多次拖入 dim filter → 只 declare 一次 customElement(去重)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      filters: [
        // 同一 measure 两个 leaf,不同阈值
        buildLeafFilter({ field: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 500 }),
        buildLeafFilter({ field: FIELD_IDS.salesMeasure, operator: 'LessThan', value: 9999 }),
      ],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.customElements).toHaveLength(1);
  });

  it('AND/OR 嵌套 dim+measure → 树结构保留,measure leaf field 替换成 synth', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      // (ShipProvince2='北京' OR 销售额>500)
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            buildLeafFilter({ field: 'ShipProvince2', value: ['北京'] }),
            buildLeafFilter({ field: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 500 }),
          ],
        },
      ],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.customElements).toHaveLength(1);
    const synthName = `__measure_filter_${FIELD_IDS.salesMeasure}`;
    const payload = JSON.stringify(q.dimensionFilter);
    expect(payload).toContain('"_enum":"Or"');
    expect(payload).toContain('"level":"ShipProvince2"');
    expect(payload).toContain(`"level":"${synthName}"`);
    // measureName 应被替换走
    expect(payload).not.toContain(`"level":"${FIELD_IDS.salesMeasure}"`);
  });

  it('pageSettings:adhoc 关掉 compress / 总计 / 列分页;isCrossTable=true(后端要求才返回所有 row 字段)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    // 2026-05-07:isCrossTable 必须 true,否则多 row 字段时后端只返前 2 列(用户实测)
    expect(q.pageSettings.isCrossTable).toBe(true);
    expect(q.pageSettings.showGrandTotal).toBe(false);
    expect(q.pageSettings.compressEmptyRows).toBe(false);
    expect(q.pageSettings.compressEmptyColumns).toBe(false);
    expect(q.pageSettings.columnPageSize).toBe(1);
  });
});
