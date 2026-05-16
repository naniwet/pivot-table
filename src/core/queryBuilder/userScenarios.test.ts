/**
 * user-scenarios.test — 用户业务场景作回归测试用例
 *
 * 9 条业务场景(用户原话)→ viewConfig → query 翻译正确性。
 * 这是「intent → query」层的 contract test:UI 操作可能变,但同一 viewConfig
 * 应该永远翻译成同一 query。覆盖 buildQuery + customElements + 翻译器 链路。
 *
 * 跟 buildQuery.test 的区别:那边是单元(每个 translator 独立);这边是端到端
 * (多 translator 协作 + customField 闭环 + tree state 等)。
 *
 * 已知限制:
 *   - 场景 6"对 calc_measure 再聚合" — 2026-05-07 通过 mode='column' 行级 CalcColumn
 *     + 包装 measure 实现(probe-calc-final.ts case 4/5 实测 PASS);
 *     mode='mdx'(默认)是 SUM(a)/SUM(b)post-aggregate,不可再聚合;
 *     mode='column' 是 a/b 行级然后 SUM/AVG 包装,可再聚合。
 *   - 场景 8"top-N" — 严格 Top-N filter 后端 schema 未联调,当前以"排序+分页"
 *     近似;本测试验排序 + pageSize 落在 query 里。
 */
import { describe, expect, it } from 'vitest';

import { parseExpression } from '../expression/parseExpression.js';
import {
  buildHierarchyRow,
  buildLeafFilter,
  buildValueField,
  buildViewConfig,
  defaultPageState,
} from '../../fixtures/builders.js';
import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildQuery } from './buildQuery.js';
import { buildAdhocQuery } from './buildAdhocQuery.js';
import { buildBranchQuery, pathKey } from '../tree/buildBranchQuery.js';
import { buildTreeRows } from '../tree/buildTreeRows.js';

const SALES = FIELD_IDS.salesMeasure;
const HIER = FIELD_IDS.shipRegionHierarchy;
const PROVINCE = FIELD_IDS.provinceLevel;
const REGION = FIELD_IDS.regionLevel;

describe('用户业务场景:翻译正确性回归', () => {
  // ============================================================
  // 场景 1:产品类别 × (销售额 SUM + 销售额 AVG)+ 合计
  // ============================================================
  it('场景 1:同 measure 多 aggregator 共存 + 总计', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: PROVINCE, type: 'Dimension' }], // 用 ShipProvince 代替"产品类别"(fixture 无产品)
      values: [
        buildValueField({ measureName: SALES }),                    // 默认(SUM)
        buildValueField({ measureName: SALES, aggregator: 'AVG' }),  // 显式 AVG
      ],
      pageState: { ...defaultPageState, showGrandTotal: true },
    });
    const q = buildQuery(vc, orderModelMetadata, vc.pageState);
    // columns 含 base 名 + encoded AVG 名(同 measure 两个独立列)
    expect(q.columns).toEqual([SALES, `${SALES}@AGG@AVG`]);
    // 只有 AVG override 那个发 MeasureField
    expect(q.fields).toEqual([
      {
        _enum: 'MeasureField',
        name: `${SALES}@AGG@AVG`,
        measure: SALES,
        aggregator: 'AVG',
      },
    ]);
    expect(q.pageSettings.showGrandTotal).toBe(true);
  });

  // ============================================================
  // 场景 2:行=区域,列=日期(年/季度 hierarchy),值=销售额 + 计数
  // ============================================================
  it('场景 2:cross-table 多 dim 多 measure(fixture 用 sales 当 sum + 用 distinct count 模拟订单数)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: REGION, type: 'Dimension' }],
      columns: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })], // hierarchy 当列轴 2 level
      values: [
        buildValueField({ measureName: SALES }),                       // 销售额 SUM
        buildValueField({ measureName: SALES, aggregator: 'COUNT' }),  // 计数(同 measure 不同 agg 模拟"订单数量")
      ],
    });
    const q = buildQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.rows).toEqual([REGION]);
    // hierarchy 自动展开 2 levels + 度量名追加列轴尾(measureAxis)
    expect(q.columns).toContain(PROVINCE);
    expect(q.columns).toContain(REGION);
    expect(q.columns).toContain(SALES);
    expect(q.columns).toContain(`${SALES}@AGG@COUNT`);
  });

  // ============================================================
  // 场景 3:行+列都是 hierarchy(完整层级交叉)
  // ============================================================
  it('场景 3:Hierarchy 行 + Hierarchy 列(双 drill,fixture 仅一个 hierarchy 复用)', () => {
    // fixture 只有 1 个 hierarchy(ShipRegion);用同一个 hierarchy 跑双向只是验证翻译,
    // 现实里两边 hierarchy 应该不同 — 翻译不变
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
      columns: [buildHierarchyRow({ fieldName: HIER, drillDepth: 3 })],
      values: [buildValueField({ measureName: SALES })],
    });
    const q = buildQuery(vc, orderModelMetadata, defaultPageState);
    // rows 展开 2 levels
    expect(q.rows).toEqual([PROVINCE, REGION]);
    // columns 展开 3 levels(全部)+ measure 名
    expect(q.columns.slice(0, 3)).toEqual([PROVINCE, REGION, FIELD_IDS.cityLevel]);
    expect(q.columns).toContain(SALES);
  });

  // ============================================================
  // 场景 6:calc_measure 创建 + 拖到值区
  // 6a: mode='mdx'(默认)— SUM(a)/SUM(b),适合"比率=销售额/成本"
  // 6b: mode='column' — a/b 行级 + SUM/AVG 包装,适合"均价=销售额/数量,再求和/平均"
  // ============================================================
  it('场景 6a:calc_measure(MDX 度量)→ CustomCalcMeasure(表达式引用 measure name)', () => {
    const cfId = 'cf_unit_price';
    const vc = buildViewConfig({
      rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
      values: [buildValueField({ measureName: cfId })],
      customFields: [{
        id: cfId,
        name: '均价',
        kind: 'calc_measure',
        dataFormat: '#,##0.00',
        expression: `[${SALES}]/[${SALES}]`, // 占位:fixture 无第二个 measure
        ast: parseExpression(`[${SALES}]/[${SALES}]`),
      }],
    });
    const q = buildQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.columns).toContain(cfId);
    // customElements 含 CustomCalcMeasure,name=cf.id,alias=cf.name,expr=MDX
    const calcEl = q.customElements.find(
      (e) => '_enum' in e && e._enum === 'CustomCalcMeasure',
    ) as { _enum: string; measure: { name: string; alias: string; expr: string } } | undefined;
    expect(calcEl).toBeDefined();
    expect(calcEl?.measure.name).toBe(cfId);
    expect(calcEl?.measure.alias).toBe('均价');
    expect(calcEl?.measure.expr).toContain('[Measures]'); // MDX 形态
  });

  it('场景 6b:calc_column(行级计算列 → 维度,跟 enum_group/range_group 同结构)', () => {
    // calc_column 表达式引用 **物理列名**,不是 measure name(probe 实测后端要求)
    // calc_column 产出的是 *维度*(CustomDimension),不是 measure;
    // 想"对均价再求和/平均" → 走"维度转度量"独立机制(后续单独 PR)。
    // fixture:cityCalcGroup 字段(name="城市分组")在 fields[]
    const cfId = 'cf_unit_price_col';
    const vc = buildViewConfig({
      rows: [
        { fieldName: PROVINCE, type: 'Dimension' },
        { fieldName: cfId, type: 'Dimension' }, // ← calc_column 拖在 row 区
      ],
      values: [buildValueField({ measureName: SALES })],
      customFields: [{
        id: cfId,
        name: '均价',
        kind: 'calc_column',
        dataFormat: '#,##0.00',
        expression: '[城市分组]/[城市分组]',
        ast: parseExpression('[城市分组]/[城市分组]'),
      }],
    });
    const q = buildQuery(vc, orderModelMetadata, defaultPageState);
    // calc_column 的 cf.id 出现在 query.rows(作维度用)
    expect(q.rows).toContain(cfId);
    // customElements 含 CustomColumn(CalcColumn) + CustomDimension 双元素
    const customColumn = q.customElements.find(
      (e) => '_enum' in e && e._enum === 'CustomColumn',
    ) as { column: { define: { _enum: string } } } | undefined;
    const customDimension = q.customElements.find(
      (e) => '_enum' in e && e._enum === 'CustomDimension',
    );
    expect(customColumn?.column.define._enum).toBe('CalcColumn');
    expect(customDimension).toBeDefined();
    // CustomMeasure 不应该出现(calc_column 不内置 measure 包装,要靠"维度转度量")
    expect(q.customElements.find((e) => '_enum' in e && e._enum === 'CustomMeasure')).toBeUndefined();
  });

  // ============================================================
  // 场景 7:行 hierarchy + per-region 小计 + 总计
  // ============================================================
  it('场景 7:per-field subTotal=SHOW + showGrandTotal', () => {
    const vc = buildViewConfig({
      rows: [
        // hierarchy 展开 2 level + 第 1 level(REGION 等价位)显示小计
        // 注意:fixture hierarchy 顶层 = PROVINCE,subTotal 设到顶层
        { ...buildHierarchyRow({ fieldName: HIER, drillDepth: 2 }), subTotal: 'SHOW' },
      ],
      values: [buildValueField({ measureName: SALES })],
      pageState: { ...defaultPageState, showGrandTotal: true },
    });
    const q = buildQuery(vc, orderModelMetadata, vc.pageState);
    // fields[] 含 DimensionField(顶 level 设 subTotal=SHOW)
    const dimField = q.fields.find(
      (f) => '_enum' in f && f._enum === 'DimensionField',
    ) as { _enum: string; name: string; subTotal: string } | undefined;
    expect(dimField?.subTotal).toBe('SHOW');
    expect(q.pageSettings.showGrandTotal).toBe(true);
  });

  // ============================================================
  // 场景 8:近似 Top-N(排序 DESC + 分页 5)
  // ============================================================
  it('场景 8:Top-N 近似 — sort DESC + pageSize=5', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
      values: [buildValueField({ measureName: SALES })],
      rowSorts: [{ type: 'ByMeasure', measureName: SALES, direction: 'DESC' }],
      pageState: { ...defaultPageState, rowPageSize: 5 },
    });
    const q = buildQuery(vc, orderModelMetadata, vc.pageState);
    // 排序在 query.rowSorts;分页限 5
    expect(q.rowSorts.length).toBe(1);
    expect(q.pageSettings.rowPageSize).toBe(5);
    // ⚠️ 严格 Top-N 需后端 Filter.Top 算子,当前未支持;这里只验近似
  });

  // ============================================================
  // 场景 9:空值显示文本
  // ============================================================
  it('场景 9:emptyValueText 配置 — 单纯 viewConfig 字段,不影响 query 但影响渲染', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
      values: [buildValueField({ measureName: SALES })],
      pageState: { ...defaultPageState, emptyValueText: '-' },
    });
    expect(vc.pageState.emptyValueText).toBe('-');
    // 渲染层(PivotRenderer / DetailRenderer / TreeRenderer)读 viewConfig.pageState.emptyValueText
    // 替换 cell.isEmpty 时的显示;不进 query
    const q = buildQuery(vc, orderModelMetadata, vc.pageState);
    // 不在 query 里(发的是后端 pageSettings 子集)
    expect(JSON.stringify(q.pageSettings)).not.toContain('emptyValueText');
  });

  // ============================================================
  // 场景 10:复合过滤 — 维度 AND 维度 + 度量
  // ============================================================
  it('场景 10:维度过滤(年=2024 AND 区域=华南) + 度量过滤(销量>1000)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
      values: [buildValueField({ measureName: SALES })],
      filters: [
        buildLeafFilter({ field: PROVINCE, value: ['华南'], operator: 'In' }),
        // fixture 没年份字段,用第二个维度过滤模拟"AND 多维"
        buildLeafFilter({ field: REGION, value: ['华南区域'], operator: 'In' }),
      ],
      measureFilters: [
        { kind: 'leaf', measureName: SALES, operator: 'GreaterThan', value: 1000 },
      ],
    });
    const q = buildQuery(vc, orderModelMetadata, defaultPageState);
    // dimensionFilter 树形含两个 leaf
    expect(q.dimensionFilter).not.toBeNull();
    const dfStr = JSON.stringify(q.dimensionFilter);
    expect(dfStr).toContain(PROVINCE);
    expect(dfStr).toContain(REGION);
    // measureFilters 也翻译进去
    expect(q.measureFilters.length).toBeGreaterThan(0);
    const mfStr = JSON.stringify(q.measureFilters);
    expect(mfStr).toContain(SALES);
    expect(mfStr).toContain('GreaterThan');
  });

  // ============================================================
  // 场景 11:树状模式 + per-branch 展开
  // ============================================================
  describe('场景 11:树状模式 — 部分展开', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: REGION, type: 'Dimension' },
        { fieldName: PROVINCE, type: 'Dimension' },
        { fieldName: FIELD_IDS.cityLevel, type: 'Dimension' },
      ],
      values: [buildValueField({ measureName: SALES })],
      queryMode: 'pivot', // tree 模式渲染但 query 走 buildBranchQuery
    });

    it('11a: root branch query — 仅顶层 dim(透视模式 PivotQuery)', () => {
      const q = buildBranchQuery({ viewConfig: vc, metadata: orderModelMetadata, parentPath: [] });
      // tree 模式每个 branch 是 sub-pivot,走 PivotQuery(有度量聚合)
      expect(q.queryType).toBe('PivotQuery');
      expect(q.rows).toEqual([REGION]); // 只第一层
    });

    it('11b: 展开"华南"分支 — query 加 dimensionFilter Region=华南', () => {
      const q = buildBranchQuery({
        viewConfig: vc,
        metadata: orderModelMetadata,
        parentPath: ['华南'],
      });
      expect(q.rows).toEqual([PROVINCE]); // 第二层
      const dfStr = JSON.stringify(q.dimensionFilter);
      expect(dfStr).toContain(REGION);
      expect(dfStr).toContain('华南');
    });

    it('11c: buildTreeRows 模拟"仅展开华南" UI 序列', () => {
      // 假设 root branch 已经返回 3 个区域;华南被 expanded(branch cache 命中)
      const mkBranch = (rowsData: Array<[string, string[]]>) => ({
        status: 'success' as const,
        rows: rowsData.map(([name, fullPath]) => ({
          member: { name } as never,
          fullPath,
          cells: [],
        })),
        columnHeader: [],
        cellSet: {} as never,
        renderModel: {
          rowHeader: [],
          columnHeader: [],
          matrix: [],
          grandTotalRow: null,
          columnMeta: [],
          pagination: { totalRowCount: rowsData.length },
        },
      });
      const branches = new Map([
        [pathKey([]), mkBranch([['华南', ['华南']], ['华北', ['华北']], ['华东', ['华东']]])],
        [pathKey(['华南']), mkBranch([['广东', ['华南', '广东']], ['福建', ['华南', '福建']]])],
      ]);
      const items = buildTreeRows({
        branches,
        expanded: new Set([pathKey(['华南'])]),
        maxDepth: 3,
      });
      // 期望:华南(expanded) + 华南>广东 + 华南>福建 + 华北 + 华东
      const labels = items.map((i) =>
        i.kind === 'row' ? `row:${i.row.member.name}` : `ph:${i.state}`,
      );
      expect(labels).toEqual(['row:华南', 'row:广东', 'row:福建', 'row:华北', 'row:华东']);
      // 华南 row 应标 expanded
      const huananRow = items.find((i) => i.kind === 'row' && i.row.member.name === '华南');
      expect(huananRow?.kind === 'row' && huananRow.expanded).toBe(true);
    });
  });

  // ============================================================
  // 场景 11':即席查询(用户场景里没单列,但跟 11 互补)
  // ============================================================
  it('场景 11′:adhoc 模式 — 直接看明细行(无聚合)', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: REGION, type: 'Dimension' },
        { fieldName: PROVINCE, type: 'Dimension' },
      ],
      values: [], // adhoc 不需要 value
      queryMode: 'adhoc',
    });
    const q = buildAdhocQuery(vc, orderModelMetadata, defaultPageState);
    expect(q.queryType).toBe('DetailQuery');
    expect(q.rows).toEqual([REGION, PROVINCE]);
    expect(q.fields).toEqual([]);
    expect(q.measureFilters).toEqual([]);
  });

  // ============================================================
  // 用户 9 业务场景补充 (G1–G9)
  // ============================================================
  describe('用户业务场景:9 场景回归', () => {
    // ─── G4: "华东或华南区域里面的省份，同时销售额必须大于5万" ───
    it('G4: OR 维度筛选(华东 OR 华南) + 度量筛选(销售额>50000)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        filters: [
          {
            kind: 'group',
            op: 'Or',
            children: [
              buildLeafFilter({ field: PROVINCE, value: ['华东'], operator: 'In' }),
              buildLeafFilter({ field: PROVINCE, value: ['华南'], operator: 'In' }),
            ],
          },
        ],
        measureFilters: [
          { kind: 'leaf', measureName: SALES, operator: 'GreaterThan', value: 50000 },
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      // dimensionFilter 应包含 Or 树形结构
      expect(q.dimensionFilter).not.toBeNull();
      const dimStr = JSON.stringify(q.dimensionFilter);
      expect(dimStr).toContain('Or');
      expect(dimStr).toContain('华东');
      expect(dimStr).toContain('华南');
      // measureFilter 应包含 GreaterThan 50000
      expect(q.measureFilters.length).toBeGreaterThan(0);
      const mfStr = JSON.stringify(q.measureFilters);
      expect(mfStr).toContain('GreaterThan');
      expect(mfStr).toContain('50000');
    });

    // ─── G5: "所有省份的排名和占比 + 省在所属区域内的排名和占比" ───
    it('G5a: 全局排名 + 行占比(RowGlobalRank + RowGlobalPercent)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [
          buildValueField({ measureName: SALES }),
          buildValueField({ measureName: SALES, quickCalc: { _enum: 'RowGlobalRankDescending' } }),
          buildValueField({ measureName: SALES, quickCalc: { _enum: 'RowGlobalPercent' } }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      const colNames = q.columns as string[];
      // raw measure 列 + 两个 @QC@ 列
      expect(colNames).toContain(SALES);
      expect(colNames).toContain(`${SALES}@QC@RowGlobalRankDescending`);
      expect(colNames).toContain(`${SALES}@QC@RowGlobalPercent`);
      // raw measure(无 aggregator 无 QC→ MeasureField 不必要)+ 2 QC 列
      const mfFields = q.fields.filter((f: any) => f._enum === 'MeasureField');
      expect(mfFields).toHaveLength(2); // 只有 2 个 QC 需要 MeasureField
    });

    it('G5b: 全局排名降序 + 占总计百分比(TotalPercent)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [
          buildValueField({ measureName: SALES, quickCalc: { _enum: 'GlobalRankDescending' } }),
          buildValueField({ measureName: SALES, quickCalc: { _enum: 'TotalPercent' } }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      // 两个 quick calc 列(无 raw measure)
      expect(q.columns).toEqual([
        `${SALES}@QC@GlobalRankDescending`,
        `${SALES}@QC@TotalPercent`,
      ]);
      // fields 含 quickCalc
      expect(q.fields).toHaveLength(2);
      const serialized = JSON.stringify(q.fields);
      expect(serialized).toContain('GlobalRankDescending');
    });

    // G5 补充:占分组 % — 用裸字符串 'GroupPercent'(2026-05-16 真实接口验证 ✓)
    // 实测带 basic 的 RowGroupPercent 后端转译路径有 bug 不计算
    it('G5c: 占分组 % (GroupPercent 裸字符串 — 即"省在所属区域内的占比")', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [
          buildValueField({ measureName: SALES, quickCalc: 'GroupPercent' }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.columns).toEqual([`${SALES}@QC@GroupPercent`]);
      expect((q.fields[0] as any).quickCalc).toBe('GroupPercent');
    });

    // G5 补充:分组排名 — 用裸字符串(2026-05-16 真实接口验证 ✓)
    // 实测 RowGroupRank+sort 对象形式 → 后端转译 DataDimensionRank fields:[] 不计算
    it('G5d: 分组排名降序 (GroupRankDescending 裸字符串)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [
          buildValueField({ measureName: SALES, quickCalc: 'GroupRankDescending' }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.columns).toEqual([`${SALES}@QC@GroupRankDescending`]);
      expect((q.fields[0] as any).quickCalc).toBe('GroupRankDescending');
    });

    it('G5e: 分组排名升序 (GroupRankAscending 裸字符串)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [
          buildValueField({ measureName: SALES, quickCalc: 'GroupRankAscending' }),
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.columns).toEqual([`${SALES}@QC@GroupRankAscending`]);
    });

    // ─── G7: "度量排序 + 字符串排序" ───
    it('G7a: 度量排序 — 销售额降序', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        rowSorts: [{ type: 'ByMeasure', measureName: SALES, direction: 'DESC' }],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.rowSorts).toHaveLength(1);
      const sortStr = JSON.stringify(q.rowSorts[0]);
      expect(sortStr).toContain('DESC');
      expect(sortStr).toContain(SALES);
    });

    it('G7b: 维度排序 — 省份升序(ByDimension ASC)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        rowSorts: [{ type: 'ByDimension', fieldName: PROVINCE, direction: 'ASC' }],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.rowSorts).toHaveLength(1);
      const sortStr = JSON.stringify(q.rowSorts[0]);
      expect(sortStr).toContain('ASC');
      expect(sortStr).toContain(PROVINCE);
    });

    // G7 补充:自定义顺序(ByCustomCaption)→ 后端 DimensionSortBy.ByCustomCaption
    it('G7c: 自定义排序 — 省份按指定顺序排列(华南→华北→华东)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        rowSorts: [
          { type: 'ByCustomCaption', fieldName: PROVINCE, direction: 'ASC', customCaption: ['华南', '华北', '华东'] },
        ],
      });
      const q = buildQuery(vc, orderModelMetadata, defaultPageState);
      expect(q.rowSorts).toHaveLength(1);
      const sort = q.rowSorts[0]!;
      expect(sort._enum).toBe('DimensionSort');
      expect((sort as any).dimension).toBe(PROVINCE);
      expect((sort as any).sortBy).toEqual({
        _enum: 'ByCustomCaption',
        customCaption: ['华南', '华北', '华东'],
      });
    });

    // ─── G8: 条件格式(阈值规则)回归 ───
    // 注:条件格式不走 buildQuery(纯渲染层),这里只验证 ViewConfig 携带 correct rule shape。
    // evaluateRule.test.ts 已有完整的阈值/排名/色阶单元测试。
    it('G8: 条件格式 rule shape — 销售额>50000 底色(背景色)', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        pageState: {
          ...defaultPageState,
          conditionalFormats: [{
            id: 'cf-1',
            kind: 'threshold',
            mode: 'pivot',
            scope: 'cell',
            measure: SALES,
            conditions: [{
              op: 'gt',
              value: 50000,
              style: { bg: '#fff4e6' },
            }],
          }],
        },
      });
      expect(vc.pageState.conditionalFormats).toHaveLength(1);
      const rule = vc.pageState.conditionalFormats![0]!;
      expect(rule.kind).toBe('threshold');
      expect(rule.measure).toBe(SALES);
    });

    // ─── G9: 导出 Excel/CSV ───
    it('G9: exportMaxRows + pageState 传递到 query', () => {
      const vc = buildViewConfig({
        rows: [{ fieldName: PROVINCE, type: 'Dimension' }],
        values: [buildValueField({ measureName: SALES })],
        pageState: {
          ...defaultPageState,
          exportMaxRows: 20000,
          rowPageSize: 1000,
        },
      });
      expect(vc.pageState.exportMaxRows).toBe(20000);
      expect(vc.pageState.rowPageSize).toBe(1000);
      const q = buildQuery(vc, orderModelMetadata, vc.pageState);
      // buildQuery 将 vc.pageState.rowPageSize 写入 pageSettings
      expect(q.pageSettings.rowPageSize).toBe(1000);
      expect(q.pageSettings.columnPageSize).toBe(50);
      // exportMaxRows 仅导出时用,不进入日常 query 的 pageSettings
    });
  });
});
