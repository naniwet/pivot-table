/**
 * DropZones 组件测试
 *
 * 范围（P0，[phase-p0.md](../../../prd/phase-p0.md) §2）：
 *   - 4 个 zone：行轴 / 列轴 / 数值 / 筛选（filter P0 显示但不可放）
 *   - 已存在字段以 alias 渲染（用 metadata 解析）
 *   - draggingFieldType 给定时：合法 zone data-can-drop="true"，非法 "false" + title tooltip
 *   - drop 事件：合法组合 → onDrop(zone, fieldName, fieldType)；非法 → 不调
 *   - × 按钮 → onRemove(zone, fieldName)
 *
 * 不在 P0 范围（不测）：
 *   - 区内字段重排（决定嵌套层级）— P0 仅顺序追加
 *   - 字段已删除/重命名的红色边框（依赖 metadata diff，P0 stub）
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import { PIVOT_FIELD_MIME } from '../../core/dropRules/dragProtocol.js';
import type { FieldType } from '../../core/dropRules/dropRules.js';

import { DropZones } from './DropZones.js';

function makeDataTransfer(payload: { fieldName: string; fieldType: FieldType } | null) {
  return {
    getData: (key: string) =>
      payload && key === PIVOT_FIELD_MIME ? JSON.stringify(payload) : '',
    setData: vi.fn(),
    types: payload ? [PIVOT_FIELD_MIME] : [],
    dropEffect: 'move',
    effectAllowed: 'move',
  };
}

describe('DropZones — rendering', () => {
  it('renders four zone labels (行轴 / 列轴 / 数值 / 筛选)', () => {
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('行轴')).toBeInTheDocument();
    expect(screen.getByText('列轴')).toBeInTheDocument();
    expect(screen.getByText('数值')).toBeInTheDocument();
    expect(screen.getByText('筛选')).toBeInTheDocument();
  });

  it('renders existing row/column/value fields by alias (resolved from metadata)', () => {
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: FIELD_IDS.shipRegionHierarchy })],
      values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const rowZone = screen.getByTestId('zone-row');
    expect(within(rowZone).getByText('发货区域')).toBeInTheDocument(); // alias not name
    const valueZone = screen.getByTestId('zone-value');
    expect(within(valueZone).getByText('销售额')).toBeInTheDocument();
  });
});

describe('DropZones — drag highlighting', () => {
  it('marks data-can-drop on each zone according to canDrop(draggingFieldType, zone)', () => {
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        draggingFieldType="Hierarchy"
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-row')).toHaveAttribute('data-can-drop', 'true');
    expect(screen.getByTestId('zone-column')).toHaveAttribute('data-can-drop', 'true');
    expect(screen.getByTestId('zone-value')).toHaveAttribute('data-can-drop', 'false');
    expect(screen.getByTestId('zone-filter')).toHaveAttribute('data-can-drop', 'true'); // P1.0 开放
  });

  it('omits data-can-drop when no drag in progress', () => {
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-row')).not.toHaveAttribute('data-can-drop');
    expect(screen.getByTestId('zone-value')).not.toHaveAttribute('data-can-drop');
  });

  it('shows reason tooltip (title attr) on greyed zones', () => {
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        draggingFieldType="Hierarchy"
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-value')).toHaveAttribute(
      'title',
      expect.stringMatching(/Hierarchy/),
    );
  });
});

describe('DropZones — drop handling', () => {
  it('calls onDrop with (zone, fieldName, fieldType, insertIdx) on a valid drop', () => {
    const onDrop = vi.fn();
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onDrop={onDrop}
        onRemove={vi.fn()}
      />,
    );
    const dataTransfer = makeDataTransfer({ fieldName: 'h1', fieldType: 'Hierarchy' });
    fireEvent.drop(screen.getByTestId('zone-row'), { dataTransfer });
    // 没先 dragOver → dropTargetIdx=null → 第 4 参 undefined(applyDrop fallback 末尾)
    // P3+ 第 5 参 = extra(sourceZone/chipKey),字段树拖入时两者都 undefined
    expect(onDrop).toHaveBeenCalledWith('row', 'h1', 'Hierarchy', undefined, {
      sourceZone: undefined,
      chipKey: undefined,
    });
  });

  it('does NOT call onDrop on an invalid drop (canDrop=false)', () => {
    const onDrop = vi.fn();
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onDrop={onDrop}
        onRemove={vi.fn()}
      />,
    );
    const dataTransfer = makeDataTransfer({ fieldName: 'm1', fieldType: 'Measure' });
    fireEvent.drop(screen.getByTestId('zone-row'), { dataTransfer });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('does NOT call onDrop on missing/malformed payload', () => {
    const onDrop = vi.fn();
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onDrop={onDrop}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.drop(screen.getByTestId('zone-row'), { dataTransfer: makeDataTransfer(null) });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('preventDefault is called on dragOver when canDrop is true (allows drop visual)', () => {
    render(
      <DropZones
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        draggingFieldType="Hierarchy"
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const dataTransfer = makeDataTransfer({ fieldName: 'h1', fieldType: 'Hierarchy' });
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    const handled = !screen.getByTestId('zone-row').dispatchEvent(event);
    // 当 canDrop=true 时，handler 调 preventDefault → dispatchEvent 返回 false
    expect(handled).toBe(true);
  });
});

describe('DropZones — remove field', () => {
  it('calls onRemove(zone, fieldName) when × clicked', async () => {
    const onRemove = vi.fn();
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: FIELD_IDS.shipRegionHierarchy })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={onRemove}
      />,
    );
    const user = userEvent.setup();
    const removeBtn = screen.getByTestId(`remove-row-${FIELD_IDS.shipRegionHierarchy}`);
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('row', FIELD_IDS.shipRegionHierarchy);
  });

  it('renders remove button for value zone with measureName', async () => {
    const onRemove = vi.fn();
    const vc = buildViewConfig({
      values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={onRemove}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`remove-value-${FIELD_IDS.salesMeasure}`));
    expect(onRemove).toHaveBeenCalledWith('value', FIELD_IDS.salesMeasure);
  });
});

describe('DropZones — Σ 度量名称 虚拟字段 (P3)', () => {
  it('values 非空 + 无显式 MeasureGroupName → 列轴末尾隐式显示 Σ chip', () => {
    const vc = buildViewConfig({
      values: [buildValueField({ measureName: 'sales' })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Σ 度量名称')).toBeInTheDocument();
    // 该 chip 在 column zone 中
    const colZone = screen.getByTestId('zone-column');
    expect(colZone).toContainElement(screen.getByText('Σ 度量名称'));
  });

  it('values 为空 → 不显示 Σ chip', () => {
    const vc = buildViewConfig({});
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText('Σ 度量名称')).not.toBeInTheDocument();
  });

  it('显式把 MeasureGroupName 拖到行 → Σ chip 显示在行轴', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: '__measure_axis__', type: 'MeasureGroupName' }],
      values: [buildValueField({ measureName: 'sales' })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const rowZone = screen.getByTestId('zone-row');
    expect(rowZone).toContainElement(screen.getByText('Σ 度量名称'));
    // 此时 column 区不再隐式追加
    const colZone = screen.getByTestId('zone-column');
    expect(colZone).not.toContainElement(screen.getByText('Σ 度量名称'));
  });
});

describe('DropZones — zone 间互拖 (P2)', () => {
  it('tag 上 dragstart 触发 onTagDragStart(fieldType) 通知父级 highlight 目标 zone', () => {
    const onTagDragStart = vi.fn();
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
        onTagDragStart={onTagDragStart}
      />,
    );
    const tag = document.querySelector('[data-field-tag="A"]')!;
    fireEvent.dragStart(tag);
    expect(onTagDragStart).toHaveBeenCalledWith('Dimension');
  });

  it('tag 上 dragstart 写入 PIVOT_FIELD_MIME 数据（zone 间互拖核心机制）', () => {
    const vc = buildViewConfig({
      values: [buildValueField({ measureName: 'sales' })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
        onTagDragStart={vi.fn()}
      />,
    );
    const tag = document.querySelector('[data-field-tag="sales"]')!;
    let captured: { type: string; data: string } | null = null;
    const setData = (type: string, data: string) => {
      captured = { type, data };
    };
    // 模拟 dataTransfer
    fireEvent.dragStart(tag, {
      dataTransfer: { setData, effectAllowed: 'move' },
    });
    expect(captured).not.toBeNull();
    expect(captured!.data).toContain('sales');
    expect(captured!.data).toContain('Measure');
  });

  it('row tag draggable=true（zone 间互拖前提）', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const tag = document.querySelector('[data-field-tag="A"]')!;
    expect(tag).toHaveAttribute('draggable', 'true');
  });
});

describe('DropZones — chip 右键菜单事件 (P2 重构)', () => {
  it('chip 右键 → onTagContextMenu 收到 (zone, fieldName, fieldType, x, y)', () => {
    const onCtx = vi.fn();
    const vc = buildViewConfig({
      columns: [{ fieldName: 'A', type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
        onTagContextMenu={onCtx}
      />,
    );
    const tag = document.querySelector('[data-field-tag="A"]')!;
    tag.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 80 }),
    );
    expect(onCtx).toHaveBeenCalledWith({
      zone: 'column',
      fieldName: 'A',
      fieldType: 'Dimension',
      x: 50,
      y: 80,
    });
  });

  it('chip 上不再渲染 ↑↓ / ⚙ 按钮（统一走右键菜单）', () => {
    const vc = buildViewConfig({
      columns: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
      values: [buildValueField({ measureName: 'sales' })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
        onTagContextMenu={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('move-up-column-A')).not.toBeInTheDocument();
    expect(screen.queryByTestId('move-down-column-A')).not.toBeInTheDocument();
    expect(screen.queryByTestId('config-value-sales')).not.toBeInTheDocument();
  });
});

describe('DropZones — chip 排序状态箭头 (P2)', () => {
  it('字段未参与排序 → 无箭头', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('tag-sort-A')).not.toBeInTheDocument();
  });

  it('字段在 rowSorts (DESC) → chip 显示 ↓', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      rowSorts: [{ type: 'ByDimension', fieldName: 'A', direction: 'DESC' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const arrow = screen.getByTestId('tag-sort-A');
    expect(arrow).toHaveTextContent('↓');
  });

  it('度量字段 BASC → chip 显示 ↑组', () => {
    const vc = buildViewConfig({
      values: [buildValueField({ measureName: 'sales' })],
      rowSorts: [{ type: 'ByMeasure', measureName: 'sales', direction: 'BASC' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const arrow = screen.getByTestId('tag-sort-sales');
    expect(arrow).toHaveTextContent('↑组');
  });
});

describe('DropZones — P5+ 数据类型 icon badge', () => {
  it('数值字段 chip → data-type=numeric(CSS ::before 渲染 #)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: FIELD_IDS.salesMeasure, type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const badge = screen.getByTestId(`tag-type-${FIELD_IDS.salesMeasure}`);
    expect(badge.getAttribute('data-type')).toBe('numeric');
    expect(badge.getAttribute('title')).toContain('数值');
  });

  it('字符串字段 chip → data-type=text(CSS ::before 渲染 Aa)', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const badge = screen.getByTestId(`tag-type-${FIELD_IDS.provinceLevel}`);
    expect(badge.getAttribute('data-type')).toBe('text');
    expect(badge.getAttribute('title')).toContain('文本');
  });

  it('Σ 度量名称 sentinel chip → 不渲染 badge', () => {
    const vc = buildViewConfig({
      values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('tag-type-__measure_axis__')).toBeNull();
  });
});

describe('DropZones — filter zone 递归展开 group (P5+)', () => {
  // 用户场景:OR 包裹两个 year leaf → 之前只渲染顶层 leaf,group 整个被漏 → 筛选区空
  it('viewConfig.filters 是顶层 group → 递归到 leaf 渲染 chip(group 不再被漏)', () => {
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            { kind: 'leaf', field: FIELD_IDS.provinceLevel, operator: 'In', value: ['江苏'] },
            { kind: 'leaf', field: FIELD_IDS.provinceLevel, operator: 'In', value: ['浙江'] },
          ],
        },
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const filterZone = screen.getByTestId('zone-filter');
    // 同 field 多 leaf 去重 → 只 1 个 chip
    const chips = within(filterZone).getAllByText('省份');
    expect(chips).toHaveLength(1);
  });

  it('多 field 嵌套 group → 各 fieldName 各 1 chip(去重保序)', () => {
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'And',
          children: [
            { kind: 'leaf', field: FIELD_IDS.provinceLevel, operator: 'In', value: ['江苏'] },
            {
              kind: 'group',
              op: 'Or',
              children: [
                { kind: 'leaf', field: FIELD_IDS.regionLevel, operator: 'In', value: ['苏南'] },
                { kind: 'leaf', field: FIELD_IDS.regionLevel, operator: 'In', value: ['苏北'] },
              ],
            },
          ],
        },
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const filterZone = screen.getByTestId('zone-filter');
    expect(within(filterZone).getAllByText('省份')).toHaveLength(1);
    expect(within(filterZone).getAllByText('区域')).toHaveLength(1);
  });

  it('删除 × 调 onRemove 传 fieldName(reducer 已递归裁 group 内 leaf)', () => {
    const onRemove = vi.fn();
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            { kind: 'leaf', field: FIELD_IDS.provinceLevel, operator: 'In', value: ['江苏'] },
            { kind: 'leaf', field: FIELD_IDS.provinceLevel, operator: 'In', value: ['浙江'] },
          ],
        },
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByTestId(`remove-filter-${FIELD_IDS.provinceLevel}`));
    expect(onRemove).toHaveBeenCalledWith('filter', FIELD_IDS.provinceLevel);
  });
});

describe('DropZones — P5+ duplicate chip 视觉警告', () => {
  it('row 区同 fieldName 第 2 次 → data-duplicate=true + ⚠ icon', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' },
        { fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }, // 重复
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const rowZone = screen.getByTestId('zone-row');
    const chips = within(rowZone).getAllByText('省份');
    // 第 1 个 chip 不标 duplicate;第 2 个 chip 标 duplicate
    // chip 是 alias text 的 parent <span> — 用 closest 找父
    expect(chips[0]!.closest('[data-field-tag]')!.getAttribute('data-duplicate')).toBeNull();
    expect(chips[1]!.closest('[data-field-tag]')!.getAttribute('data-duplicate')).toBe('true');
    // ⚠ icon 只有第 2 个出现
    const warnings = within(rowZone).queryAllByText('⚠');
    expect(warnings).toHaveLength(1);
  });

  it('value 区同 measure 同 agg(默认)第 2 次 → 标 duplicate', () => {
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: FIELD_IDS.salesMeasure }),
        buildValueField({ measureName: FIELD_IDS.salesMeasure }), // 同 agg=null,qc=null → 重复
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const valueZone = screen.getByTestId('zone-value');
    const warnings = within(valueZone).getAllByText('⚠');
    expect(warnings).toHaveLength(1);
  });

  it('value 区同 measure 不同 agg → 不标 duplicate', () => {
    const vc = buildViewConfig({
      values: [
        buildValueField({ measureName: FIELD_IDS.salesMeasure }),
        buildValueField({ measureName: FIELD_IDS.salesMeasure, aggregator: 'AVG' }),
      ],
    });
    render(
      <DropZones
        viewConfig={vc}
        metadata={orderModelMetadata}
        onDrop={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const valueZone = screen.getByTestId('zone-value');
    expect(within(valueZone).queryByText('⚠')).toBeNull();
  });
});
