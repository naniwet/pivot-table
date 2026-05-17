/**
 * buildDetailQuery — DrillThrough 钻取明细 query 构造(P3)
 *
 * 不变量:
 *   I1. queryType = 'DetailQuery';columns = []; fields = [];
 *   I2. 度量 member(dimension='Measures')不进 filters(那是当前看哪个度量,不是限定)
 *   I3. 总计行 member(level='(All)')不进 filters
 *   I4. 同 fieldName 多 member 各自 FieldFilter(顶层 filters[] 隐式 AND)
 *   I5. rows 含当前 viewConfig.rows + columns 的所有维度字段(MeasureGroupName 跳过)
 *   I6. pageSettings.rowPageSize 默认 10000(PRD §3.3 上限)
 */
import { describe, expect, it } from 'vitest';

import {
  buildDimensionRow,
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';
import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';
import type { Member } from '../../types/cellSet.js';

import { buildDetailQuery, canViewDetail, DRILL_THROUGH_MAX_ROWS } from './buildDetailQuery.js';

const HIER = FIELD_IDS.shipRegionHierarchy;
const MEASURE = FIELD_IDS.salesMeasure;

function makeMember(o: Partial<Member> & Pick<Member, 'uniqueName' | 'fieldName'>): Member {
  return {
    name: o.uniqueName[o.uniqueName.length - 1] ?? '',
    level: 'ShipProvince2',
    dimension: HIER,
    ...o,
  };
}

describe('buildDetailQuery', () => {
  it('I1: queryType=DetailQuery, columns/fields/sorts 空', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })],
      colMember: [],
    });
    expect(q.queryType).toBe('DetailQuery');
    expect(q.columns).toEqual([]);
    expect(q.fields).toEqual([]);
    expect(q.rowSorts).toEqual([]);
    expect(q.columnSorts).toEqual([]);
    expect(q.dimensionFilter).toBeNull();
    expect(q.measureFilters).toEqual([]);
  });

  it('I2: 度量 member(Measures dimension)→ 不进 filters', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })],
      colMember: [
        // 度量 column tuple — 应被忽略
        {
          name: '销售额',
          uniqueName: ['Measures', MEASURE],
          level: 'MeasuresLevel',
          dimension: 'Measures',
          fieldName: MEASURE,
        },
      ],
    });
    expect(q.filters).toHaveLength(1);
    expect(q.filters[0]).toMatchObject({
      _enum: 'FieldFilter',
      field: 'ShipProvince2',
      filter: { _enum: 'ByValue', operator: 'Equals', value: '江苏' },
    });
  });

  it('I3: 总计行 member(level=(All))→ 不进 filters(否则全过滤掉)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [makeMember({ uniqueName: ['(All)'], fieldName: 'ShipProvince2', level: '(All)' })],
      colMember: [],
    });
    expect(q.filters).toEqual([]);
  });

  it('I4: 多 member(行+列)各自 FieldFilter,顶层 filters 数组', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
      columns: [buildDimensionRow({ fieldName: 'ProductCategory' })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [
        makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' }),
        makeMember({ uniqueName: ['江苏', '苏南'], fieldName: 'ShipRegion2', level: 'ShipRegion2' }),
      ],
      colMember: [
        makeMember({
          uniqueName: ['白色家电'],
          fieldName: 'ProductCategory',
          dimension: 'ProductCategory',
          level: 'ProductCategoryLevel',
        }),
      ],
    });
    expect(q.filters).toHaveLength(3);
    expect(q.filters.map((f) => (f as { field: string }).field)).toEqual([
      'ShipProvince2',
      'ShipRegion2',
      'ProductCategory',
    ]);
  });

  it('rows 包含 viewConfig.values 的普通 Measure(明细每行一个数值)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })], // 普通 Measure
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.rows).toContain(MEASURE);
  });

  it('rows 跳过 CalcMeasure(聚合表达式无单行明细概念)', () => {
    // 注入一个 CALC_MEASURE 节点到 metadata.nodes:
    //   找到 salesMeasure 节点作模板,复制并改 type=CALC_MEASURE,挂在同一个 parent 下
    const calcMeasureName = 'profit_ratio_calc';
    const salesNode = orderModelMetadata.nodes.find(
      (n) => n.name === FIELD_IDS.salesMeasure,
    )!;
    const calcMeasureNode = {
      ...salesNode,
      id: 'cm_xxx',
      name: calcMeasureName,
      alias: '利润率',
      aliasFromDb: '利润率',
      type: 'CALC_MEASURE' as const,
      children: [],
      visible: 1 as const,
    };
    const meta = {
      ...orderModelMetadata,
      nodes: [...orderModelMetadata.nodes, calcMeasureNode],
    };
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }), // 普通 → 带
        buildValueField({ measureName: calcMeasureName }), // CalcMeasure → 跳
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: meta,
      rowMember: [],
      colMember: [],
    });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).not.toContain(calcMeasureName);
  });

  it('单元格右键:colMember 有度量 member 时只用该度量,不带其他度量', () => {
    // 构造第二个普通度量(利润)注入 metadata
    // 需要同时加到 nodes[] 和父节点的 children[] — buildMetadataIndex 从根递归遍历
    const profitMeasureName = 'profit_measure';
    const salesNode = orderModelMetadata.nodes.find(
      (n) => n.name === FIELD_IDS.salesMeasure,
    )!;
    const meta = {
      ...orderModelMetadata,
      nodes: [
        ...orderModelMetadata.nodes,
        {
          ...salesNode,
          id: 'pm_xxx',
          name: profitMeasureName,
          alias: '利润',
          aliasFromDb: '利润',
          type: 'MEASURE' as const,
          parentId: null as unknown as string,
          children: [],
        },
      ],
    };
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: profitMeasureName }),
      ],
    });
    // 右键点了销售额的单元格
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: meta,
      rowMember: [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })],
      colMember: [
        {
          name: '销售额',
          uniqueName: ['Measures', MEASURE],
          level: 'MeasuresLevel',
          dimension: 'Measures',
          fieldName: MEASURE,
        },
      ],
    });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).not.toContain(profitMeasureName);
  });

  it('工具栏明细:rowMember/colMember 为空时带全部普通度量', () => {
    const profitMeasureName = 'profit_measure';
    const salesNode = orderModelMetadata.nodes.find(
      (n) => n.name === FIELD_IDS.salesMeasure,
    )!;
    const meta = {
      ...orderModelMetadata,
      nodes: [
        ...orderModelMetadata.nodes,
        {
          ...salesNode,
          id: 'pm2_xxx',
          name: profitMeasureName,
          alias: '利润',
          aliasFromDb: '利润',
          type: 'MEASURE' as const,
          parentId: null as unknown as string,
          children: [],
        },
      ],
    };
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: profitMeasureName }),
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: meta,
      rowMember: [],
      colMember: [],
    });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).toContain(profitMeasureName);
  });

  it('I5: rows = 当前 viewConfig.rows + columns 字段(展开 hierarchy levels;MeasureGroupName 跳过)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
      columns: [
        buildDimensionRow({ fieldName: 'ProductCategory' }),
        // 度量轴字段应跳过
        { fieldName: 'MeasureName', type: 'MeasureGroupName' as const },
      ],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    // hierarchy drillDepth=2 → 展开 2 个 levels;column dim → 1 个;values 1 个度量
    expect(q.rows).toEqual(['ShipProvince2', 'ShipRegion2', 'ProductCategory', MEASURE]);
  });

  it('明细 rows 只保留原有字段,不带自定义维度字段', () => {
    const vc = buildViewConfig({
      rows: [
        buildHierarchyRow({ fieldName: HIER, drillDepth: 1 }),
        { fieldName: 'cc_unit_price', type: 'Dimension' },
      ],
      columns: [
        buildDimensionRow({ fieldName: 'ProductCategory' }),
        { fieldName: 'eg_region', type: 'EnumGroup' },
      ],
      values: [buildValueField({ measureName: MEASURE })],
      customFields: [
        {
          id: 'cc_unit_price',
          name: '均价',
          kind: 'calc_column',
          dataFormat: '0.00',
          expression: '[销售额]/[数量]',
          ast: null,
        },
        {
          id: 'eg_region',
          name: '自定义区域',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.rows).toEqual(['ShipProvince2', 'ProductCategory', MEASURE]);
  });

  it('I6: pageSettings rowPageSize 默认 10000', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.pageSettings.rowPageSize).toBe(DRILL_THROUGH_MAX_ROWS);
    expect(q.pageSettings.rowPageNo).toBe(1);
  });

  it('maxRows 可覆盖默认上限', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
      maxRows: 500,
    });
    expect(q.pageSettings.rowPageSize).toBe(500);
  });

  it('modelId 来自 metadata', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField({ measureName: MEASURE })],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.modelId).toBe(orderModelMetadata.id);
  });
});

describe('buildDetailQuery — viewConfig.filters → dimensionFilter 联动', () => {
  it('viewConfig.filters 非空 → query.dimensionFilter 含等价 Filter 树', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      filters: [
        {
          kind: 'leaf',
          field: 'ShipProvince2',
          operator: 'In',
          value: ['江苏', '浙江'],
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.dimensionFilter).not.toBeNull();
    // translateDimensionFilter 输出是 Filter 树(ByLevel/ByValue/...),非 FieldFilter
    // 这里只断言非空 + 含目标字段名(具体形态由 translateDimensionFilter.test 详测)
    expect(q.dimensionFilter?.filter._enum).toMatch(/^By/);
  });

  it('viewConfig.filters 里的自定义字段不带到明细 dimensionFilter', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      filters: [
        {
          kind: 'leaf',
          field: 'eg_region',
          operator: 'In',
          value: ['华东'],
        },
        {
          kind: 'leaf',
          field: 'ProductCategory',
          operator: 'In',
          value: ['白色家电'],
        },
      ],
      customFields: [
        {
          id: 'eg_region',
          name: '自定义区域',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.dimensionFilter).toEqual({
      filter: {
        _enum: 'ByLevel',
        level: 'ProductCategory',
        operator: 'In',
        value: ['白色家电'],
      },
    });
  });

  it('viewConfig.filters 只有自定义字段时 → dimensionFilter=null', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      filters: [
        {
          kind: 'leaf',
          field: 'cc_unit_price',
          operator: 'GreaterThan',
          value: 10,
        },
      ],
      customFields: [
        {
          id: 'cc_unit_price',
          name: '均价',
          kind: 'calc_column',
          dataFormat: '0.00',
          expression: '[销售额]/[数量]',
          ast: null,
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.dimensionFilter).toBeNull();
  });

  it('viewConfig.filters 为空 → query.dimensionFilter=null', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      filters: [],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.dimensionFilter).toBeNull();
  });

  it('单元格右键场景:cellFilters(query.filters) + dimensionFilter 同时发,后端 AND', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      filters: [
        {
          kind: 'leaf',
          field: 'ProductCategory',
          operator: 'In',
          value: ['白色家电'],
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })],
      colMember: [],
    });
    // cellFilters 走 query.filters
    expect(q.filters).toHaveLength(1);
    expect(q.filters[0]).toMatchObject({
      _enum: 'FieldFilter',
      field: 'ShipProvince2',
      filter: { _enum: 'ByValue', operator: 'Equals', value: '江苏' },
    });
    // dimensionFilter 也带过去(用户 FilterPanel 里设的)
    expect(q.dimensionFilter).not.toBeNull();
    expect(q.dimensionFilter?.filter._enum).toMatch(/^By/);
  });

  it('单元格右键场景:自定义字段 member 不进 cellFilters,原有字段 member 保留', () => {
    const vc = buildViewConfig({
      rows: [
        buildHierarchyRow({ fieldName: HIER, drillDepth: 1 }),
        { fieldName: 'cc_unit_price', type: 'Dimension' },
      ],
      values: [buildValueField({ measureName: MEASURE })],
      customFields: [
        {
          id: 'cc_unit_price',
          name: '均价',
          kind: 'calc_column',
          dataFormat: '0.00',
          expression: '[销售额]/[数量]',
          ast: null,
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [
        makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' }),
        makeMember({
          uniqueName: ['10-20'],
          fieldName: 'cc_unit_price',
          dimension: 'cc_unit_price',
          level: 'cc_unit_price_level',
        }),
      ],
      colMember: [],
    });
    expect(q.filters).toHaveLength(1);
    expect(q.filters[0]).toMatchObject({
      _enum: 'FieldFilter',
      field: 'ShipProvince2',
      filter: { _enum: 'ByValue', operator: 'Equals', value: '江苏' },
    });
  });

  it('measureFilters 始终为 [](DetailQuery 无聚合)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      measureFilters: [
        {
          measureName: MEASURE,
          operator: 'GreaterThan',
          value: 1000,
        },
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      rowMember: [],
      colMember: [],
    });
    expect(q.measureFilters).toEqual([]);
  });
});

describe('canViewDetail', () => {
  it('viewConfig 无自建字段 → true', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
    });
    expect(canViewDetail(vc)).toBe(true);
  });

  it('viewConfig 含未使用的自建字段 → true(普通单元格仍可查看明细)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
      customFields: [
        {
          id: 'cm_unused',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '0.00%',
          expression: '[a]/[b]',
          ast: null,
        },
      ],
    });
    expect(canViewDetail(vc)).toBe(true);
  });

  it('当前 values 用到 calc_measure 自建字段 → true(是否显示菜单交给 cell 级判断)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField({ measureName: 'cm_x' })],
      customFields: [
        {
          id: 'cm_x',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '0.00%',
          expression: '[a]/[b]',
          ast: null,
        },
      ],
    });
    expect(canViewDetail(vc)).toBe(true);
  });

  it('当前 rows 用到 enum_group / range_group → true(普通度量 cell 仍可查看明细)', () => {
    const enumVc = buildViewConfig({
      rows: [{ fieldName: 'eg_x', type: 'EnumGroup' }],
      values: [buildValueField()],
      customFields: [
        {
          id: 'eg_x',
          name: '区域',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    expect(canViewDetail(enumVc)).toBe(true);
  });
});

describe('buildDetailQuery — P5+ 单 cell drill-through 只带 cell 对应 measure', () => {
  // 注入第二个 MEASURE 节点(fixture 只有 1 个);复用 salesMeasure 模板改 name/alias
  // 关键:`parentId: null` 让它当 root,buildMetadataIndex 的树 walk 能直接索引到
  // (否则放在 metadata.nodes 数组里但没在任何 parent.children 里 → walk 不到)
  const otherMeasure = 'cost_measure_for_test';
  const salesNode = orderModelMetadata.nodes.find((n) => n.name === MEASURE)!;
  const otherMeasureNode = {
    ...salesNode,
    id: 'mm_cost',
    name: otherMeasure,
    alias: '销售成本',
    aliasFromDb: '销售成本',
    type: 'MEASURE' as const,
    parentId: null,
    children: [],
    visible: 1 as const,
  };
  const meta = {
    ...orderModelMetadata,
    nodes: [...orderModelMetadata.nodes, otherMeasureNode],
  };

  it('单 cell colMember 含 Measure → rows 里只带该 measure(忽略其他)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: otherMeasure }),
      ],
    });
    const rowMember: Member[] = [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })];
    const colMember: Member[] = [
      {
        name: '销售额',
        uniqueName: ['Measures', MEASURE],
        level: 'MeasuresLevel',
        dimension: 'Measures',
        fieldName: MEASURE,
      },
    ];
    const q = buildDetailQuery({ viewConfig: vc, metadata: meta, rowMember, colMember });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).not.toContain(otherMeasure);
  });

  it('cell 含 Measure(encoded @AGG@AVG 后缀)→ 仍按 base measureName 匹配', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: otherMeasure }),
      ],
    });
    const rowMember: Member[] = [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })];
    const colMember: Member[] = [
      {
        name: '销售额(平均值)',
        uniqueName: ['Measures', `${MEASURE}@AGG@AVG`],
        level: 'MeasuresLevel',
        dimension: 'Measures',
        fieldName: `${MEASURE}@AGG@AVG`,
      },
    ];
    const q = buildDetailQuery({ viewConfig: vc, metadata: meta, rowMember, colMember });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).not.toContain(otherMeasure);
  });

  it('Toolbar 明细按钮场景(rowMember/colMember=[])→ 退化为带所有 measures(向后兼容)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: otherMeasure }),
      ],
    });
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: meta,
      rowMember: [],
      colMember: [],
    });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).toContain(otherMeasure);
  });

  it('cell colMember 无 Measure member(纯维度 cell)→ 退化为带所有 measures', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: otherMeasure }),
      ],
    });
    const rowMember: Member[] = [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })];
    const colMember: Member[] = []; // 无 Measures member
    const q = buildDetailQuery({ viewConfig: vc, metadata: meta, rowMember, colMember });
    expect(q.rows).toContain(MEASURE);
    expect(q.rows).toContain(otherMeasure);
  });

  it('同 measureName 多 agg(SUM+AVG)cell 点 SUM → rows 仍只有一个 measureName(去重)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [
        buildValueField({ measureName: MEASURE }),
        buildValueField({ measureName: MEASURE, aggregator: 'AVG' }),
      ],
    });
    const colMember: Member[] = [
      {
        name: '销售额',
        uniqueName: ['Measures', MEASURE],
        level: 'MeasuresLevel',
        dimension: 'Measures',
        fieldName: MEASURE,
      },
    ];
    const q = buildDetailQuery({
      viewConfig: vc,
      metadata: meta,
      rowMember: [makeMember({ uniqueName: ['江苏'], fieldName: 'ShipProvince2' })],
      colMember,
    });
    expect(q.rows.filter((r) => r === MEASURE)).toHaveLength(1);
  });
});
