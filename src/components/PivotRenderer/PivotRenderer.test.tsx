/**
 * PivotRenderer 组件测试 — ADR-004 C2 重写后
 *
 * 范围：
 *   - 空/加载/错误三态
 *   - 列头：alias + 当前排序方向标记
 *   - 行头：depth 缩进 + canDrillDown 显示 ▶ + canDrillUp 显示 ▼
 *   - 数据区：formattedValue + 脱敏 ***
 *   - 总计行：尾部独立行
 *   - hover tooltip：title 属性带完整路径
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';
import type { Member } from '../../types/cellSet.js';
import { EMPTY_CELL, type RenderModel, type RowHeaderNode } from '../../types/renderModel.js';

import { PivotRenderer } from './PivotRenderer.js';

const MEASURE = '销售额_1624531356707';
const HIER = 'h1';

function makeMember(name: string, uniqueName: string[], level: string): Member {
  return { name, uniqueName, level, dimension: HIER, fieldName: level };
}

/** 普通非 hierarchy 行（如 Dimension） */
function makeFlatRow(name: string, depth = 0): RowHeaderNode {
  return {
    member: makeMember(name, [name], 'L1'),
    depth,
    rowIndex: 0,
    fullPath: [name],
    hierarchyFieldName: null,
    canDrillDown: false,
    canDrillUp: false,
  };
}

/** Hierarchy 行：drillDepth 决定 canDrillDown/canDrillUp */
function makeHierarchyRow(
  name: string,
  fullPath: string[],
  drillDepth: number,
  maxDepth: number,
): RowHeaderNode {
  return {
    member: makeMember(name, fullPath, 'L'),
    depth: fullPath.length - 1,
    rowIndex: 0,
    fullPath,
    hierarchyFieldName: HIER,
    canDrillDown: drillDepth < maxDepth,
    canDrillUp: drillDepth > 1,
  };
}

function makeRenderModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    rowHeader: [],
    columnHeader: [],
    matrix: [],
    grandTotalRow: null,
    columnMeta: [],
    pagination: { totalRowCount: 0 },
    ...overrides,
  };
}

const baseViewConfig = buildViewConfig({
  rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
  values: [buildValueField({ measureName: MEASURE })],
  rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
});

const measureColMeta = {
  name: MEASURE,
  alias: '销售额',
  valueType: 'DOUBLE' as const,
  dataFormat: 'fmt',
  maskingRuleIdList: [],
  accessible: true,
};
const measureColHeader = { fieldName: MEASURE, alias: '销售额', dataFormat: 'fmt', isMeasure: true };

describe('PivotRenderer — empty / loading / error', () => {
  it('shows drag-prompt when viewConfig.values is empty', () => {
    render(
      <PivotRenderer
        renderModel={null}
        viewConfig={buildViewConfig()}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-empty-prompt')).toBeInTheDocument();
  });

  it('shows no-data when query returned an empty CellSet', () => {
    render(
      <PivotRenderer
        renderModel={makeRenderModel()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-no-data')).toBeInTheDocument();
  });

  it('marks data-loading when loading=true', () => {
    const { container } = render(
      <PivotRenderer
        renderModel={null}
        viewConfig={baseViewConfig}
        loading
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(container.firstChild).toHaveAttribute('data-loading', 'true');
  });

  it('shows error banner with retry button on error', async () => {
    const onRetry = vi.fn();
    render(
      <PivotRenderer
        renderModel={null}
        viewConfig={baseViewConfig}
        error={new Error('boom')}
        onRetry={onRetry}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pivot-error-banner')).toHaveTextContent(/boom/);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pivot-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('PivotRenderer — header rendering', () => {
  function modelWith1Row() {
    return makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeFlatRow('江苏')],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
      pagination: { totalRowCount: 1 },
    });
  }

  it('renders one column-header cell per columnMeta with its alias', () => {
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`column-header-${MEASURE}`)).toHaveTextContent('销售额');
  });

  it('shows DESC arrow on the actively-sorted column', () => {
    const vc = buildViewConfig({
      ...baseViewConfig,
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
    });
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={vc}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`column-header-${MEASURE}`)).toHaveAttribute('data-sort', 'DESC');
  });

  it('omits sort arrow when no sort active for that measure', () => {
    const vc = buildViewConfig({ values: [buildValueField()], rowSorts: [] });
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={vc}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`column-header-${MEASURE}`)).not.toHaveAttribute('data-sort');
  });

  it('calls onSortClick(fieldName, "ByMeasure") on measure column-header click', async () => {
    const onSortClick = vi.fn();
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`column-header-${MEASURE}`));
    expect(onSortClick).toHaveBeenCalledWith(MEASURE, 'ByMeasure', {
      multi: false,
      mode: 'global',
    });
  });

  it('calls onSortClick(fieldName, "ByDimension") on dimension column-header click (P1.0)', async () => {
    const onSortClick = vi.fn();
    const dimColModel = makeRenderModel({
      columnHeader: [
        { fieldName: 'the_date_Year2', alias: '销售_年', dataFormat: 'yyyy', isMeasure: false },
      ],
      rowHeader: [makeFlatRow('foo')],
      matrix: [[{ value: 1, formattedValue: '1', isEmpty: false, isMasked: false }]],
      columnMeta: [
        {
          name: 'the_date_Year2',
          alias: '销售_年',
          valueType: 'STRING',
          dataFormat: 'yyyy',
          maskingRuleIdList: [],
          accessible: true,
        },
      ],
    });
    render(
      <PivotRenderer
        renderModel={dimColModel}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('column-header-the_date_Year2'));
    expect(onSortClick).toHaveBeenCalledWith('the_date_Year2', 'ByDimension', {
      multi: false,
      mode: 'global',
    });
  });

  it('alt+click on column header → onSortClick with mode: "group" (P2 BASC/BDESC)', async () => {
    const onSortClick = vi.fn();
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const header = screen.getByTestId(`column-header-${MEASURE}`);
    // 模拟 altKey: true
    header.dispatchEvent(
      new MouseEvent('click', { bubbles: true, altKey: true }),
    );
    expect(onSortClick).toHaveBeenCalledWith(MEASURE, 'ByMeasure', {
      multi: false,
      mode: 'group',
    });
  });

  it('shift+click on column header → onSortClick with multi: true (P1.5)', async () => {
    const onSortClick = vi.fn();
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId(`column-header-${MEASURE}`));
    await user.keyboard('{/Shift}');
    expect(onSortClick).toHaveBeenCalledWith(MEASURE, 'ByMeasure', {
      multi: true,
      mode: 'global',
    });
  });

  it('onCellRightClick — 提供时 host 收到回调，不再自动 TSV copy', () => {
    const onCellRightClick = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
        onCellRightClick={onCellRightClick}
      />,
    );
    const cell = screen.getByTestId('cell-r0-c0');
    cell.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 33, clientY: 44 }),
    );
    expect(onCellRightClick).toHaveBeenCalledTimes(1);
    expect(onCellRightClick).toHaveBeenCalledWith(
      expect.objectContaining({
        rowIndex: 0,
        colIndex: 0,
        columnFieldName: MEASURE,
        x: 33,
        y: 44,
      }),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('多级列头 + 多级行头 → corner rowSpan=3 colSpan=2，列宽对齐', () => {
    // 模拟用户实际场景：
    // 行头 2 级（销售_年 + 销售_年季），列头 3 级（产品类别 + 产品子类 + 度量）
    const model = makeRenderModel({
      columnHeader: [
        { fieldName: 'sales', alias: '销售额', dataFormat: '', isMeasure: true },
        { fieldName: 'sales', alias: '销售额', dataFormat: '', isMeasure: true },
      ],
      columnHeaderLevels: [
        [{ fieldName: 'cat', label: '白色家电', colSpan: 2, isMeasure: false }],
        [
          { fieldName: 'subcat', label: '冰柜', colSpan: 1, isMeasure: false },
          { fieldName: 'subcat', label: '冰箱', colSpan: 1, isMeasure: false },
        ],
        [
          { fieldName: 'sales', label: '销售额', colSpan: 1, isMeasure: true },
          { fieldName: 'sales', label: '销售额', colSpan: 1, isMeasure: true },
        ],
      ],
      rowHeader: [
        {
          member: { name: '2023Q1', uniqueName: ['2023', '2023Q1'], level: 'L', dimension: 'd', fieldName: 'f' },
          depth: 1,
          rowIndex: 0,
          fullPath: ['2023', '2023Q1'],
          hierarchyFieldName: null,
          canDrillDown: false,
          canDrillUp: false,
        },
      ],
      matrix: [
        [
          { value: 1, formattedValue: '1', isEmpty: false, isMasked: false },
          { value: 2, formattedValue: '2', isEmpty: false, isMasked: false },
        ],
      ],
      columnMeta: [
        { name: 'sales', alias: '销售额', valueType: 'DOUBLE', dataFormat: '', maskingRuleIdList: [], accessible: true },
        { name: 'sales', alias: '销售额', valueType: 'DOUBLE', dataFormat: '', maskingRuleIdList: [], accessible: true },
      ],
    });
    const { container } = render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const corner = container.querySelector('.pivot-corner')!;
    expect(corner).toHaveAttribute('rowspan', '3');
    expect(corner).toHaveAttribute('colspan', '2');
    expect(container.querySelectorAll('.pivot-corner').length).toBe(1);
    expect(container.querySelectorAll('thead tr').length).toBe(3);

    // 关键：thead 每行总 colSpan 必须 = 2 (corner 占的) + 13(数据列) — 但这里简化为 2 数据列
    // 全部 thead 行的 cells 总 colSpan 应该一致
    const theadRows = container.querySelectorAll('thead tr');
    const totalColSpanOf = (tr: Element): number => {
      let sum = 0;
      tr.querySelectorAll('th, td').forEach((c) => {
        sum += Number(c.getAttribute('colspan') ?? 1);
      });
      return sum;
    };
    // 行 1 包含 corner(colSpan=2) + 1 个白色家电(colSpan=2) = 4
    // 行 2 是 corner 已 rowSpan 覆盖左 2 列 + 2 个产品子类 = 2 cells × colSpan=1 = 2
    // 行 3 同行 2
    // 各行实际渲染的 cells 总 colSpan + corner 占用 = 一致(每行 4)
    const r0 = totalColSpanOf(theadRows[0]!);
    const r1 = totalColSpanOf(theadRows[1]!);
    const r2 = totalColSpanOf(theadRows[2]!);
    // r0 包含 corner;r1/r2 不包含 corner(被 rowSpan 覆盖)
    expect(r0).toBe(4); // corner(2) + 白色家电(2)
    expect(r1).toBe(2); // 仅 2 个产品子类
    expect(r2).toBe(2); // 仅 2 个销售额
    // tbody 每行：row label(2) + 数据(2) = 4
    const firstTbodyRow = container.querySelector('tbody tr')!;
    expect(totalColSpanOf(firstTbodyRow)).toBe(4);
  });

  it('行/列冻结默认开启 — table data-freeze-* + thead / row-header data-frozen-* (P1.5)', () => {
    const { container } = render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const table = container.querySelector('table.pivot-grid')!;
    expect(table).toHaveAttribute('data-freeze-header', 'true');
    expect(table).toHaveAttribute('data-freeze-row-header', 'true');
    const thead = container.querySelector('thead')!;
    expect(thead).toHaveAttribute('data-frozen-header', 'true');
    // 行头 th 应有 data-frozen-row-header
    const rowHeaderTh = container.querySelector('tbody th[data-frozen-row-header="true"]');
    expect(rowHeaderTh).not.toBeNull();
    // corner 应有 data-frozen-corner（行+列都冻结时）
    const corner = container.querySelector('.pivot-corner');
    expect(corner).toHaveAttribute('data-frozen-corner', 'true');
  });

  it('行/列冻结可关掉 — freezeHeader=false / freezeRowHeader=false', () => {
    const { container } = render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
        freezeHeader={false}
        freezeRowHeader={false}
      />,
    );
    expect(container.querySelector('thead')).toHaveAttribute('data-frozen-header', 'false');
    expect(container.querySelector('tbody th')).toHaveAttribute(
      'data-frozen-row-header',
      'false',
    );
  });

  it('列宽拖拽 — handle mousedown + document mousemove → th width 变 (P1.5)', () => {
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const handle = screen.getByTestId(`col-resize-${MEASURE}`);
    // mousedown 在 handle 上 (clientX=100)
    fireEvent.mouseDown(handle, { clientX: 100, button: 0 });
    // document 级 mousemove (clientX=200) → 列宽 +100
    fireEvent.mouseMove(document, { clientX: 200 });
    // mouseup 结束
    fireEvent.mouseUp(document);

    const th = screen.getByTestId(`column-header-${MEASURE}`);
    // 起始 width = th.getBoundingClientRect().width（jsdom 下通常 0），+100 → clamp 到 ≥40
    // 这里只验"width 已被设置为 inline style"
    expect(th.style.width).toMatch(/^\d+px$/);
  });

  it('列宽 handle 的 mousedown 不会触发列头排序点击 (stopPropagation)', () => {
    const onSortClick = vi.fn();
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const handle = screen.getByTestId(`col-resize-${MEASURE}`);
    fireEvent.mouseDown(handle, { clientX: 0, button: 0 });
    fireEvent.mouseUp(document);
    // mousedown→mouseup 不触发 click（且 handle 阻止了冒泡），onSortClick 不应被调
    expect(onSortClick).not.toHaveBeenCalled();
  });

  it('mousedown + mouseenter + Ctrl+C → 复制选区 TSV 到剪贴板 (P1.0)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('cell-r0-c0');
    fireEvent.mouseDown(cell, { button: 0 });
    fireEvent.mouseEnter(cell);
    fireEvent.mouseUp(cell);
    expect(cell).toHaveAttribute('data-selected', 'true');

    // Ctrl+C
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const tsv = writeText.mock.calls[0]![0] as string;
    expect(tsv).toContain('销售额');
  });

  it('onCellRightClick — 不传时保留默认 TSV copy（向后兼容）', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <PivotRenderer
        renderModel={modelWith1Row()}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('cell-r0-c0');
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('renders sort priority rank when 多列排序 (≥2 sorts)', () => {
    const M2 = 'profit';
    const vc = buildViewConfig({
      values: [buildValueField()],
      rowSorts: [
        { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
        { type: 'ByMeasure', measureName: M2, direction: 'ASC' },
      ],
    });
    // 用一个有 2 个 measure 列的 model
    const dualModel = makeRenderModel({
      columnHeader: [
        {
          fieldName: MEASURE,
          alias: '销售额',
          dataFormat: '无小数点，有千分位',
          isMeasure: true,
        },
        {
          fieldName: M2,
          alias: 'Profit',
          dataFormat: '',
          isMeasure: true,
        },
      ],
      rowHeader: [makeFlatRow('foo')],
      matrix: [
        [
          { value: 1, formattedValue: '1', isEmpty: false, isMasked: false },
          { value: 2, formattedValue: '2', isEmpty: false, isMasked: false },
        ],
      ],
      columnMeta: [
        {
          name: MEASURE,
          alias: '销售额',
          valueType: 'DOUBLE',
          dataFormat: '',
          maskingRuleIdList: [],
          accessible: true,
        },
        {
          name: M2,
          alias: 'Profit',
          valueType: 'DOUBLE',
          dataFormat: '',
          maskingRuleIdList: [],
          accessible: true,
        },
      ],
    });
    render(
      <PivotRenderer
        renderModel={dualModel}
        viewConfig={vc}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    // MEASURE 是第 1 优先级
    expect(screen.getByTestId(`column-header-${MEASURE}`)).toHaveTextContent('1');
    expect(screen.getByTestId(`column-header-${M2}`)).toHaveTextContent('2');
  });
});

describe('PivotRenderer — drill chevrons (ADR-004 C2)', () => {
  it('renders ▶ when canDrillDown=true', () => {
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('江苏', ['江苏'], 1, 3)], // depth 1 of 3
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const row = screen.getByTestId('row-header-江苏');
    expect(within(row).getByTestId('drill-down')).toHaveTextContent('▶');
    expect(within(row).queryByTestId('drill-up')).toBeNull();
  });

  it('renders ▼ when canDrillUp=true (at max depth)', () => {
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('南京', ['江苏', '苏南', '南京'], 3, 3)],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const row = screen.getByTestId('row-header-南京');
    expect(within(row).getByTestId('drill-up')).toHaveTextContent('▼');
    expect(within(row).queryByTestId('drill-down')).toBeNull();
  });

  it('renders both ▼ and ▶ when in middle (canDrillDown && canDrillUp)', () => {
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('苏南', ['江苏', '苏南'], 2, 3)], // 1 < 2 < 3
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const row = screen.getByTestId('row-header-苏南');
    expect(within(row).getByTestId('drill-up')).toBeInTheDocument();
    expect(within(row).getByTestId('drill-down')).toBeInTheDocument();
  });

  it('does not render any chevron for non-hierarchy rows', () => {
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeFlatRow('江苏')],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={buildViewConfig({ values: [buildValueField()] })}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const row = screen.getByTestId('row-header-江苏');
    expect(within(row).queryByTestId('drill-down')).toBeNull();
    expect(within(row).queryByTestId('drill-up')).toBeNull();
  });

  it('▶ click calls onDrillDown(hierarchyFieldName)', async () => {
    const onDrillDown = vi.fn();
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('江苏', ['江苏'], 1, 3)],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={onDrillDown}
        onDrillUp={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('row-header-江苏')).getByTestId('drill-down'));
    expect(onDrillDown).toHaveBeenCalledWith(HIER);
  });

  it('▼ click calls onDrillUp(hierarchyFieldName)', async () => {
    const onDrillUp = vi.fn();
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('南京', ['江苏', '苏南', '南京'], 3, 3)],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={onDrillUp}
      />,
    );
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('row-header-南京')).getByTestId('drill-up'));
    expect(onDrillUp).toHaveBeenCalledWith(HIER);
  });

  it('chevron click stops propagation (does not trigger sort onClick)', () => {
    const onSortClick = vi.fn();
    const onDrillDown = vi.fn();
    const model = makeRenderModel({
      columnHeader: [measureColHeader],
      rowHeader: [makeHierarchyRow('江苏', ['江苏'], 1, 3)],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={onSortClick}
        onDrillDown={onDrillDown}
        onDrillUp={vi.fn()}
      />,
    );
    fireEvent.click(within(screen.getByTestId('row-header-江苏')).getByTestId('drill-down'));
    expect(onDrillDown).toHaveBeenCalled();
    expect(onSortClick).not.toHaveBeenCalled();
  });
});

describe('PivotRenderer — body rendering', () => {
  const bodyModel: RenderModel = {
    columnHeader: [measureColHeader],
    rowHeader: [
      makeHierarchyRow('江苏', ['江苏'], 1, 3),
      makeHierarchyRow('浙江', ['浙江'], 1, 3),
    ],
    matrix: [
      [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: false }],
      [{ value: 600, formattedValue: '600', isEmpty: false, isMasked: false }],
    ],
    grandTotalRow: null,
    columnMeta: [measureColMeta],
    pagination: { totalRowCount: 2 },
  };

  it('renders row-header cells with data-depth attribute', () => {
    render(
      <PivotRenderer
        renderModel={bodyModel}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('row-header-江苏')).toHaveAttribute('data-depth', '0');
    expect(screen.getByTestId('row-header-浙江')).toHaveAttribute('data-depth', '0');
  });

  it('renders data cells with formattedValue', () => {
    render(
      <PivotRenderer
        renderModel={bodyModel}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cell-r0-c0')).toHaveTextContent('1,000');
    expect(screen.getByTestId('cell-r1-c0')).toHaveTextContent('600');
  });

  it('renders empty cell text for sparse-fill EMPTY_CELL', () => {
    const m: RenderModel = {
      ...bodyModel,
      matrix: [[EMPTY_CELL]],
      rowHeader: [bodyModel.rowHeader[0]!],
    };
    render(
      <PivotRenderer
        renderModel={m}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cell-r0-c0')).toHaveAttribute('data-empty', 'true');
  });

  it('renders *** with data-masked for masked cells', () => {
    const m: RenderModel = {
      ...bodyModel,
      matrix: [
        [{ value: 1000, formattedValue: '1,000', isEmpty: false, isMasked: true }],
      ],
      rowHeader: [bodyModel.rowHeader[0]!],
    };
    render(
      <PivotRenderer
        renderModel={m}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('cell-r0-c0');
    expect(cell).toHaveAttribute('data-masked', 'true');
    expect(cell).toHaveTextContent('***');
  });

  it('puts full path + measure value in title for hover tooltip', () => {
    const model: RenderModel = {
      ...bodyModel,
      rowHeader: [makeHierarchyRow('南京', ['江苏', '苏南', '南京'], 3, 3)],
      matrix: [[{ value: 300, formattedValue: '300', isEmpty: false, isMasked: false }]],
    };
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cell-r0-c0')).toHaveAttribute(
      'title',
      expect.stringMatching(/江苏.*苏南.*南京.*销售额.*300/),
    );
  });
});

describe('PivotRenderer — grand total', () => {
  it('renders grandTotalRow as a tfoot row when present', () => {
    const model: RenderModel = {
      rowHeader: [makeFlatRow('江苏')],
      columnHeader: [measureColHeader],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      grandTotalRow: [{ value: 9999, formattedValue: '9,999', isEmpty: false, isMasked: false }],
      columnMeta: [measureColMeta],
      pagination: { totalRowCount: 1 },
    };
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    const totalRow = screen.getByTestId('grand-total-row');
    expect(totalRow).toHaveTextContent('总计');
    expect(totalRow).toHaveTextContent('9,999');
  });

  it('does not render grand-total row when grandTotalRow is null', () => {
    const model = makeRenderModel({
      rowHeader: [makeFlatRow('江苏')],
      columnHeader: [measureColHeader],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('grand-total-row')).toBeNull();
  });
});

describe('PivotRenderer — corner 行字段 alias', () => {
  it('rowFieldLabels 传了 → corner 渲染 N 个 th,每个显示对应 level alias', () => {
    // 构造 fullPath length=2 的 row,触发 rowHeaderLevels=2
    const rowNode: RowHeaderNode = {
      ...makeFlatRow('2023Q1'),
      fullPath: ['2023', '2023Q1'],
    };
    const model = makeRenderModel({
      rowHeader: [rowNode],
      columnHeader: [measureColHeader],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
        rowFieldLabels={['销售_年', '销售_季']}
      />,
    );
    expect(screen.getByTestId('pivot-corner-0')).toHaveTextContent('销售_年');
    expect(screen.getByTestId('pivot-corner-1')).toHaveTextContent('销售_季');
  });

  it('rowFieldLabels 不传 → 单个空 corner(老行为,无回归)', () => {
    const model = makeRenderModel({
      rowHeader: [makeFlatRow('江苏')],
      columnHeader: [measureColHeader],
      matrix: [[{ value: 100, formattedValue: '100', isEmpty: false, isMasked: false }]],
      columnMeta: [measureColMeta],
    });
    render(
      <PivotRenderer
        renderModel={model}
        viewConfig={baseViewConfig}
        onSortClick={vi.fn()}
        onDrillDown={vi.fn()}
        onDrillUp={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('pivot-corner-0')).not.toBeInTheDocument();
  });
});
