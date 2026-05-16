/**
 * 真实后端响应集成测试 — 用 [scripts/probe-backend.ts](../../../scripts/probe-backend.ts)
 * 实地探测到的 CellSet/Metadata 形态作为 fixture，验证 parseCellSet + PivotRenderer
 * 在真实数据上能正确渲染。
 *
 * 这里不引 SmartbiClient（避免测试依赖网络）— 直接 mock onQuery 返回观察到的 shape。
 *
 * 限制：仅 flat dimension（无 hierarchy drill）。Hierarchy drill 见 [docs/adr-004-hierarchy-drill.md](../../../docs/adr-004-hierarchy-drill.md)。
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildDimensionRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import type { CellSet } from '../../types/cellSet.js';
import type { FieldNode, Metadata } from '../../types/metadata.js';

import { PivotTable } from './PivotTable.js';

// ===== Fixture：照搬 probe-output/cellset.json 的形态 =====

/**
 * 真实后端 GET /api/augmentedDataSet/{id} 返回 metadata 的最小结构。
 * 包含一个 LEVEL_TIME_YEAR 维度字段 + 一个 MEASURE,
 * 用新结构(views/levels/measures/nodes 扁平 + nodes 树双视图)。
 */
const dimRoot: FieldNode = {
  id: 'AUGMENTED_DATASET_FOLDER.dim',
  name: 'dimension',
  aliasFromDb: '维度',
  descFromDb: null,
  useFromDb: false,
  alias: '维度',
  desc: null,
  type: 'DIMENSION_FOLDER',
  group: 'DIMENSION',
  level: 0,
  order: 0,
  visible: 1,
  parentId: null,
  valueType: null,
  dataFormat: null,
  extended: null,
  refDataSetFieldId: null,
  referenceFieldId: null,
  originalDataType: null,
  aggregator: null,
  businessCaliber: null,
  children: [],
  creatorId: null,
};
const yearLevel: FieldNode = {
  id: 'AUGMENTED_DATASET_LEVEL.year',
  name: 'the_date_Year2',
  aliasFromDb: '销售_年',
  descFromDb: null,
  useFromDb: false,
  alias: '销售_年',
  desc: null,
  type: 'LEVEL_TIME_YEAR',
  group: 'LEVEL',
  level: 1,
  order: 0,
  visible: 1,
  parentId: dimRoot.id,
  valueType: 'STRING',
  dataFormat: 'yyyy',
  extended: null,
  refDataSetFieldId: null,
  referenceFieldId: null,
  originalDataType: null,
  aggregator: null,
  businessCaliber: null,
  children: [],
  creatorId: null,
};
const measureRoot: FieldNode = {
  id: 'AUGMENTED_DATASET_FOLDER.measure',
  name: 'measure',
  aliasFromDb: '度量',
  descFromDb: null,
  useFromDb: false,
  alias: '度量',
  desc: null,
  type: 'MEASURE_FOLDER',
  group: 'MEASURE',
  level: 0,
  order: 1,
  visible: 1,
  parentId: null,
  valueType: null,
  dataFormat: null,
  extended: null,
  refDataSetFieldId: null,
  referenceFieldId: null,
  originalDataType: null,
  aggregator: null,
  businessCaliber: null,
  children: [],
  creatorId: null,
};
const salesMeasureNode: FieldNode = {
  id: 'AUGMENTED_DATASET_MEASURE.sales',
  name: '销售额_m',
  aliasFromDb: '销售额',
  descFromDb: null,
  useFromDb: false,
  alias: '销售额',
  desc: null,
  type: 'MEASURE',
  group: 'MEASURE',
  level: 1,
  order: 0,
  visible: 1,
  parentId: measureRoot.id,
  valueType: 'BIGINT',
  dataFormat: '<整型-默认值>',
  extended: null,
  refDataSetFieldId: null,
  referenceFieldId: null,
  originalDataType: 'BIGINT',
  aggregator: 'sum',
  businessCaliber: null,
  children: [],
  creatorId: null,
};
dimRoot.children = [yearLevel];
measureRoot.children = [salesMeasureNode];

const realMetadata: Metadata = {
  id: 'placeholder-model-id',
  name: '订单',
  alias: '订单',
  desc: '',
  providerName: 'AUGMENTED',
  views: [],
  fields: [],
  levels: [],
  measures: [],
  calcMeasures: [],
  namedSets: [],
  nodes: [dimRoot, yearLevel, measureRoot, salesMeasureNode],
};

/**
 * 真实后端 POST /api/augmentedQuery/queryFromSmartCubeByName 返回 CellSet。
 * 模型：rows=[the_date_Year2], columns=[销售额_m]
 *
 * 关键点（与 probe-output 一致）：
 *   - columnMetadataArray 含**两条**：行轴标签列 (the_date_Year2) + 数据列 (销售额_m)
 *   - levelType 是裸字符串 "TIME_YEAR"，不是 {type: ...} 对象
 *   - cellSet.columns 是 [[]]（单 measure 列轴 → 一个空 member tuple）
 *   - data 用稀疏数组，column 索引相对**数据列**起算（这里全为 0）
 */
const realCellSet: CellSet = {
  rowFields: [
    {
      name: 'the_date_Year2',
      define: {
        _enum: 'LevelField',
        dimensionName: 'custom-the_date',
        levelName: 'the_date_Year2',
      },
      fieldNames: ['the_date_Year2'],
    },
  ],
  columnFields: [
    {
      name: 'MeasuresLevel',
      define: { _enum: 'LevelField', dimensionName: 'Measures', levelName: 'MeasuresLevel' },
      fieldNames: ['销售额_m'],
    },
  ],
  columnMetadataArray: [
    {
      fieldId: 'AUGMENTED_DATASET_LEVEL.the_date_Year2',
      name: 'the_date_Year2',
      alias: '销售_年',
      valueType: 'STRING',
      levelType: 'TIME_YEAR', // ← 真实响应是字符串
      dataFormat: 'yyyy',
      maskingRuleIdList: [],
      accessible: true,
    },
    {
      fieldId: 'AUGMENTED_DATASET_MEASURE.sales',
      name: '销售额_m',
      alias: '销售额',
      valueType: 'BIGINT',
      levelType: null,
      dataFormat: '<整型-默认值>',
      maskingRuleIdList: [],
      accessible: true,
    },
  ],
  rows: [
    [
      {
        name: '2023',
        uniqueName: ['custom-the_date', '2023'],
        level: 'the_date_Year2',
        dimension: 'custom-the_date',
        fieldName: 'the_date_Year2',
        value: '2023',
        formattedValue: '2023',
        valueType: 'STRING',
        useTransformRule: false,
      },
    ],
    [
      {
        name: '2024',
        uniqueName: ['custom-the_date', '2024'],
        level: 'the_date_Year2',
        dimension: 'custom-the_date',
        fieldName: 'the_date_Year2',
        value: '2024',
        formattedValue: '2024',
        valueType: 'STRING',
        useTransformRule: false,
      },
    ],
  ],
  columns: [
    [
      {
        name: '销售额',
        uniqueName: ['Measures', '销售额_m'],
        level: 'MeasuresLevel',
        dimension: 'Measures',
        fieldName: '销售额_m',
      },
    ],
  ],
  data: [
    { row: 0, column: 0, value: 41642282, formattedValue: '41642282', valueType: 'BIGINT' },
    { row: 1, column: 0, value: 40835910, formattedValue: '40835910', valueType: 'BIGINT' },
  ],
  fieldNameToUniqueId: {},
  totalRowCount: 2,
};

describe('PivotTable — real backend response shape (flat year query)', () => {
  it('renders 2 year rows from real CellSet shape with row-label meta in columnMetadataArray', async () => {
    const onQuery = vi.fn().mockResolvedValue(realCellSet);
    const viewConfig = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'the_date_Year2' })],
      values: [buildValueField({ measureName: '销售额_m' })],
    });

    render(<PivotTable metadata={realMetadata} defaultValue={viewConfig} onQuery={onQuery} />);

    await waitFor(() => expect(screen.getByText('2023')).toBeInTheDocument());
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it('column header shows measure alias (not row-axis label)', async () => {
    const onQuery = vi.fn().mockResolvedValue(realCellSet);
    const viewConfig = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'the_date_Year2' })],
      values: [buildValueField({ measureName: '销售额_m' })],
    });
    render(<PivotTable metadata={realMetadata} defaultValue={viewConfig} onQuery={onQuery} />);

    // 列头应显示"销售额"（measure alias），不应显示"销售_年"（行轴标签 alias）
    await waitFor(() =>
      expect(screen.getByTestId('column-header-销售额_m')).toHaveTextContent('销售额'),
    );
    expect(screen.queryByTestId('column-header-the_date_Year2')).toBeNull();
  });

  it('renders cell values from data[].column index (relative to data columns, not absolute)', async () => {
    const onQuery = vi.fn().mockResolvedValue(realCellSet);
    const viewConfig = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'the_date_Year2' })],
      values: [buildValueField({ measureName: '销售额_m' })],
    });
    render(<PivotTable metadata={realMetadata} defaultValue={viewConfig} onQuery={onQuery} />);

    await waitFor(() => {
      const cell00 = screen.getByTestId('cell-r0-c0');
      expect(cell00).toHaveTextContent('41642282');
    });
    expect(screen.getByTestId('cell-r1-c0')).toHaveTextContent('40835910');
  });
});
