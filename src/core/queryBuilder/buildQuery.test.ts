/**
 * QueryBuilder 主入口测试
 *
 * 测试组织（按 p0-dev.md 第 3.1.1 节）：
 *   - minimum valid input：最小有效输入
 *   - validation：必填校验、字段存在性、invariant 保护
 *   - skeleton stubs：P0 不实做的 translator 必须返回 [] 不报错
 *
 * TDD 节奏：每个 it 先写、先 fail，再加最简实现让其通过。
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

import { buildQuery } from './buildQuery.js';

describe('buildQuery', () => {
  describe('minimum valid input', () => {
    it('Hierarchy drillDepth=1 → query.rows=[top level], 度量名加进 columns，fields=[]', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })], // 顶层 only
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      expect(query.modelId).toBe(orderModelMetadata.id);
      expect(query.queryType).toBe('PivotQuery');
      expect(query.rows).toEqual(['ShipProvince2']); // 顶层 level fieldName
      // 度量名追加在 columns 里（默认沿列轴展开）
      expect(query.columns).toEqual([FIELD_IDS.salesMeasure]);
      expect('engineType' in query).toBe(false); // P0 不传给后端
      // P0 fields=[]：后端从 metadata 自动按 name 解析；P1+ 才需要发 DimensionField/MeasureField
      // （quickCalc/aggregator 覆盖/合计小计调整等场景）
      expect(query.fields).toEqual([]);
    });

    it('Hierarchy drillDepth=2 → query.rows = [top, level2], 度量在 columns', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 2 })],
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      expect(query.rows).toEqual(['ShipProvince2', 'ShipRegion2']);
      expect(query.columns).toEqual([FIELD_IDS.salesMeasure]);
      expect(query.fields).toEqual([]);
    });

    it('should set default pageSettings flags', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      expect(query.pageSettings).toMatchObject({
        rowPageNo: 1,
        rowPageSize: 50,
        columnPageNo: 1,
        columnPageSize: 50,
        showGrandTotal: true,
        subTotalAtEnd: true,
        isCrossTable: true,
        useFormat: true,
        useDataType: true,
        useTransform: true,
        compressEmptyRows: true,
      });
    });
  });

  describe('validation', () => {
    it('should throw when no measure in values', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [],
      });

      expect(() => buildQuery(viewConfig, orderModelMetadata, defaultPageState)).toThrow(
        /at least 1 measure/i
      );
    });

    it('should throw when row field not in metadata', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ fieldName: 'unknown_field' })],
        values: [buildValueField()],
      });

      expect(() => buildQuery(viewConfig, orderModelMetadata, defaultPageState)).toThrow(
        /field "unknown_field" not in metadata/i
      );
    });

    it('should throw when measure not in metadata', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField({ measureName: 'fake_measure' })],
      });

      expect(() => buildQuery(viewConfig, orderModelMetadata, defaultPageState)).toThrow(
        /measure "fake_measure" not in metadata/i
      );
    });
  });

  describe('P3+ aggregator override / 多 ValueField 同 measure', () => {
    it('aggregator=AVG → 发 MeasureField; columns ref 用 encoded name(@AGG@AVG)', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField({ aggregator: 'AVG' })],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      // columns ref 是 encoded
      expect(query.columns).toEqual([`${FIELD_IDS.salesMeasure}@AGG@AVG`]);
      // fields 含 1 个 MeasureField,带 aggregator='AVG'
      expect(query.fields).toEqual([
        {
          _enum: 'MeasureField',
          name: `${FIELD_IDS.salesMeasure}@AGG@AVG`,
          measure: FIELD_IDS.salesMeasure,
          aggregator: 'AVG',
        },
      ]);
    });

    it('同 measure 多 ValueField(默认 + AVG)→ columns 各自独立 ref + 1 个 MeasureField(只 AVG)', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [
          buildValueField(), // 默认 aggregator=null
          buildValueField({ aggregator: 'AVG' }),
        ],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      // columns ref:default 用原 measureName,AVG 用 encoded
      expect(query.columns).toEqual([
        FIELD_IDS.salesMeasure,
        `${FIELD_IDS.salesMeasure}@AGG@AVG`,
      ]);
      // 默认 chip 不发 MeasureField;AVG chip 发 MeasureField
      expect(query.fields).toEqual([
        {
          _enum: 'MeasureField',
          name: `${FIELD_IDS.salesMeasure}@AGG@AVG`,
          measure: FIELD_IDS.salesMeasure,
          aggregator: 'AVG',
        },
      ]);
    });

    it('同 measure + aggregator + quickCalc 组合 — 分隔符顺序 @AGG@<A>@QC@<E>', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [
          buildValueField({ aggregator: 'AVG', quickCalc: { _enum: 'RowGlobalPercent' } }),
        ],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      const expectedName = `${FIELD_IDS.salesMeasure}@AGG@AVG@QC@RowGlobalPercent`;
      expect(query.columns).toEqual([expectedName]);
      expect(query.fields).toEqual([
        {
          _enum: 'MeasureField',
          name: expectedName,
          measure: FIELD_IDS.salesMeasure,
          aggregator: 'AVG',
          quickCalc: { _enum: 'RowGlobalPercent' },
        },
      ]);
    });
  });

  describe('P0 skeleton stubs (translators that return [] in P0)', () => {
    it('should return empty filters when viewConfig.filters is empty', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      // hierarchy 完全折叠时，filter 也应该是空（不追加 hierarchy 展开筛选）
      expect(query.filters).toEqual([]);
      expect(query.measureFilters).toEqual([]);
      expect(query.customElements).toEqual([]);
    });
  });

  describe('fixed query metadata', () => {
    it('should always set modelId from metadata', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      expect(query.modelId).toBe(orderModelMetadata.id);
    });

    it('should always set queryType=PivotQuery and not set engineType (let backend default)', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow()],
        values: [buildValueField()],
      });

      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);

      expect(query.queryType).toBe('PivotQuery');
      expect('engineType' in query).toBe(false);
    });
  });

  describe('MEASURE_GROUP_NAME (P3)', () => {
    it('rows 显式含 MeasureGroupName → 度量名插到 query.rows', () => {
      const viewConfig = buildViewConfig({
        rows: [
          buildHierarchyRow({ drillDepth: 1 }),
          { fieldName: '__measure_axis__', type: 'MeasureGroupName' },
        ],
        values: [buildValueField()],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      expect(query.rows).toEqual(['ShipProvince2', FIELD_IDS.salesMeasure]);
      expect(query.columns).toEqual([]);
    });

    it('columns 含 MeasureGroupName 在中间 → 度量名插到该位置', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        columns: [
          { fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' },
          { fieldName: '__measure_axis__', type: 'MeasureGroupName' },
        ],
        values: [buildValueField()],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      expect(query.columns).toEqual([
        FIELD_IDS.cityCalcGroup,
        FIELD_IDS.salesMeasure,
      ]);
    });

    it('无显式 MeasureGroupName → 度量名 append 到 columns 末尾（向后兼容）', () => {
      const viewConfig = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
      });
      const query = buildQuery(viewConfig, orderModelMetadata, defaultPageState);
      expect(query.columns[query.columns.length - 1]).toBe(FIELD_IDS.salesMeasure);
    });
  });

  describe('dimensionFilter (P2 — 维度过滤走 query.dimensionFilter,filters 兼容层置空)', () => {
    it('无 filter → dimensionFilter=null, filters=[]', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.dimensionFilter).toBeNull();
      expect(q.filters).toEqual([]);
    });

    it('单 leaf → dimensionFilter={filter: ByLevel}', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
        filters: [buildLeafFilter({ field: 'ShipProvince2', operator: 'In', value: ['江苏'] })],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.dimensionFilter).toEqual({
        filter: {
          _enum: 'ByLevel',
          level: 'ShipProvince2',
          operator: 'In',
          value: ['江苏'],
        },
      });
      expect(q.filters).toEqual([]); // 兼容层始终空
    });

    it('多个 leaf → dimensionFilter={filter: And(ByLevel, ByLevel)}', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
        filters: [
          buildLeafFilter({ field: 'ShipProvince2', operator: 'In', value: ['江苏'] }),
          buildLeafFilter({ field: 'ShipRegion2', operator: 'Equals', value: '苏南' }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.dimensionFilter).toEqual({
        filter: {
          _enum: 'And',
          left: { _enum: 'ByLevel', level: 'ShipProvince2', operator: 'In', value: ['江苏'] },
          right: { _enum: 'ByLevel', level: 'ShipRegion2', operator: 'Equals', value: '苏南' },
        },
      });
    });

    it('group {Or} → dimensionFilter 内嵌 Or', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
        filters: [
          {
            kind: 'group',
            op: 'Or',
            children: [
              { kind: 'leaf', field: 'ShipProvince2', operator: 'Equals', value: '江苏' },
              { kind: 'leaf', field: 'ShipProvince2', operator: 'Equals', value: '浙江' },
            ],
          },
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.dimensionFilter?.filter._enum).toBe('Or');
    });
  });

  describe('subTotal → DimensionField (P3 小计真生效)', () => {
    it('row 字段无 subTotal → fields[] 不含 DimensionField', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField()],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const dimFields = q.fields.filter((f) => f._enum === 'DimensionField');
      expect(dimFields).toEqual([]);
    });

    it('hierarchy with subTotal=SHOW + drillDepth=2 → 展开 2 个 DimensionField,顶层 SHOW 内层 HIDDEN', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 2, subTotal: 'SHOW' })],
        values: [buildValueField()],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const dimFields = q.fields.filter((f) => f._enum === 'DimensionField');
      expect(dimFields).toHaveLength(2);
      // 顶层 ShipProvince2:subTotal=SHOW
      expect(dimFields[0]).toMatchObject({
        _enum: 'DimensionField',
        name: 'ShipProvince2',
        dimension: FIELD_IDS.shipRegionHierarchy,
        level: 'ShipProvince2',
        subTotal: 'SHOW',
      });
      // 次层 ShipRegion2:subTotal=HIDDEN(避免 hierarchy 内层重复小计)
      expect(dimFields[1]).toMatchObject({
        _enum: 'DimensionField',
        name: 'ShipRegion2',
        subTotal: 'HIDDEN',
      });
    });

    it('subTotal=HIDDEN 显式 → 跟未设一样,不发 DimensionField', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1, subTotal: 'HIDDEN' })],
        values: [buildValueField()],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.fields.filter((f) => f._enum === 'DimensionField')).toEqual([]);
    });

    it('column 字段也走同套规则', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        columns: [{ fieldName: 'ShipProvince2', type: 'Dimension', subTotal: 'SHOW' }],
        values: [buildValueField()],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const dimFields = q.fields.filter((f) => f._enum === 'DimensionField');
      expect(dimFields).toHaveLength(1);
      expect(dimFields[0]).toMatchObject({
        _enum: 'DimensionField',
        name: 'ShipProvince2',
        subTotal: 'SHOW',
      });
    });
  });

  describe('quickCalc field name 后缀 (避免后端列名冲突)', () => {
    it('measure 带 quickCalc → fields[].name 加 @QC@enumName 后缀,measure 字段保留原 measureName', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [
          buildValueField({
            measureName: FIELD_IDS.salesMeasure,
            quickCalc: { _enum: 'SamePeriodValue', dateDimension: 'd', dateLevel: 'l', offset: 1 },
          }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.fields).toHaveLength(1);
      const field = q.fields[0]!;
      // 关键 invariant:name 带后缀,measure 不带 — 这俩字段后端用途不同
      expect(field.name).toBe(`${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`);
      expect((field as { measure: string }).measure).toBe(FIELD_IDS.salesMeasure);
      // 列轴里的 measure name 也跟 fields[].name 一致(否则后端 cellSet 列定义对不上)
      expect(q.columns).toContain(`${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`);
    });

    it('measure 无 quickCalc → name === measureName (回归:不影响普通 measure)', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.fields).toEqual([]);
      expect(q.columns).toContain(FIELD_IDS.salesMeasure);
      expect(q.columns).not.toContain(expect.stringContaining('@QC@'));
    });

    it('rowSorts ByMeasure 引用 quickCalc 列 → sort.measure.name 同样带后缀', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [
          buildValueField({
            measureName: FIELD_IDS.salesMeasure,
            quickCalc: { _enum: 'SamePeriodValue', dateDimension: 'd', dateLevel: 'l', offset: 1 },
          }),
        ],
        rowSorts: [
          { type: 'ByMeasure', measureName: FIELD_IDS.salesMeasure, direction: 'DESC' },
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const sort = q.rowSorts[0] as { measure: { name: string } };
      expect(sort.measure.name).toBe(`${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`);
    });

    it('rowSorts ByMeasure 引用普通(无 quickCalc) measure → sort.measure.name === measureName', () => {
      const vc = buildViewConfig({
        rows: [buildHierarchyRow({ drillDepth: 1 })],
        values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })],
        rowSorts: [
          { type: 'ByMeasure', measureName: FIELD_IDS.salesMeasure, direction: 'DESC' },
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const sort = q.rowSorts[0] as { measure: { name: string } };
      expect(sort.measure.name).toBe(FIELD_IDS.salesMeasure);
    });
  });
});
