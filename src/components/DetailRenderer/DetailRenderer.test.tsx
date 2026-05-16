/**
 * DetailRenderer 测试 —
 *   D1. error → 显示错误 banner + retry
 *   D2. rows 为空 → 显示拖拽提示
 *   D3. 有 rows 但 renderModel=null → 显示无数据
 *   D4. 有 rows + 非空 renderModel → 渲染表头 + 数据行
 *   D5. emptyValueText 替换空值
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';
import type { RenderCell, RenderModel, RowHeaderNode } from '../../types/renderModel.js';

import { DetailRenderer } from './DetailRenderer.js';

function makeRowHeaderNodes(names: string[][]): RowHeaderNode[] {
  return names.map((fp, i) => ({
    member: { name: fp[fp.length - 1] ?? '', uniqueName: fp, level: 'L1', dimension: 'dim1', fieldName: 'f1' },
    depth: fp.length - 1,
    rowIndex: i,
    fullPath: fp,
    hierarchyFieldName: null,
    canDrillDown: false,
    canDrillUp: false,
  }));
}

function makeCell(formatted: string, isEmpty = false, isMasked = false): RenderCell {
  return { value: formatted, formattedValue: formatted, isEmpty, isMasked };
}

function makeRenderModel(rows: RowHeaderNode[], cells: RenderCell[][]): RenderModel {
  return {
    rowHeader: rows,
    columnHeader: [
      { fieldName: 'col_0', alias: '列 1', dataFormat: '0.00', isMeasure: false },
    ],
    matrix: cells,
    grandTotalRow: null,
    columnMeta: [],
    pagination: { totalRowCount: rows.length },
  };
}

describe('DetailRenderer', () => {
  it('D1: error → 显示错误 banner', () => {
    render(
      <DetailRenderer
        renderModel={null}
        viewConfig={buildViewConfig({ rows: [{ fieldName: 'f1', type: 'Dimension' }] })}
        error={new Error('network down')}
        onSortClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-error-banner')).toHaveTextContent('network down');
  });

  it('D1: error + onRetry → 显示重试按钮', () => {
    const onRetry = vi.fn();
    render(
      <DetailRenderer
        renderModel={null}
        viewConfig={buildViewConfig({ rows: [{ fieldName: 'f1', type: 'Dimension' }] })}
        error={new Error('fail')}
        onSortClick={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('pivot-retry')).toBeInTheDocument();
  });

  it('D2: rows 为空 → 显示拖拽提示', () => {
    render(
      <DetailRenderer
        renderModel={null}
        viewConfig={buildViewConfig()}
        onSortClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-empty-prompt')).toBeInTheDocument();
  });

  it('D3: 有 rows 但 renderModel=null → 显示无数据', () => {
    render(
      <DetailRenderer
        renderModel={null}
        viewConfig={buildViewConfig({ rows: [{ fieldName: 'f1', type: 'Dimension' }] })}
        onSortClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-no-data')).toBeInTheDocument();
  });

  it('D4: 有 rows + 非空 renderModel → 渲染表头 + 数据行', () => {
    const rows = makeRowHeaderNodes([['江苏', '华东'], ['浙江', '华东']]);
    const cells = [[makeCell('江苏'), makeCell('华东')], [makeCell('浙江'), makeCell('华东')]];
    const rm = makeRenderModel(rows, cells);
    render(
      <DetailRenderer
        renderModel={rm}
        viewConfig={buildViewConfig({
          rows: [
            { fieldName: 'province', type: 'Dimension' },
            { fieldName: 'region', type: 'Dimension' },
          ],
        })}
        onSortClick={vi.fn()}
        rowFieldLabels={['省份', '区域']}
      />,
    );
    expect(screen.getByText('省份')).toBeInTheDocument();
    expect(screen.getByText('区域')).toBeInTheDocument();
    expect(screen.getByTestId('adhoc-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('adhoc-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('adhoc-cell-r0-c0')).toHaveTextContent('江苏');
    expect(screen.getByTestId('adhoc-cell-r1-c0')).toHaveTextContent('浙江');
  });

  it('D5: emptyValueText 替换空值', () => {
    const rows = makeRowHeaderNodes([['江苏', ''], ['浙江', '华东']]);
    const cells = [[makeCell('江苏'), makeCell('', true)], [makeCell('浙江'), makeCell('华东')]];
    const rm = makeRenderModel(rows, cells);
    render(
      <DetailRenderer
        renderModel={rm}
        viewConfig={buildViewConfig({
          rows: [
            { fieldName: 'province', type: 'Dimension' },
            { fieldName: 'region', type: 'Dimension' },
          ],
          pageState: {
            rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50,
            emptyValueText: '-',
          },
        })}
        onSortClick={vi.fn()}
        rowFieldLabels={['省份', '区域']}
      />,
    );
    expect(screen.getByTestId('adhoc-cell-r0-c1')).toHaveTextContent('-');
  });

  it('D4: loading=true → data-loading 属性', () => {
    const rows = makeRowHeaderNodes([['江苏']]);
    const rm = makeRenderModel(rows, [[makeCell('江苏')]]);
    const { container } = render(
      <DetailRenderer
        renderModel={rm}
        viewConfig={buildViewConfig({ rows: [{ fieldName: 'f1', type: 'Dimension' }] })}
        loading={true}
        onSortClick={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-loading="true"]')).toBeInTheDocument();
  });
});
