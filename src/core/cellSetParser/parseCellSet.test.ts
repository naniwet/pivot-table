/**
 * parseCellSet 测试 — ADR-004 C2 重写后
 *
 * 契约：CellSet + ViewConfig + Metadata → RenderModel
 *
 * P0 关注（C2 后）：
 *   - 单 hierarchy 行轴 + 单 measure 列轴
 *   - 多 level 行轴：每个 cellSet.rows[i] 是 Member[]，长度 = drillDepth
 *   - rowHeader 的 depth = members.length - 1，fullPath = members.map(m=>m.name)
 *   - canDrillDown / canDrillUp 来自 viewConfig.rows[hier].drillDepth 与 metadata 最大深度的比较
 *   - 总计行检测约定：member.level === '(All)'
 *   - columnMetadataArray 含行轴标签 + 数据列；按 cellSet.columns.length 切尾
 */
import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import {
  makeCellSet,
  makeColumnMeta,
  makeMeasureMember,
  makeMember,
  makeRowLabelMeta,
} from '../../fixtures/cellSet.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { Cell, CellSet, Member } from '../../types/cellSet.js';
import { EMPTY_CELL } from '../../types/renderModel.js';

import { parseCellSet } from './parseCellSet.js';

function makeScenarioBCellSet(overrides: Partial<CellSet> = {}): CellSet {
  const jiangsu = makeMember({ uniqueName: ['江苏'], level: 'ShipProvince2' });
  const zhejiang = makeMember({ uniqueName: ['浙江'], level: 'ShipProvince2' });

  const cells: Cell[] = [
    { row: 0, column: 0, value: 100, formattedValue: '100' },
    { row: 1, column: 0, value: 60, formattedValue: '60' },
  ];

  return {
    rowFields: [
      {
        name: 'ShipProvince2',
        define: {
          _enum: 'LevelField',
          dimensionName: FIELD_IDS.shipRegionHierarchy,
          levelName: 'ShipProvince2',
        },
        fieldNames: ['ShipProvince2'],
      },
    ],
    columnFields: [
      {
        name: FIELD_IDS.salesMeasure,
        define: { _enum: 'MeasureField', measureName: FIELD_IDS.salesMeasure },
        fieldNames: [FIELD_IDS.salesMeasure],
      },
    ],
    // columnMetadataArray 是 per-FIELD 元数据：行轴 field（省份）+ 列轴 field（销售额 measure）
    columnMetadataArray: [
      makeRowLabelMeta('ShipProvince2', '省份'),
      makeColumnMeta(),
    ],
    rows: [[jiangsu], [zhejiang]],
    // 列轴 1 个 measure tuple；每个 tuple 是 Member[]
    columns: [[makeMeasureMember()]],
    data: cells,
    fieldNameToUniqueId: {},
    totalRowCount: 2,
    ...overrides,
  };
}

// ============== Tests ==============

describe('parseCellSet — empty input', () => {
  it('produces empty render model from empty CellSet', () => {
    const model = parseCellSet(makeCellSet(), buildViewConfig(), orderModelMetadata);

    expect(model.rowHeader).toEqual([]);
    expect(model.columnHeader).toEqual([]);
    expect(model.matrix).toEqual([]);
    expect(model.grandTotalRow).toBeNull();
    expect(model.columnMeta).toEqual([]);
    expect(model.pagination.totalRowCount).toBe(0);
  });
});

describe('parseCellSet — matrix construction', () => {
  it('builds dense matrix sized rows × dataColCount', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 1 })],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.matrix).toHaveLength(2);
    expect(model.matrix[0]!).toHaveLength(1);
    expect(model.matrix[0]![0]).toMatchObject({ value: 100, isEmpty: false });
    expect(model.matrix[1]![0]).toMatchObject({ value: 60 });
  });

  it('slices columnMetadataArray to keep only data column meta (drops row-axis label meta)', () => {
    const cellSet = makeScenarioBCellSet();
    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);
    expect(model.columnMeta).toHaveLength(1);
    expect(model.columnMeta[0]!.name).toBe(FIELD_IDS.salesMeasure);
  });

  it('exposes totalRowCount in pagination', () => {
    const cellSet = makeScenarioBCellSet({ totalRowCount: 999 });
    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);
    expect(model.pagination.totalRowCount).toBe(999);
  });
});

describe('parseCellSet — columnHeaderLevels (cross-table)', () => {
  it('单 measure 列轴 → 1 个 level，1 个 cell（colSpan = 数据列数=1）', () => {
    const cellSet = makeScenarioBCellSet();
    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.columnHeaderLevels).toHaveLength(1);
    expect(model.columnHeaderLevels![0]).toEqual([
      { fieldName: FIELD_IDS.salesMeasure, label: '销售额', colSpan: 1, isMeasure: true },
    ]);
  });

  it('dim + measure 多级（型号×销售额）→ 2 levels，每个 dim 值一个 cell + 每个 measure 一个 cell', () => {
    // 列轴 = [型号, 销售额]：3 个型号 × 1 measure = 3 数据列
    const products = ['型号1', '型号2', '型号3'];
    const measureMember: Member = {
      name: '销售额',
      uniqueName: ['Measures', FIELD_IDS.salesMeasure],
      level: 'MeasuresLevel',
      dimension: 'Measures',
      fieldName: FIELD_IDS.salesMeasure,
    };
    const cellSet = makeScenarioBCellSet({
      columns: products.map((p) => [
        {
          name: p,
          uniqueName: ['型号', p],
          level: '型号',
          dimension: '型号',
          fieldName: '型号',
          formattedValue: p,
        },
        measureMember,
      ]),
      data: [
        { row: 0, column: 0, value: 100, formattedValue: '100' },
        { row: 0, column: 1, value: 200, formattedValue: '200' },
        { row: 0, column: 2, value: 300, formattedValue: '300' },
        { row: 1, column: 0, value: 60, formattedValue: '60' },
        { row: 1, column: 1, value: 70, formattedValue: '70' },
        { row: 1, column: 2, value: 80, formattedValue: '80' },
      ],
    });

    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.columnHeaderLevels).toHaveLength(2);
    // 第 1 层：3 个型号 cells
    expect(model.columnHeaderLevels![0]).toEqual([
      { fieldName: '型号', label: '型号1', colSpan: 1, isMeasure: false },
      { fieldName: '型号', label: '型号2', colSpan: 1, isMeasure: false },
      { fieldName: '型号', label: '型号3', colSpan: 1, isMeasure: false },
    ]);
    // 第 2 层：3 个 measure cells（销售额）
    expect(model.columnHeaderLevels![1]).toHaveLength(3);
    expect(model.columnHeaderLevels![1]![0]).toMatchObject({
      label: '销售额',
      colSpan: 1,
      isMeasure: true,
    });
  });
});

describe('parseCellSet — columnHeader', () => {
  it('produces 1 ColumnHeaderCell per data column with isMeasure=true', () => {
    const cellSet = makeScenarioBCellSet();
    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.columnHeader).toHaveLength(1);
    expect(model.columnHeader[0]).toMatchObject({
      fieldName: FIELD_IDS.salesMeasure,
      alias: '销售额',
      isMeasure: true,
    });
  });

  it('measure 列头 alias 加 quickCalc 后缀(销售额（同期值）)— 避免同 measure 原值/快计列同名混淆', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      values: [
        buildValueField({
          measureName: FIELD_IDS.salesMeasure,
          quickCalc: {
            _enum: 'SamePeriodValue',
            dateDimension: 'd',
            dateLevel: 'l',
            offset: 1,
          },
        }),
      ],
    });
    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.columnHeader[0]?.alias).toBe('销售额（同期值）');
    // columnHeaderLevels(measure 层)同步加后缀,避免单 measure header 跟 cross-table levels 不一致
    const levels = model.columnHeaderLevels ?? [];
    const lastLevel = levels[levels.length - 1];
    expect(lastLevel?.[0]?.label).toBe('销售额（同期值）');
  });

  it('measure 列头 alias 不带后缀(quickCalc=null)— 回归保护:无快计时不影响原 alias', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      values: [
        buildValueField({
          measureName: FIELD_IDS.salesMeasure,
          quickCalc: null,
        }),
      ],
    });
    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.columnHeader[0]?.alias).toBe('销售额');
  });

  it('cellSet column member.fieldName 带 @QC@ 后缀 → 反查原 measureName 取 metadata,alias 仍正确', () => {
    // 模拟后端真实场景:query 发了 fields[{name: '销售额_xxx@QC@SamePeriodValue', measure: '销售额_xxx'}]
    // 后端返回 cellSet.columns tuple 里 measure member.fieldName 就是新的 @QC@ name
    const cellSet = makeScenarioBCellSet({
      columns: [[
        {
          name: '销售额',
          uniqueName: ['Measures', `${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`],
          level: 'MeasuresLevel',
          dimension: 'Measures',
          fieldName: `${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`,
        },
      ]],
    });
    const viewConfig = buildViewConfig({
      values: [
        buildValueField({
          measureName: FIELD_IDS.salesMeasure,
          quickCalc: { _enum: 'SamePeriodValue', dateDimension: 'd', dateLevel: 'l', offset: 1 },
        }),
      ],
    });
    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);
    // 关键:即使 fieldName 带后缀,split 后查到原 metadata,alias 是"销售额（同期值）"
    expect(model.columnHeader[0]?.alias).toBe('销售额（同期值）');
    // fieldName 保留原 cellSet 的(带后缀)— 为后端保证唯一性
    expect(model.columnHeader[0]?.fieldName).toBe(
      `${FIELD_IDS.salesMeasure}@QC@SamePeriodValue`,
    );
  });
});

describe('parseCellSet — rowHeader (multi-member tuples per ADR-004 C2)', () => {
  it('depth = members.length - 1; fullPath joins all member names', () => {
    // drillDepth=2: each row tuple = [province, region]
    const cellSet = makeScenarioBCellSet({
      rows: [
        [
          makeMember({ uniqueName: ['江苏'], level: 'ShipProvince2' }),
          makeMember({ uniqueName: ['江苏', '苏南'], level: 'ShipRegion2' }),
        ],
        [
          makeMember({ uniqueName: ['江苏'], level: 'ShipProvince2' }),
          makeMember({ uniqueName: ['江苏', '苏北'], level: 'ShipRegion2' }),
        ],
      ],
      data: [
        { row: 0, column: 0, value: 60, formattedValue: '60' },
        { row: 1, column: 0, value: 40, formattedValue: '40' },
      ],
      totalRowCount: 2,
    });
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 2 })],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.rowHeader).toHaveLength(2);
    expect(model.rowHeader[0]).toMatchObject({
      depth: 1,
      fullPath: ['江苏', '苏南'],
    });
    expect(model.rowHeader[0]!.member.name).toBe('苏南'); // deepest member
  });

  it('single-level (drillDepth=1) produces depth=0 rows', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 1 })],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.rowHeader[0]).toMatchObject({ depth: 0, fullPath: ['江苏'] });
    expect(model.rowHeader[1]).toMatchObject({ depth: 0, fullPath: ['浙江'] });
  });

  it('canDrillDown=true when drillDepth < maxDepth', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 1 })], // 1 < 3 (maxDepth)
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.rowHeader[0]!.canDrillDown).toBe(true);
    expect(model.rowHeader[0]!.canDrillUp).toBe(false);
  });

  it('canDrillUp=true when drillDepth > 1', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 2 })],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.rowHeader[0]!.canDrillDown).toBe(true);  // 2 < 3
    expect(model.rowHeader[0]!.canDrillUp).toBe(true);    // 2 > 1
  });

  it('canDrillDown=false at maxDepth', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 3 })], // = maxDepth
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);

    expect(model.rowHeader[0]!.canDrillDown).toBe(false);
    expect(model.rowHeader[0]!.canDrillUp).toBe(true);
  });

  it('hierarchyFieldName populated when row hierarchy present', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [buildHierarchyRow({ drillDepth: 1 })],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);
    expect(model.rowHeader[0]!.hierarchyFieldName).toBe(FIELD_IDS.shipRegionHierarchy);
  });

  it('non-hierarchy row fields → canDrill* false, hierarchyFieldName null', () => {
    const cellSet = makeScenarioBCellSet();
    const viewConfig = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince', type: 'Dimension' }],
      values: [buildValueField()],
    });

    const model = parseCellSet(cellSet, viewConfig, orderModelMetadata);
    expect(model.rowHeader[0]!.hierarchyFieldName).toBeNull();
    expect(model.rowHeader[0]!.canDrillDown).toBe(false);
    expect(model.rowHeader[0]!.canDrillUp).toBe(false);
  });
});

describe('parseCellSet — masked cells', () => {
  it('marks cells in a masked column with isMasked=true', () => {
    const cellSet = makeScenarioBCellSet({
      columnMetadataArray: [
        makeRowLabelMeta('ShipProvince2', '省份'),
        makeColumnMeta({ maskingRuleIdList: ['rule_1'] }),
      ],
    });

    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.matrix[0]![0]!.isMasked).toBe(true);
    expect(model.matrix[1]![0]!.isMasked).toBe(true);
  });

  it('leaves isMasked=false on EMPTY_CELL even if column is masked', () => {
    const cellSet = makeScenarioBCellSet({
      columnMetadataArray: [
        makeRowLabelMeta('ShipProvince2', '省份'),
        makeColumnMeta({ maskingRuleIdList: ['rule_1'] }),
      ],
      data: [{ row: 0, column: 0, value: 100, formattedValue: '100' }],
    });

    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.matrix[0]![0]!.isMasked).toBe(true);
    expect(model.matrix[1]![0]).toBe(EMPTY_CELL);
  });
});

describe('parseCellSet — grand total row', () => {
  it('detects (All)-level member and surfaces it as grandTotalRow (excluded from rowHeader)', () => {
    const allMember = makeMember({ uniqueName: ['(All)'], level: '(All)', name: '总计' });
    const jiangsu = makeMember({ uniqueName: ['江苏'], level: 'ShipProvince2' });

    const cellSet = makeScenarioBCellSet({
      rows: [[jiangsu], [allMember]],
      data: [
        { row: 0, column: 0, value: 100, formattedValue: '100' },
        { row: 1, column: 0, value: 999, formattedValue: '999' },
      ],
      totalRowCount: 2,
    });

    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);

    expect(model.rowHeader).toHaveLength(1);
    expect(model.rowHeader[0]!.member.name).toBe('江苏');
    expect(model.matrix).toHaveLength(1);
    expect(model.matrix[0]![0]!.value).toBe(100);

    expect(model.grandTotalRow).not.toBeNull();
    expect(model.grandTotalRow![0]!.value).toBe(999);
  });

  it('grandTotalRow is null when no (All) member', () => {
    const cellSet = makeScenarioBCellSet();
    const model = parseCellSet(cellSet, buildViewConfig(), orderModelMetadata);
    expect(model.grandTotalRow).toBeNull();
  });
});

describe('parseCellSet — defensive', () => {
  it('does not crash on rows with empty member arrays', () => {
    const cellSet = makeScenarioBCellSet({
      rows: [[]],
      data: [],
      totalRowCount: 1,
    });

    expect(() => parseCellSet(cellSet, buildViewConfig(), orderModelMetadata)).not.toThrow();
  });
});
