/**
 * TreeRenderer 测试 —
 *   TR1. root 不存在 → loading 态
 *   TR2. root status='loading' → loading 态
 *   TR3. root status='error' → 错误 banner + retry
 *   TR4. root status='success' + 空 rows → 无数据
 *   TR5. root status='success' + 有 rows → 渲染行 + toggle
 *   TR6. 点 toggle → onToggle
 *   TR7. 列头 toggle → 折叠/展开
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CellSet } from '../../types/cellSet.js';
import type { RenderCell, RenderModel } from '../../types/renderModel.js';
import type { BranchEntry, BranchRow, TreePathKey } from '../../types/tree.js';

import { TreeRenderer } from './TreeRenderer.js';

const EMPTY_CS: CellSet = {
  rowFields: [], columnFields: [], columnMetadataArray: [],
  rows: [], columns: [], data: [], fieldNameToUniqueId: {}, totalRowCount: 0,
};

const EMPTY_RM: RenderModel = {
  rowHeader: [], columnHeader: [], matrix: [],
  grandTotalRow: null, columnMeta: [], pagination: { totalRowCount: 0 },
};

function cell(v: number): RenderCell {
  return { isEmpty: false, formattedValue: String(v), value: v, isMasked: false };
}

function makeSuccessBranch(rows: BranchRow[]): BranchEntry {
  return {
    status: 'success',
    rows,
    columnHeader: [
      { fieldName: 'sales', alias: '销售额', dataFormat: '0.00', isMeasure: true },
    ],
    columnHeaderLevels: undefined,
    cellSet: EMPTY_CS,
    renderModel: EMPTY_RM,
  };
}

function makeBranchRow(name: string, _showToggle: boolean, values: number[]): BranchRow {
  return {
    member: { name, uniqueName: [name], level: 'L1', dimension: 'dim1', fieldName: 'f1' },
    fullPath: [name],
    cells: values.map(cell),
  };
}

function loadingBranch(): BranchEntry {
  return { status: 'loading', controller: new AbortController() };
}

function errorBranch(msg: string): BranchEntry {
  return { status: 'error', error: new Error(msg) };
}

describe('TreeRenderer', () => {
  const baseProps = {
    branches: new Map<TreePathKey, BranchEntry>(),
    expanded: new Set<TreePathKey>(),
    onToggle: vi.fn(),
    onRetry: vi.fn(),
    maxDepth: 2,
    viewConfig: {
      rows: [{ fieldName: 'r1', type: 'Hierarchy' as const, drillDepth: 1 }],
      columns: [],
      values: [],
      filters: [],
      measureFilters: [],
      rowSorts: [],
      columnSorts: [],
      pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
      customFields: [],
      extensions: null,
    },
  };

  it('TR1: root 不存在 → loading 态', () => {
    const { container } = render(<TreeRenderer {...baseProps} />);
    expect(container.querySelector('[data-state="loading"]')).toBeInTheDocument();
  });

  it('TR2: root status="loading" → loading 态', () => {
    const branches = new Map([['root', loadingBranch()]]);
    const { container } = render(<TreeRenderer {...baseProps} branches={branches} />);
    expect(container.querySelector('[data-loading="true"]')).toBeInTheDocument();
  });

  it('TR3: root status="error" → 错误 banner + retry', () => {
    const onRetry = vi.fn();
    const branches = new Map([['root', errorBranch('network down')]]);
    render(<TreeRenderer {...baseProps} branches={branches} onRetry={onRetry} />);
    expect(screen.getByTestId('pivot-error-banner')).toHaveTextContent('network down');
    fireEvent.click(screen.getByTestId('pivot-retry'));
    expect(onRetry).toHaveBeenCalledWith('root');
  });

  it('TR4: root success + 空 rows → 无数据', () => {
    const branches = new Map([['root', makeSuccessBranch([])]]);
    render(<TreeRenderer {...baseProps} branches={branches} />);
    expect(screen.getByTestId('pivot-no-data')).toHaveTextContent('无数据');
  });

  const PATH = '\x01';

  it('TR5: root success + 有 rows → 渲染行 + toggle', () => {
    const branches = new Map([
      ['root', makeSuccessBranch([
        makeBranchRow('江苏', true, [1000]),
        makeBranchRow('浙江', false, [800]),
      ])],
    ]);
    render(
      <TreeRenderer {...baseProps} branches={branches} expanded={new Set()} rowFieldLabels={['省份']} />,
    );
    expect(screen.getByTestId('pivot-corner-tree')).toHaveTextContent('省份');
    // All rows at depth-0 get toggle when maxDepth=2 (not yet at leaf level)
    expect(screen.getByTestId(`tree-row-root${PATH}江苏`)).toBeInTheDocument();
    expect(screen.getByTestId(`tree-toggle-root${PATH}江苏`)).toBeInTheDocument();
    expect(screen.getByTestId(`tree-row-root${PATH}浙江`)).toBeInTheDocument();
    expect(screen.getByTestId(`tree-toggle-root${PATH}浙江`)).toBeInTheDocument();
  });

  it('TR6: 点 toggle → onToggle', () => {
    const onToggle = vi.fn();
    const branches = new Map([
      ['root', makeSuccessBranch([makeBranchRow('华东', true, [5000])])],
    ]);
    render(<TreeRenderer {...baseProps} branches={branches} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId(`tree-toggle-root${PATH}华东`));
    expect(onToggle).toHaveBeenCalledWith(`root${PATH}华东`);
  });

  it('TR7: 列头 renders with sort indicator', () => {
    const branches = new Map([
      ['root', {
        status: 'success' as const,
        rows: [makeBranchRow('江苏', false, [100])],
        columnHeader: [{ fieldName: 'sales', alias: '销售额', dataFormat: '0.00', isMeasure: true }],
        columnHeaderLevels: undefined,
        cellSet: EMPTY_CS,
        renderModel: EMPTY_RM,
      }],
    ]);
    render(<TreeRenderer {...baseProps} branches={branches} />);
    expect(screen.getByTestId('column-header-sales')).toHaveTextContent('销售额');
    expect(screen.getByTestId('column-header-sales').dataset.sortable).toBe('false');
  });
});
