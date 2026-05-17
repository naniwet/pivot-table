/**
 * translateCustomElements 测试 (P2)
 *
 * 关键不变量(2026-05-06 用户确认):
 *   I1. calc_measure → 1 个 CustomCalcMeasure
 *   I2. enum_group / range_group → **2 个** customElements:
 *       a) CustomColumn:column.define = EnumGroupColumn / RangeGroupColumn,viewName 从 fieldId 解析
 *       b) CustomDimension:wrap CustomColumn,query.rows/columns 引用 dimension.name(=cf.id)
 *   I3. CustomDimension.levelBindings[0].column = 上面 CustomColumn 的 column.name(`${cf.id}_col`)
 *   I4. viewName 从 baseField 在 metadata 里的 fieldId 解析(模式 `Field-{view}-...`),
 *       fallback 为 baseField 自身
 */
import { describe, expect, it } from 'vitest';

import { orderModelMetadata } from '../../../fixtures/metadata/orderModel.js';
import type { Metadata } from '../../../types/metadata.js';
import type { CustomField } from '../../../types/viewConfig.js';

import { translateCustomElements } from './customElements.js';

describe('translateCustomElements', () => {
  it('I1: empty input → []', () => {
    expect(translateCustomElements([], orderModelMetadata)).toEqual([]);
  });

  // 2026-05-16:editor 用 alias("销售额"是 fixture salesMeasure 的 alias,真 name 是
  // "销售额_1624531356707")— astToMdx 把 alias 翻成后端 measure name;未知 alias
  // (如"成本",fixture 没有)→ fallback 原样,等后端解释 / 报错
  it('I1: calc_measure → CustomCalcMeasure;表达式里 alias 翻成 measure name', () => {
    const cf: CustomField = {
      id: 'cm1',
      name: '利润率',
      kind: 'calc_measure',
      dataFormat: '百分比',
      expression: '[销售额]/[成本]',
      ast: {
        type: 'binop',
        op: '/',
        left: { type: 'field', name: '销售额' },
        right: { type: 'field', name: '成本' },
      },
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      _enum: 'CustomCalcMeasure',
      measure: {
        name: 'cm1', // ← cf.id,query.columns 用这个引用
        alias: '利润率',
        desc: '',
        category: 'Measures',
        dataType: 'DOUBLE',
        dataFormat: '百分比',
        maskRule: '',
        // 销售额 是 alias → 翻成 measure name '销售额_1624531356707';成本 未知 → 原样兜底
        expr: '[Measures].[销售额_1624531356707] / [Measures].[成本]',
      },
    });
  });

  it('calc_measure ast=null → 跳过该 element(老序列化兼容)', () => {
    const cf: CustomField = {
      id: 'cm_old',
      name: '老字段',
      kind: 'calc_measure',
      dataFormat: '',
      expression: '[a]+[b]',
      ast: null,
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    expect(out).toEqual([]);
  });

  it('I2: enum_group → CustomColumn + CustomDimension(2 项)', () => {
    const cf: CustomField = {
      id: 'eg1',
      name: '区域分组',
      kind: 'enum_group',
      baseField: 'ShipProvince2', // orderModel fixture 里的字段
      groups: [
        { label: '沿海', members: ['广东', '福建', '浙江'] },
        { label: '长三角', members: ['江苏', '上海'] },
      ],
      ungroupedHandling: 'show_individually',
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    expect(out).toHaveLength(2);

    // a) CustomColumn — column.name = `${cf.id}_col`,define 是 EnumGroupColumn
    // 字段名以后端 Scala 源码为准:column / groups[name/values] / defaultGroup
    expect(out[0]).toMatchObject({
      _enum: 'CustomColumn',
      column: {
        name: 'eg1_col',
        alias: '区域分组',
        define: {
          _enum: 'EnumGroupColumn',
          column: 'ShipProvince2',
          groups: [
            { name: '沿海', values: ['广东', '福建', '浙江'] },
            { name: '长三角', values: ['江苏', '上海'] },
          ],
          defaultGroup: 'OriginalValue',
        },
      },
    });

    // b) CustomDimension — dimension.name = cf.id(rows/columns 引用这个),
    //    levelBindings 把 dimension.level 指向上面 CustomColumn.column.name
    expect(out[1]).toMatchObject({
      _enum: 'CustomDimension',
      dimension: {
        name: 'eg1', // ← query.rows/columns 引用这个
        alias: '区域分组',
        hasAll: true,
        levels: [{ name: 'eg1', alias: '区域分组' }],
      },
      levelBindings: [
        {
          dimension: 'eg1',
          level: 'eg1',
          column: 'eg1_col', // ← 指向 CustomColumn.column.name
          isCalc: false,
        },
      ],
    });
  });

  it('I2: range_group → CustomColumn + CustomDimension(2 项)', () => {
    const cf: CustomField = {
      id: 'rg1',
      name: '年龄段',
      kind: 'range_group',
      baseField: 'ShipProvince2',
      ranges: [
        { min: null, max: 18, label: '未成年' },
        { min: 18, max: 60, label: '青壮年' },
        { min: 60, max: null, label: '老年' },
      ],
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    expect(out).toHaveLength(2);
    // 字段名以后端 Scala 源码为准:column / groups[name/min/max/includeMin/includeMax] / defaultGroup
    expect(out[0]).toMatchObject({
      _enum: 'CustomColumn',
      column: {
        name: 'rg1_col',
        define: {
          _enum: 'RangeGroupColumn',
          column: 'ShipProvince2',
          groups: [
            { name: '未成年', min: null, max: '18', includeMin: true, includeMax: false },
            { name: '青壮年', min: '18', max: '60', includeMin: true, includeMax: false },
            { name: '老年', min: '60', max: null, includeMin: true, includeMax: false },
          ],
          defaultGroup: 'OriginalValue',
        },
      },
    });
    expect(out[1]).toMatchObject({
      _enum: 'CustomDimension',
      dimension: { name: 'rg1' },
      levelBindings: [{ dimension: 'rg1', level: 'rg1', column: 'rg1_col' }],
    });
  });

  it('I3: CustomColumn 和 CustomDimension 两边 column 名一致(避免 levelBinding 引用不到)', () => {
    const cf: CustomField = {
      id: 'eg2',
      name: '区域',
      kind: 'enum_group',
      baseField: 'ShipProvince2',
      groups: [],
      ungroupedHandling: 'show_individually',
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    const customColumn = out.find((e) => e._enum === 'CustomColumn') as
      | { column: { name: string } }
      | undefined;
    const customDimension = out.find((e) => e._enum === 'CustomDimension') as
      | { levelBindings: Array<{ column: string }> }
      | undefined;
    expect(customColumn?.column.name).toBe(customDimension?.levelBindings[0]!.column);
  });

  it('I4: viewName 从 baseField 在 metadata 里的 fieldId 解析(模式 Field-{view}-...)', () => {
    // 新接口:viewName 通过 levels/measures/fields[].viewId → views[].name 反查。
    //   构造一个新 view + 一个挂在该 view 下的 DataSetField,验证翻译能拿到 view.name='mart_db'。
    const martView = {
      ...orderModelMetadata.views[0]!,
      id: 'view-mart',
      name: 'mart_db',
      aliasFromDb: 'mart_db',
      define: {
        ...orderModelMetadata.views[0]!.define,
        tableId: 'TAB.mart_db.mart_db.null.sales_fact',
        tableName: 'mart_db',
      },
      alias: 'mart_db',
    };
    const theField = {
      ...orderModelMetadata.fields[0]!,
      id: 'AUGMENTED_DATASET_FIELD.modelxxx.Field-mart_db-mart_db-null-sales_fact-the_field',
      name: 'the_field',
      aliasFromDb: '字段',
      alias: '字段',
      viewId: 'view-mart',
    };
    const meta: Metadata = {
      ...orderModelMetadata,
      views: [...orderModelMetadata.views, martView],
      fields: [...orderModelMetadata.fields, theField],
    };
    const cf: CustomField = {
      id: 'eg3',
      name: '分组',
      kind: 'enum_group',
      baseField: 'the_field',
      groups: [],
      ungroupedHandling: 'show_individually',
    };
    const out = translateCustomElements([cf], meta);
    const customColumn = out.find((e) => e._enum === 'CustomColumn') as
      | { viewName: string }
      | undefined;
    expect(customColumn?.viewName).toBe('mart_db');
    // CustomDimension 的 levelBinding.view 也应该一致
    const customDimension = out.find((e) => e._enum === 'CustomDimension') as
      | { levelBindings: Array<{ view: string }> }
      | undefined;
    expect(customDimension?.levelBindings[0]!.view).toBe('mart_db');
  });

  it('I4 fallback:fieldId 不匹配模式 → viewName=baseField(降级)', () => {
    const cf: CustomField = {
      id: 'eg4',
      name: '分组',
      kind: 'enum_group',
      baseField: '__nonexistent_field__',
      groups: [],
      ungroupedHandling: 'show_individually',
    };
    const out = translateCustomElements([cf], orderModelMetadata);
    const customColumn = out.find((e) => e._enum === 'CustomColumn') as
      | { viewName: string }
      | undefined;
    // 字段不在 metadata → fallback 用 baseField 自己
    expect(customColumn?.viewName).toBe('__nonexistent_field__');
  });

  it('多个混合 customField 顺序保留', () => {
    const out = translateCustomElements(
      [
        {
          id: '1',
          name: 'A',
          kind: 'calc_measure',
          dataFormat: '',
          expression: '1',
          ast: { type: 'num', value: 1 },
        },
        {
          id: '2',
          name: 'B',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [],
          ungroupedHandling: 'show_individually',
        },
      ],
      orderModelMetadata,
    );
    // A → CustomCalcMeasure;B → CustomColumn + CustomDimension
    expect(out.map((e) => e._enum)).toEqual([
      'CustomCalcMeasure',
      'CustomColumn',
      'CustomDimension',
    ]);
  });

  // ============================================================
  // calc_column — 行级 CalcColumn + CustomMeasure 包装
  // 2026-05-07 引入第 4 种 customField:跟 calc_measure(MDX 度量级)是 sibling 概念。
  //   - calc_measure(MDX):expr 引用 measure name,语义 SUM(a)/SUM(b)
  //   - calc_column:    expr 引用物理 column name,语义 aggregator(a/b) 行级
  // 后端 schema:probe-calc-column.ts 实测确认 [physical_col]/[physical_col] 接受
  // ============================================================
  describe('calc_column(行级 CalcColumn + 包装 measure)', () => {
    /** 构造一个含两个 same-view 物理列的 metadata fixture */
    function buildMetaWithTwoColumns(): Metadata {
      const VIEW_ID = 'view-sales';
      const VIEW_NAME = 'sales_fact';
      const view = {
        id: VIEW_ID,
        name: VIEW_NAME,
        aliasFromDb: VIEW_NAME,
        descFromDb: '',
        useFromDb: false,
        type: 'BASIC_TABLE',
        storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: VIEW_NAME },
        fields: [],
        parameters: [],
        dataSource: '',
        alias: VIEW_NAME,
        desc: '',
      };
      const fieldA = {
        id: 'F-销售额',
        name: '销售额',
        aliasFromDb: '销售额',
        descFromDb: '销售额',
        useFromDb: false,
        valueType: 'INTEGER' as const,
        dataFormat: '',
        sqlColumnName: '销售额',
        viewId: VIEW_ID,
        viewAlias: null,
        visible: 1 as const,
        maskingRule: '',
        referenceFieldId: 'F-销售额',
        extended: null,
        transformRule: '',
        needExtract: true,
        alias: '销售额',
        desc: '销售额',
      };
      const fieldB = { ...fieldA, id: 'F-数量', name: '数量', aliasFromDb: '数量', sqlColumnName: '数量', referenceFieldId: 'F-数量', alias: '数量', desc: '数量' };
      return {
        ...orderModelMetadata,
        views: [view],
        fields: [fieldA, fieldB],
        measures: [],
        levels: [],
      };
    }

    it('calc_column → emit 2 elements: CustomColumn(CalcColumn) + CustomDimension(镜像 enum_group)', () => {
      const meta = buildMetaWithTwoColumns();
      const cf: CustomField = {
        id: 'cf_unit_price',
        name: '均价',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: '[销售额]/[数量]',
        ast: {
          type: 'binop', op: '/',
          left: { type: 'field', name: '销售额' },
          right: { type: 'field', name: '数量' },
        },
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toHaveLength(2);

      // 1) CustomColumn(define = CalcColumn) — 行级表达式列
      expect(out[0]).toEqual({
        _enum: 'CustomColumn',
        viewName: 'sales_fact',
        column: {
          name: 'cf_unit_price_col',
          alias: '均价',
          desc: '',
          valueType: 'DOUBLE',
          columnType: 'DOUBLE',
          dataFormat: '#,##0.00',
          visible: true,
          maskRules: '',
          define: { _enum: 'CalcColumn', expr: '[销售额] / [数量]' },
        },
      });

      // 2) CustomDimension(同 enum_group/range_group 结构)
      expect(out[1]).toEqual({
        _enum: 'CustomDimension',
        dimension: {
          name: 'cf_unit_price', // ← query.rows/columns 引用这个
          alias: '均价',
          desc: '',
          hasAll: true,
          levels: [
            {
              name: 'cf_unit_price',
              alias: '均价',
              desc: '',
              levelType: { _enum: 'GENERIC' },
              dataFormat: '#,##0.00',
              valueType: 'DOUBLE',
              maskRule: '',
            },
          ],
        },
        levelBindings: [
          {
            dimension: 'cf_unit_price',
            level: 'cf_unit_price',
            view: 'sales_fact',
            column: 'cf_unit_price_col',
            isCalc: false,
          },
        ],
      });
    });

    it('ast=null(老序列化)→ 跳过', () => {
      const meta = buildMetaWithTwoColumns();
      const cf: CustomField = {
        id: 'cf_old', name: '老',
        kind: 'calc_column',
        dataFormat: '', expression: '[销售额]/[数量]',
        ast: null,
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toEqual([]);
    });

    it('跨 view 引用 → 跳过(防御:不同表无 SQL JOIN 上下文)', () => {
      const meta = buildMetaWithTwoColumns();
      meta.fields[1] = { ...meta.fields[1]!, viewId: 'view-other' };
      const cf: CustomField = {
        id: 'cf_x', name: 'X',
        kind: 'calc_column',
        dataFormat: '', expression: '[销售额]/[数量]',
        ast: {
          type: 'binop', op: '/',
          left: { type: 'field', name: '销售额' },
          right: { type: 'field', name: '数量' },
        },
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toEqual([]);
    });

    it('表达式纯字面量(无 column ref)→ 跳过(无法判定 view)', () => {
      const meta = buildMetaWithTwoColumns();
      const cf: CustomField = {
        id: 'cf_lit', name: 'lit',
        kind: 'calc_column',
        dataFormat: '',
        expression: '1+2',
        ast: { type: 'binop', op: '+', left: { type: 'num', value: 1 }, right: { type: 'num', value: 2 } },
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toEqual([]);
    });

    it('column 找不到 → 跳过', () => {
      const meta = buildMetaWithTwoColumns();
      const cf: CustomField = {
        id: 'cf_x', name: 'X',
        kind: 'calc_column',
        dataFormat: '', expression: '[__missing__]/[销售额]',
        ast: {
          type: 'binop', op: '/',
          left: { type: 'field', name: '__missing__' },
          right: { type: 'field', name: '销售额' },
        },
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toEqual([]);
    });

    it('字符串函数 calc_column → expr 保留函数并把引用翻成物理列名,valueType=STRING', () => {
      const meta = buildMetaWithTwoColumns();
      meta.fields[0] = {
        ...meta.fields[0]!,
        id: 'F-product-name',
        name: 'product_name',
        aliasFromDb: '产品名称',
        sqlColumnName: 'product_name',
        referenceFieldId: 'F-product-name',
        alias: '产品名称',
        desc: '产品名称',
      };
      const cf: CustomField = {
        id: 'cf_prefix',
        name: '产品名前缀',
        kind: 'calc_column',
        dataFormat: '通用',
        expression: 'SUBSTRING([产品名称], 1, 3)',
        ast: {
          type: 'strfn',
          fn: 'SUBSTRING',
          args: [
            { type: 'field', name: '产品名称' },
            { type: 'num', value: 1 },
            { type: 'num', value: 3 },
          ],
        },
      };
      const out = translateCustomElements([cf], meta);
      expect(out[0]).toMatchObject({
        _enum: 'CustomColumn',
        column: {
          valueType: 'STRING',
          columnType: 'STRING',
          define: { _enum: 'CalcColumn', expr: 'SUBSTRING([product_name], 1, 3)' },
        },
      });
      expect(out[1]).toMatchObject({
        _enum: 'CustomDimension',
        dimension: {
          levels: [{ valueType: 'STRING' }],
        },
      });
    });

    it('LENGTH 字符串函数 calc_column → valueType=DOUBLE', () => {
      const meta = buildMetaWithTwoColumns();
      const cf: CustomField = {
        id: 'cf_len',
        name: '名称长度',
        kind: 'calc_column',
        dataFormat: '',
        expression: 'LENGTH([销售额])',
        ast: {
          type: 'strfn',
          fn: 'LENGTH',
          args: [{ type: 'field', name: '销售额' }],
        },
      };
      const out = translateCustomElements([cf], meta);
      expect(out[0]).toMatchObject({
        column: {
          valueType: 'DOUBLE',
          columnType: 'DOUBLE',
          define: { _enum: 'CalcColumn', expr: 'LENGTH([销售额])' },
        },
      });
    });
  });

  // ============================================================
  // dim_as_measure(P5 第 5 种 customField)— 维度转度量,1 个 CustomMeasure + measureBinding
  // 2 条 sourceField 路径:
  //   a) 物理列名 → metadata.fields 找 viewId
  //   b) 另一 customField id(calc_column / enum_group / range_group)→ 用 `${id}_col`
  // ============================================================
  describe('dim_as_measure(维度转度量)', () => {
    function buildMetaWithField(): Metadata {
      const VIEW_ID = 'view-orders';
      const VIEW_NAME = 'orders';
      const view = {
        id: VIEW_ID, name: VIEW_NAME, aliasFromDb: VIEW_NAME, descFromDb: '',
        useFromDb: false, type: 'BASIC_TABLE', storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: VIEW_NAME },
        fields: [], parameters: [], dataSource: '', alias: VIEW_NAME, desc: '',
      };
      const field = {
        id: 'F-销售员', name: '销售员', aliasFromDb: '销售员', descFromDb: '销售员',
        useFromDb: false, valueType: 'STRING' as const, dataFormat: '',
        sqlColumnName: '销售员', viewId: VIEW_ID, viewAlias: null,
        visible: 1 as const, maskingRule: '',
        referenceFieldId: 'F-销售员', extended: null, transformRule: '',
        needExtract: true, alias: '销售员', desc: '销售员',
      };
      return {
        ...orderModelMetadata,
        views: [view], fields: [field], measures: [], levels: [],
      };
    }

    it('a) sourceField=物理列 → CustomMeasure 引用该物理列 + view', () => {
      const meta = buildMetaWithField();
      const cf: CustomField = {
        id: 'dam_count_sales',
        name: '销售员(COUNT_DISTINCT)',
        kind: 'dim_as_measure',
        sourceField: '销售员',
        aggregator: 'COUNT_DISTINCT',
        dataFormat: '',
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        _enum: 'CustomMeasure',
        measure: {
          name: 'dam_count_sales', // ← cf.id,query.columns 引用
          alias: '销售员(COUNT_DISTINCT)',
          desc: '',
          category: 'Measures',
          dataType: 'DOUBLE',
          aggregator: 'COUNT_DISTINCT',
          dataFormat: '',
          maskRule: '',
        },
        measureBinding: {
          measure: 'dam_count_sales',
          view: 'orders',
          column: '销售员', // ← 物理列名
        },
      });
    });

    it('b) sourceField=calc_column 的 id → 引用 `${id}_col` 列(场景 6:对均价再求和)', () => {
      // 先建一个 calc_column,再建 dim_as_measure 引用它
      const VIEW_ID = 'view-sales';
      const VIEW_NAME = 'sales_fact';
      const view = {
        id: VIEW_ID, name: VIEW_NAME, aliasFromDb: VIEW_NAME, descFromDb: '',
        useFromDb: false, type: 'BASIC_TABLE', storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: VIEW_NAME },
        fields: [], parameters: [], dataSource: '', alias: VIEW_NAME, desc: '',
      };
      const fieldA = {
        id: 'F-销售额', name: '销售额', aliasFromDb: '销售额', descFromDb: '销售额',
        useFromDb: false, valueType: 'INTEGER' as const, dataFormat: '',
        sqlColumnName: '销售额', viewId: VIEW_ID, viewAlias: null,
        visible: 1 as const, maskingRule: '',
        referenceFieldId: 'F-销售额', extended: null, transformRule: '',
        needExtract: true, alias: '销售额', desc: '销售额',
      };
      const fieldB = { ...fieldA, id: 'F-数量', name: '数量', aliasFromDb: '数量', sqlColumnName: '数量', referenceFieldId: 'F-数量', alias: '数量', desc: '数量' };
      const meta: Metadata = {
        ...orderModelMetadata,
        views: [view],
        fields: [fieldA, fieldB],
        measures: [],
        levels: [],
      };
      const calcCol: CustomField = {
        id: 'cc_avg',
        name: '均价',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: '[销售额]/[数量]',
        ast: {
          type: 'binop', op: '/',
          left: { type: 'field', name: '销售额' },
          right: { type: 'field', name: '数量' },
        },
      };
      const dim2measure: CustomField = {
        id: 'dam_avg_sum',
        name: '均价(SUM)',
        kind: 'dim_as_measure',
        sourceField: 'cc_avg', // ← 引用 calc_column 的 id
        aggregator: 'SUM',
        dataFormat: '',
      };
      const out = translateCustomElements([calcCol, dim2measure], meta);
      // calc_column 产生 2 元素 + dim_as_measure 产生 1 元素 = 3
      expect(out).toHaveLength(3);
      const customMeasure = out.find((e) => e._enum === 'CustomMeasure') as
        | {
            measure: { name: string; aggregator: string };
            measureBinding: { measure: string; view: string; column: string };
          } | undefined;
      expect(customMeasure?.measure.name).toBe('dam_avg_sum');
      expect(customMeasure?.measure.aggregator).toBe('SUM');
      // measureBinding.column 必须 = 'cc_avg_col'(calc_column 翻译产生的列名)
      expect(customMeasure?.measureBinding.column).toBe('cc_avg_col');
      expect(customMeasure?.measureBinding.view).toBe('sales_fact');
    });

    it('source 既不在 fields 也不在 customFields → 跳过(防御)', () => {
      const meta = buildMetaWithField();
      const cf: CustomField = {
        id: 'dam_x', name: 'X',
        kind: 'dim_as_measure',
        sourceField: '__nonexistent__',
        aggregator: 'SUM',
        dataFormat: '',
      };
      const out = translateCustomElements([cf], meta);
      expect(out).toEqual([]);
    });

    it('sourceField=enum_group 的 id → 引用 enum_group 的 _col 列', () => {
      const meta = buildMetaWithField();
      const enumCf: CustomField = {
        id: 'eg_sales_grp',
        name: '销售员分组',
        kind: 'enum_group',
        baseField: '销售员',
        groups: [{ label: '老员工', members: ['张三', '李四'] }],
        ungroupedHandling: 'show_individually',
      };
      const dam: CustomField = {
        id: 'dam_count_grp',
        name: '分组数',
        kind: 'dim_as_measure',
        sourceField: 'eg_sales_grp',
        aggregator: 'COUNT',
        dataFormat: '',
      };
      const out = translateCustomElements([enumCf, dam], meta);
      const cm = out.find((e) => e._enum === 'CustomMeasure') as
        | { measureBinding: { column: string; view: string } } | undefined;
      expect(cm?.measureBinding.column).toBe('eg_sales_grp_col');
    });

    // ===== 新增:source 是 metadata.levels / metadata.measures 的情况 =====
    // 触发场景:用户在字段树右键 level 节点(如"产品类型"/"销售_年")或 measure 节点
    // ("销售额"度量),"作为度量"创建 dim_as_measure。sourceField 是 level/measure 的 name
    // (不在 metadata.fields)。translator 需通过 refDataSetFieldId 反查物理列。

    it('sourceField=level + 有 refDataSetFieldId → 反查到物理列', () => {
      const VIEW_ID = 'view-orders';
      const view = {
        id: VIEW_ID, name: 'orders', aliasFromDb: 'orders', descFromDb: '',
        useFromDb: false, type: 'BASIC_TABLE', storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: 'orders' },
        fields: [], parameters: [], dataSource: '', alias: 'orders', desc: '',
      };
      const physField = {
        id: 'F-ShipProvince', name: 'ShipProvince', aliasFromDb: '省份',
        descFromDb: '', useFromDb: false, valueType: 'STRING' as const, dataFormat: '',
        sqlColumnName: 'ShipProvince', viewId: VIEW_ID, viewAlias: null,
        visible: 0 as const, maskingRule: '',
        referenceFieldId: 'F-ShipProvince', extended: null, transformRule: '',
        needExtract: true, alias: '省份', desc: '',
      };
      const level = {
        id: 'L-Province', name: 'ShipProvince2', aliasFromDb: '省份',
        descFromDb: '省份', useFromDb: false, valueType: 'STRING' as const,
        dataFormat: '', sqlColumnName: 'ShipProvince', viewId: VIEW_ID,
        viewAlias: null, hierName: 'h1', expression: null, dimName: 'd1',
        maskingRule: null, transformRule: null, visible: 1 as const,
        extended: null, levelType: 'LEVEL', refDataSetFieldId: 'F-ShipProvince',
        reportVisible: true, alias: '省份', desc: '',
      };
      const meta: Metadata = {
        ...orderModelMetadata,
        views: [view],
        fields: [physField],
        levels: [level],
        measures: [],
      };
      const cf: CustomField = {
        id: 'dam_prov_count',
        name: '省份(COUNT_DISTINCT)',
        kind: 'dim_as_measure',
        sourceField: 'ShipProvince2', // ← level name
        aggregator: 'COUNT_DISTINCT',
        dataFormat: '',
      };
      const out = translateCustomElements([cf], meta);
      const cm = out.find((e) => e._enum === 'CustomMeasure') as
        | { measureBinding: { column: string; view: string } } | undefined;
      expect(cm).toBeDefined();
      expect(cm?.measureBinding.column).toBe('ShipProvince'); // ← 反查到物理 field name
      expect(cm?.measureBinding.view).toBe('orders');
    });

    it('sourceField=level 但 refDataSetFieldId=null → 兜底 sqlColumnName', () => {
      const VIEW_ID = 'view-x';
      const view = {
        id: VIEW_ID, name: 'tbl', aliasFromDb: 'tbl', descFromDb: '',
        useFromDb: false, type: 'BASIC_TABLE', storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: 'tbl' },
        fields: [], parameters: [], dataSource: '', alias: 'tbl', desc: '',
      };
      const level = {
        id: 'L-x', name: 'YearLevel', aliasFromDb: '年',
        descFromDb: '年', useFromDb: false, valueType: 'INTEGER' as const,
        dataFormat: '', sqlColumnName: 'year_col', viewId: VIEW_ID,
        viewAlias: null, hierName: null, expression: null, dimName: null,
        maskingRule: null, transformRule: null, visible: 1 as const,
        extended: null, levelType: 'LEVEL', refDataSetFieldId: null, // 没 refId
        reportVisible: true, alias: '年', desc: '',
      };
      const meta: Metadata = {
        ...orderModelMetadata,
        views: [view], fields: [], levels: [level], measures: [],
      };
      const cf: CustomField = {
        id: 'dam_y',
        name: 'X',
        kind: 'dim_as_measure',
        sourceField: 'YearLevel',
        aggregator: 'COUNT',
        dataFormat: '',
      };
      const out = translateCustomElements([cf], meta);
      const cm = out.find((e) => e._enum === 'CustomMeasure') as
        | { measureBinding: { column: string } } | undefined;
      expect(cm?.measureBinding.column).toBe('year_col'); // 兜底用 sqlColumnName
    });

    it('sourceField=measure + 有 refDataSetFieldId → 反查到物理列', () => {
      const VIEW_ID = 'view-sales';
      const view = {
        id: VIEW_ID, name: 'sales_fact', aliasFromDb: 'sales_fact', descFromDb: '',
        useFromDb: false, type: 'BASIC_TABLE', storeType: 'DIRECT',
        define: { dbtype: '', dataSource: '', catalog: null, schema: null, tableId: '', tableName: 'sales_fact' },
        fields: [], parameters: [], dataSource: '', alias: 'sales_fact', desc: '',
      };
      const physField = {
        id: 'F-销售额', name: '销售额', aliasFromDb: '销售额',
        descFromDb: '', useFromDb: false, valueType: 'INTEGER' as const, dataFormat: '',
        sqlColumnName: '销售额', viewId: VIEW_ID, viewAlias: null,
        visible: 0 as const, maskingRule: '',
        referenceFieldId: 'F-销售额', extended: null, transformRule: '',
        needExtract: true, alias: '销售额', desc: '',
      };
      const measure = {
        id: 'M-销售额', name: '销售额_m', aliasFromDb: '销售额',
        descFromDb: null, useFromDb: false, valueType: 'INTEGER' as const,
        dataFormat: '', viewId: VIEW_ID, viewAlias: null,
        visible: 1 as const, aggregator: 'sum',
        refDataSetFieldId: 'F-销售额',
        maskingRule: null, transformRule: null, extended: null,
        alias: '销售额', desc: null,
      };
      const meta: Metadata = {
        ...orderModelMetadata,
        views: [view], fields: [physField], levels: [], measures: [measure],
      };
      const cf: CustomField = {
        id: 'dam_avg_sales',
        name: '销售额(AVG)',
        kind: 'dim_as_measure',
        sourceField: '销售额_m', // ← measure name
        aggregator: 'AVG',
        dataFormat: '',
      };
      const out = translateCustomElements([cf], meta);
      const cm = out.find((e) => e._enum === 'CustomMeasure') as
        | { measureBinding: { column: string; view: string } } | undefined;
      expect(cm?.measureBinding.column).toBe('销售额'); // ← 反查物理列
      expect(cm?.measureBinding.view).toBe('sales_fact');
    });
  });
});
