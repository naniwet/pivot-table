/**
 * PivotTable drill-through integration tests.
 *
 * Scope: UI wiring only. Query payload details live in
 * src/core/drillThrough/buildDetailQuery.test.ts.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('echarts', () => ({
  init: () => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}));

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import { makeMember as makeBaseMember } from '../../fixtures/cellSet.js';
import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';
import type { CellSet } from '../../types/cellSet.js';

import { PivotTable } from './PivotTable.js';

const HIER = FIELD_IDS.shipRegionHierarchy;
const MEASURE = FIELD_IDS.salesMeasure;

const initialViewConfig = buildViewConfig({
  rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
  values: [buildValueField({ measureName: MEASURE })],
  rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
});

const cellSetWithJiangsu: CellSet = {
  rowFields: [
    {
      name: HIER,
      define: { _enum: 'LevelField', dimensionName: HIER, levelName: 'ShipProvince2' },
      fieldNames: ['ShipProvince2'],
    },
  ],
  columnFields: [
    {
      name: MEASURE,
      define: { _enum: 'MeasureField', measureName: MEASURE },
      fieldNames: [MEASURE],
    },
  ],
  columnMetadataArray: [
    {
      name: MEASURE,
      alias: '销售额',
      valueType: 'DOUBLE',
      dataFormat: '无小数点，有千分位',
      maskingRuleIdList: [],
      accessible: true,
    },
  ],
  rows: [
    [
      makeBaseMember({
        name: '江苏',
        uniqueName: ['江苏'],
        level: 'ShipProvince2',
        dimension: HIER,
        fieldName: 'ShipProvince2',
      }),
    ],
  ],
  columns: [
    [
      {
        name: '销售额',
        uniqueName: ['Measures', MEASURE],
        level: 'MeasuresLevel',
        dimension: 'Measures',
        fieldName: MEASURE,
      },
    ],
  ],
  data: [{ row: 0, column: 0, value: 1000, formattedValue: '1,000' }],
  fieldNameToUniqueId: {},
  totalRowCount: 1,
};

describe('PivotTable — DrillThrough 钻取明细 (P3)', () => {
  it('右键单元格 + onDrillThrough 提供 → 弹"查看明细"菜单项', async () => {
    const onDrillThrough = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
        onDrillThrough={onDrillThrough}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    expect(screen.getByTestId('context-menu-item-drill-through')).toBeInTheDocument();
  });

  it('点"查看明细" → 触发 onDrillThrough(query)', async () => {
    const onDrillThrough = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
        onDrillThrough={onDrillThrough}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    fireEvent.click(screen.getByTestId('context-menu-item-drill-through'));

    expect(onDrillThrough).toHaveBeenCalledTimes(1);
    const query = onDrillThrough.mock.calls[0]![0];
    expect(query.queryType).toBe('DetailQuery');
  });

  it('features.drillThrough=false → 不弹菜单(即使传了 onDrillThrough)', async () => {
    const onDrillThrough = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
        onDrillThrough={onDrillThrough}
        features={{ drillThrough: false }}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    expect(screen.queryByTestId('context-menu-item-drill-through')).not.toBeInTheDocument();
  });

  it('宿主自定 onCellRightClick → 优先宿主,组件不弹内置菜单', async () => {
    const onCellRightClick = vi.fn();
    const onDrillThrough = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
        onCellRightClick={onCellRightClick}
        onDrillThrough={onDrillThrough}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    expect(onCellRightClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('context-menu-item-drill-through')).not.toBeInTheDocument();
  });

  it('不传 onDrillThrough → 单元格右键仍弹菜单(走内置 DetailModal,跟图表一样开箱即用)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    expect(screen.getByTestId('context-menu-item-drill-through')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('context-menu-item-drill-through'));
    expect(screen.getByTestId('detail-modal')).toBeInTheDocument();
  });

  it('features.drillThrough=false → 单元格右键菜单的"查看明细"项关闭', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cellSetWithJiangsu)}
        features={{ drillThrough: false }}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const cell = screen.getByText('1,000').closest('td')!;
    fireEvent.contextMenu(cell);
    expect(screen.queryByTestId('context-menu-item-drill-through')).not.toBeInTheDocument();
  });
});
