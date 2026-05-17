/**
 * PivotTable 集成测试 — 场景 B 完整流程
 *
 * 不单测内部（FieldTree/DropZones/PivotRenderer 等已有 unit tests）；
 * 这里只验"4 个零件被正确粘合后能跑通场景 B"。
 *
 * 场景（[phase-p0.md](../../../docs/prd/phase-p0.md) §0）：
 *   1. 默认视图加载（hierarchy 行 + 销售额值，DESC 排序）
 *   2. 点 ▶ 展开"江苏"
 *   3. 点 ▶ 展开"苏南"
 *   4. 点表头切换排序：DESC → ASC
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// mock echarts(jsdom 不支持 canvas;集成测试只验证组件挂载/属性)
vi.mock('echarts', () => ({
  init: () => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}));

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';
import { makeMember as makeBaseMember } from '../../fixtures/cellSet.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { CellSet } from '../../types/cellSet.js';

import { PivotTable } from './PivotTable.js';

const HIER = FIELD_IDS.shipRegionHierarchy;
const MEASURE = FIELD_IDS.salesMeasure;

interface MemberSpec {
  name: string;
  uniqueName: string[];
  level: 'ShipProvince2' | 'ShipRegion2' | 'ShipCity2';
}

/** 测试本地 wrapper:用 spec 简记 hierarchy member,转 fixture/cellSet 通用 makeMember */
function makeMember(spec: MemberSpec) {
  return makeBaseMember({
    name: spec.name,
    uniqueName: spec.uniqueName,
    level: spec.level,
    dimension: HIER,
    fieldName: spec.level, // PivotTable 测试沿用"按 level 名给 fieldName"的约定
  });
}

function makeCellSet(specs: MemberSpec[], values: number[]): CellSet {
  return {
    rowFields: [
      {
        name: HIER,
        define: { _enum: 'LevelField', dimensionName: HIER, levelName: 'ShipProvince2' },
        fieldNames: ['ShipProvince2', 'ShipRegion2', 'ShipCity2'],
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
    rows: specs.map((s) => [makeMember(s)]),
    // 列轴 1 个 measure tuple；每个 tuple 是 Member[]
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
    data: values.map((v, i) => ({
      row: i,
      column: 0,
      value: v,
      formattedValue: v.toLocaleString('en-US'),
    })),
    fieldNameToUniqueId: {},
    totalRowCount: specs.length,
  };
}

const initialViewConfig = buildViewConfig({
  rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
  values: [buildValueField({ measureName: MEASURE })],
  rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
});

describe('PivotTable — 场景 B 完整流程（ADR-004 C2: drill = 改字段集 + 重发 query）', () => {
  // 2026-05-17 测试瘦身（docs/testing-strategy.md §40）:
  //   原本两条 it 完整断言了 query.rows / filters / rowSorts 形态,跟 core 的:
  //     - buildQuery.test.ts:46/60(drillDepth=2/3 → rows.length)
  //     - drillHierarchy.test.ts:21/29/90/98(drill 状态机)
  //     - cycleRowSort.test.ts:38(DESC → ASC)
  //   完全重复。组件层只需要证明"按钮 click → 触发再发 query"的 wiring;
  //   query payload 形态属于 core 职责,不在此重复断言。
  // 公共 cellSet 工厂:返回 province(level 1)+ region(level 2)两层 —
  // 确保 ▶ 和 ▼ 按钮都在 DOM 里
  function csTwoLevel() {
    return makeCellSet(
      [
        { name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' },
        { name: '苏南', uniqueName: ['江苏', '苏南'], level: 'ShipRegion2' },
      ],
      [1000, 600],
    );
  }

  it('drill ▶ click → onQuery 再次被调用 (wiring)', async () => {
    const onQuery = vi.fn().mockResolvedValue(csTwoLevel());
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
          values: [buildValueField({ measureName: MEASURE })],
        })}
        onQuery={onQuery}
      />,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    // 保留 1 条端到端形态契约:hook 把 ViewConfig 喂进 buildQuery 后产出合法 PivotQuery
    expect(onQuery.mock.calls[0]![0]).toMatchObject({ queryType: 'PivotQuery' });
    expect(onQuery.mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) });

    await user.click(
      within(screen.getByTestId('row-header-江苏')).getByTestId('drill-down'),
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
  });

  it('drill ▼ click → onQuery 再次被调用 (wiring)', async () => {
    const onQuery = vi.fn().mockResolvedValue(csTwoLevel());
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 2 })],
          values: [buildValueField({ measureName: MEASURE })],
        })}
        onQuery={onQuery}
      />,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    await user.click(
      within(screen.getByTestId('row-header-苏南')).getByTestId('drill-up'),
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
  });

  it('表头排序 click → onQuery 再次被调用 (wiring)', async () => {
    const onQuery = vi.fn().mockResolvedValue(csTwoLevel());
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
          values: [buildValueField({ measureName: MEASURE })],
          rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
        })}
        onQuery={onQuery}
      />,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId(`column-header-${MEASURE}`));
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
  });
});

describe('PivotTable — empty / refresh', () => {
  it('does not call onQuery when values is empty (shows empty-prompt)', async () => {
    const onQuery = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={onQuery}
      />,
    );
    // 等 empty-prompt 出现 → 此时 effect 已经走完 → onQuery 已有机会被调
    await waitFor(() =>
      expect(screen.getByTestId('pivot-empty-prompt')).toBeInTheDocument(),
    );
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('Toolbar refresh triggers a re-fetch of the current query', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const onQuery = vi.fn().mockResolvedValue(cs);
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={onQuery}
      />,
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-refresh'));
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
  });
});

describe('PivotTable — error → retry', () => {
  it('shows error banner on failure and re-fetches on retry click', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const onQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(cs);

    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={onQuery}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('pivot-error-banner')).toHaveTextContent(/network down/),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('pivot-retry'));
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    expect(onQuery).toHaveBeenCalledTimes(2);
  });
});

describe('PivotTable — 字段树搜索框 (P1.0)', () => {
  it('typing in the search box filters the field tree by alias', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );

    // 默认状态：所有顶级 alias 都可见
    expect(await screen.findByText('销售额')).toBeInTheDocument();
    expect(screen.getByText('发货区域')).toBeInTheDocument();

    // 输入"销售" → 只剩销售额
    const search = screen.getByTestId('field-tree-search');
    const user = userEvent.setup();
    await user.type(search, '销售');
    expect(screen.getByText('销售额')).toBeInTheDocument();
    expect(screen.queryByText('发货区域')).not.toBeInTheDocument();

    // 清空 → 全部回来
    await user.clear(search);
    expect(screen.getByText('发货区域')).toBeInTheDocument();
  });
});

describe('PivotTable — 字段树右键菜单 (P1.0)', () => {
  it('right-click on a Measure field shows menu with "添加到数值区" / "添加到过滤区" enabled and "添加到行区" disabled', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    // 等树渲染好
    const measureNode = await screen.findByText('销售额');
    const measureField = measureNode.closest('[data-field-type]')!;
    // 派发右键
    measureField.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 60 }),
    );
    // 菜单应出现
    expect(await screen.findByTestId('context-menu')).toBeInTheDocument();
    // 数值区 enabled，行/列/筛选 disabled
    expect(screen.getByTestId('context-menu-item-add-value')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByTestId('context-menu-item-add-row')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByTestId('context-menu-item-add-column')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // P1.0: Measure 现在也允许放进 filter（→ measureFilters / top-N）
    expect(screen.getByTestId('context-menu-item-add-filter')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clicking "添加到行区" on a Hierarchy adds it to rows and closes menu', async () => {
    const onQuery = vi.fn().mockResolvedValue(makeCellSet([], []));
    const onChange = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onChange={onChange}
        onQuery={onQuery}
      />,
    );
    const hierNode = (await screen.findByText('发货区域')).closest('[data-field-type]')!;
    hierNode.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 0, clientY: 0 }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('context-menu-item-add-row'));
    // viewConfig 更新：rows 应包含 hierarchy
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last.rows.some((r: { fieldName: string }) => r.fieldName === HIER)).toBe(true);
    // 菜单消失
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('clicking outside menu closes it without adding anything', async () => {
    const onChange = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onChange={onChange}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const measureField = (await screen.findByText('销售额')).closest('[data-field-type]')!;
    measureField.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 0, clientY: 0 }),
    );
    expect(await screen.findByTestId('context-menu')).toBeInTheDocument();
    // 点击外部
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitFor(() =>
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument(),
    );
    // viewConfig 不应被改（onChange 可能在初始 hydrate 时被调过，这里只检查 values 没增加）
    const lastValues = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]?.values ?? [];
    expect(lastValues).toEqual([]);
  });
});

describe('PivotTable — 我的字段:范围/分组 先选 base 字段', () => {
  // fixture orderModel 没有数值维度字段 → numericDimensionFields=[] → + 范围 disabled
  // 故 picker 行为测试改用 + 分组(用 dimensionFields,fixture 有维度字段)
  // + 范围 disabled 行为单独一个 case 覆盖

  const DIM_FIELD = 'ShipProvince2'; // orderModel 里的维度

  it('点 "+ 分组" → 弹 picker 列出维度字段(不直接打开 editor)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        loadMembers={() => Promise.resolve([])}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    expect(screen.queryByTestId('base-field-picker')).not.toBeInTheDocument();

    // 2026-05-16:4 个 add 按钮合并成 `+ 新建 ▾` popover,需先点 trigger 展开
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    await user.click(screen.getByTestId('my-fields-add-enum'));
    expect(screen.getByTestId('base-field-picker')).toBeInTheDocument();
    expect(screen.getByTestId(`base-field-picker-pick-${DIM_FIELD}`)).toBeInTheDocument();
  });

  it('点 picker × 按钮 → modal 关闭', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        loadMembers={() => Promise.resolve([])}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    await user.click(screen.getByTestId('my-fields-add-enum'));
    expect(screen.getByTestId('base-field-picker')).toBeInTheDocument();
    await user.click(screen.getByTestId('base-field-picker-cancel'));
    expect(screen.queryByTestId('base-field-picker')).not.toBeInTheDocument();
  });

  it('picker 里点字段 → 关 picker 并打开 EnumGroupEditor', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        loadMembers={() => Promise.resolve([])}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    await user.click(screen.getByTestId('my-fields-add-enum'));
    await user.click(screen.getByTestId(`base-field-picker-pick-${DIM_FIELD}`));
    expect(screen.queryByTestId('base-field-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('enum-editor')).toBeInTheDocument();
  });

  it('+ 范围 在数据集无数值维度时 popover 菜单项 disabled(本质 CASE WHEN 表达式,需要行级数值字段)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    // orderModel 里所有数值字段都是 type=MEASURE,没有数值维度 → 范围 菜单项 disabled
    expect(screen.getByTestId('my-fields-add-range')).toBeDisabled();
  });

  // 2026-05-16:"+ 度量"按钮已拆成"+ 计算度量"+"+ 计算列"两个入口(都在 + 新建 popover 里)
  it('"+ 新建 → 计算度量"(formula 不绑字段)→ 直接打开 expr editor,不弹 picker', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    await user.click(screen.getByTestId('my-fields-add-calc-measure'));
    expect(screen.queryByTestId('base-field-picker')).not.toBeInTheDocument();
    const editor = screen.getByTestId('expr-editor');
    expect(editor).toBeInTheDocument();
    // 入口预设 kind=calc_measure → 标题显示"新建计算度量",且 kind radio 不再渲染
    // (defaultKind 已定,无需用户在 modal 再切类别)
    expect(editor.textContent).toContain('新建计算度量');
    expect(screen.queryByTestId('expr-editor-kind-row')).not.toBeInTheDocument();
  });

  it('"+ 新建 → 计算列"→ 直接打开 expr editor,kind 默认 calc_column', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-add-trigger'));
    await user.click(screen.getByTestId('my-fields-add-calc-column'));
    const editor = screen.getByTestId('expr-editor');
    expect(editor).toBeInTheDocument();
    expect(editor.textContent).toContain('新建计算列');
    expect(screen.queryByTestId('expr-editor-kind-row')).not.toBeInTheDocument();
  });
});

describe('PivotTable — 自建字段拖拽闭环 (P2)', () => {
  it('我的字段 item 渲染时带 draggable=true 和正确的 fieldType', () => {
    const initialVc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      customFields: [
        {
          id: 'cm_test',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '0.00%',
          expression: '[销售额_1624531356707]/[销售额_1624531356707]',
          ast: null,
        },
        {
          id: 'eg_test',
          name: '区域分组',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [{ label: '华东', members: ['江苏'] }],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialVc}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    // calc_measure → fieldType=UserCalcMeasure
    const cmItem = screen.getByTestId('my-fields-item-cm_test');
    expect(cmItem).toHaveAttribute('draggable', 'true');
    expect(cmItem).toHaveAttribute('data-field-type', 'UserCalcMeasure');
    // enum_group → fieldType=EnumGroup
    const egItem = screen.getByTestId('my-fields-item-eg_test');
    expect(egItem).toHaveAttribute('draggable', 'true');
    expect(egItem).toHaveAttribute('data-field-type', 'EnumGroup');
  });

  // 2026-05-16:my-fields chip 加了 ✎ 编辑按钮,点击打开对应 editor 带 initialField
  it('点 ✎ 编辑按钮(calc_measure)→ 打开 expr-editor + 标题"编辑计算度量"', async () => {
    const initialVc = buildViewConfig({
      customFields: [
        {
          id: 'cm_edit',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '0.00%',
          expression: '[销售额]/[成本]',
          ast: {
            type: 'binop', op: '/',
            left: { type: 'field', name: '销售额' },
            right: { type: 'field', name: '成本' },
          },
        },
      ],
    });
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialVc}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-edit-cm_edit'));
    const editor = screen.getByTestId('expr-editor');
    expect(editor.textContent).toContain('编辑计算度量');
    // 表达式 textarea 预填 initialField.expression
    expect((screen.getByTestId('expr-editor-textarea') as HTMLTextAreaElement).value).toBe(
      '[销售额]/[成本]',
    );
  });

  it('点 ✎ 编辑按钮(enum_group)→ 打开 enum-editor 带 initialField + baseField', async () => {
    const initialVc = buildViewConfig({
      customFields: [
        {
          id: 'eg_edit',
          name: '区域分组',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [{ label: '华东', members: ['江苏'] }],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialVc}
        loadMembers={() => Promise.resolve([])}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-fields-edit-eg_edit'));
    // enum-editor 打开,base picker 不应弹(已经有 baseField 不用选)
    expect(screen.queryByTestId('base-field-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('enum-editor')).toBeInTheDocument();
  });

  it('拖 calc_measure 自建字段到数值区 → viewConfig.values 追加,query 不抛(validators 接受 customField id)', async () => {
    const initialVc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: HIER, drillDepth: 1 })],
      values: [buildValueField({ measureName: MEASURE })],
      customFields: [
        {
          id: 'cm_profit',
          name: '利润率',
          kind: 'calc_measure',
          dataFormat: '0.00%',
          expression: '[a]/[b]',
          ast: null,
        },
      ],
    });
    const onChange = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        value={initialVc}
        onChange={onChange}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    // 模拟 dragstart from my-fields → drop on value zone
    const cmItem = screen.getByTestId('my-fields-item-cm_profit');
    const data = new Map<string, string>();
    fireEvent.dragStart(cmItem, {
      dataTransfer: {
        setData: (k: string, v: string) => data.set(k, v),
        getData: (k: string) => data.get(k) ?? '',
        effectAllowed: '',
      },
    });
    // 模拟 drop on zone-value
    fireEvent.drop(screen.getByTestId('zone-value'), {
      dataTransfer: { getData: (k: string) => data.get(k) ?? '' },
    });
    // onChange 应该 fire,新 viewConfig 的 values 含 cm_profit
    expect(onChange).toHaveBeenCalled();
    const lastVc = onChange.mock.calls.at(-1)![0];
    expect(lastVc.values.map((v: { measureName: string }) => v.measureName)).toContain('cm_profit');
  });

  it('拖 enum_group 自建字段到行轴 → viewConfig.rows 追加', async () => {
    const initialVc = buildViewConfig({
      rows: [],
      values: [buildValueField({ measureName: MEASURE })],
      customFields: [
        {
          id: 'eg_region',
          name: '区域分组',
          kind: 'enum_group',
          baseField: 'ShipProvince2',
          groups: [{ label: '华东', members: ['江苏'] }],
          ungroupedHandling: 'show_individually',
        },
      ],
    });
    const onChange = vi.fn();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        value={initialVc}
        onChange={onChange}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const egItem = screen.getByTestId('my-fields-item-eg_region');
    const data = new Map<string, string>();
    fireEvent.dragStart(egItem, {
      dataTransfer: {
        setData: (k: string, v: string) => data.set(k, v),
        getData: (k: string) => data.get(k) ?? '',
        effectAllowed: '',
      },
    });
    fireEvent.drop(screen.getByTestId('zone-row'), {
      dataTransfer: { getData: (k: string) => data.get(k) ?? '' },
    });
    expect(onChange).toHaveBeenCalled();
    const lastVc = onChange.mock.calls.at(-1)![0];
    expect(lastVc.rows.map((r: { fieldName: string }) => r.fieldName)).toContain('eg_region');
  });
});

describe('PivotTable — 图表模式 (P3+)', () => {
  const cs = makeCellSet(
    [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
    [1000],
  );

  it('默认 displayMode=table → 渲染 PivotRenderer 表格,不渲染 ChartRenderer', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    expect(screen.queryByTestId('chart-renderer')).not.toBeInTheDocument();
  });

  it('点击 toolbar 切换按钮 → 进入图表模式,渲染 ChartRenderer', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    const user = userEvent.setup();
    // segmented control:点"图表"按钮(不是 wrapper)切到 chart 模式
    await user.click(screen.getByTestId('display-mode-chart'));

    expect(screen.getByTestId('chart-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('chart-renderer')).toHaveAttribute('data-chart-type', 'bar');
  });

  it('图表模式下选 chartType=line → ChartRenderer data-chart-type 改 line', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...initialViewConfig,
          pageState: { ...initialViewConfig.pageState, displayMode: 'chart' },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('chart-renderer')).toBeInTheDocument());

    const user = userEvent.setup();
    // 2026-05-16 chartType picker 移到 ChartRenderer 右上角(toolbar 不再有 chartType 控件)
    await user.click(screen.getByTestId('chart-type-line'));

    await waitFor(() =>
      expect(screen.getByTestId('chart-renderer')).toHaveAttribute('data-chart-type', 'line'),
    );
  });

  it('图表模式下不渲染 PivotRenderer 表格(列头不存在)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...initialViewConfig,
          pageState: { ...initialViewConfig.pageState, displayMode: 'chart' },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('chart-renderer')).toBeInTheDocument());
    // 表格的 column-header 不应存在
    expect(screen.queryByTestId(`column-header-${MEASURE}`)).not.toBeInTheDocument();
  });

  // 回归测试 2026-05-16:图表模式下行分页栏不应该出现(图表无 row/column 概念)
  // (列轴分页另有触发条件:cols > pageSize,这里默认 dataset 列数少不会触发,只测行分页)
  it('图表模式下不渲染行分页栏', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...initialViewConfig,
          pageState: { ...initialViewConfig.pageState, displayMode: 'chart' },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('chart-renderer')).toBeInTheDocument());
    // Pagination 用 testid 'pagination-prev'(行分页)/ 'pagination-column-prev'(列分页)
    expect(screen.queryByTestId('pagination-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pagination-column-prev')).not.toBeInTheDocument();
  });

  // 回归测试:表格模式分页栏正常出现(对照组,确认 chart 模式 skip 不会误伤表格模式)
  it('表格模式行分页栏正常显示(对照)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={initialViewConfig}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    expect(screen.getByTestId('pagination-prev')).toBeInTheDocument();
  });
});

describe('PivotTable — controlled mode', () => {
  it('forwards viewConfig changes via onChange when controlled', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const onQuery = vi.fn().mockResolvedValue(cs);
    const onChange = vi.fn();

    render(
      <PivotTable
        metadata={orderModelMetadata}
        value={initialViewConfig}
        onChange={onChange}
        onQuery={onQuery}
      />,
    );

    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());

    // 点表头排序切换
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`column-header-${MEASURE}`));

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(lastCall.rowSorts[0]).toMatchObject({ direction: 'ASC' });
  });
});

// ============================================================
// P5+ customField 在用 checkbox(my-fields 区)
// 跟 FieldTree 的 checkbox 同语义,但取消勾选只删 zone 引用,不删 customField 本身
// ============================================================
describe('PivotTable — customField checkbox(my-fields 区)', () => {
  it('刚建的 calc_measure(没拖到 zone)→ checkbox 未勾', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField()], // 必须有 measure 否则 query 不发
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-checkbox-cm1')).not.toBeChecked();
  });

  it('customField 已被引用(values 含 cf.id)→ checkbox 勾上', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField({ measureName: 'cm1' })], // 引用 cf.id
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-checkbox-cm1')).toBeChecked();
  });

  it('点未勾 → 自动加进 value(走双击规则:UserCalcMeasure → value)', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField()],
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    fireEvent.click(screen.getByTestId('my-fields-checkbox-cm1'));
    // 现在勾上 — viewConfig.values 应该多了一条引用 cm1
    expect(screen.getByTestId('my-fields-checkbox-cm1')).toBeChecked();
  });

  it('点已勾(usage=1)→ 从 zone 删,但 customField 自身仍在 my-fields 区', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField({ measureName: 'cm1' })],
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-checkbox-cm1')).toBeChecked();
    fireEvent.click(screen.getByTestId('my-fields-checkbox-cm1'));
    // checkbox 变未勾,但 my-fields chip 还在(customField 本体保留)
    expect(screen.getByTestId('my-fields-checkbox-cm1')).not.toBeChecked();
    expect(screen.getByTestId('my-fields-item-cm1')).toBeInTheDocument();
  });

  it('usage>=2(同字段在多 zone)→ checkbox disabled,tooltip 提示走 ×', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        // calc_measure cm1 同时在 values + measureFilters → usage=2
        defaultValue={buildViewConfig({
          values: [buildValueField({ measureName: 'cm1' })],
          measureFilters: [
            { kind: 'leaf', measureName: 'cm1', operator: 'GreaterThan', value: 0 },
          ],
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const cb = screen.getByTestId('my-fields-checkbox-cm1');
    expect(cb).toBeChecked();
    expect(cb).toBeDisabled();
    expect(cb).toHaveAttribute('title', expect.stringContaining('多个区域'));
  });

  it('×(删除 customField)跟 checkbox 取消勾选语义不同 — × 删 cf 本体', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField({ measureName: 'cm1' })],
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-item-cm1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('my-fields-remove-cm1'));
    // × 后 cf 本体不在
    expect(screen.queryByTestId('my-fields-item-cm1')).not.toBeInTheDocument();
  });

  it('dim_as_measure 创建即用 → 默认就 checked(因为创建时同步加进 values)', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          values: [buildValueField({ measureName: 'dam1' })],
          customFields: [
            {
              id: 'dam1',
              name: '销售员(COUNT_DISTINCT)',
              kind: 'dim_as_measure',
              sourceField: '销售员',
              aggregator: 'COUNT_DISTINCT',
              dataFormat: '',
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-checkbox-dam1')).toBeChecked();
  });

  it('adhoc 模式 → checkbox disabled(自建字段 adhoc 不支持)', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
          values: [buildValueField()],
          queryMode: 'adhoc',
          customFields: [
            {
              id: 'cm1',
              name: '比率',
              kind: 'calc_measure',
              dataFormat: '',
              expression: '[a]/[b]',
              ast: null,
            },
          ],
        })}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.getByTestId('my-fields-checkbox-cm1')).toBeDisabled();
  });
});

// ============================================================
// P5+ Excel 全量导出(场景 4)— 重 fetch 大页 + xlsx blob
// ============================================================
describe('PivotTable — Excel 全量导出', () => {
  it('点 toolbar 导出 Excel → 用 exportMaxRows 调 onQuery 拿全量,触发下载', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const onQuery = vi.fn().mockResolvedValue(cs);
    // jsdom 没实现 createObjectURL/revokeObjectURL — 直接挂上 mock
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;

    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
          values: [buildValueField()],
          pageState: {
            ...buildViewConfig().pageState,
            exportMaxRows: 5000,
          },
        })}
        onQuery={onQuery}
      />,
    );
    // 等首次查询完成
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    // 2026-05-16:导出按钮合并 — 点 toolbar-export 弹 popover → 默认选中 Excel → 点导出按钮
    await user.click(screen.getByTestId('toolbar-export'));
    await user.click(screen.getByTestId('toolbar-export-confirm'));

    // 第二次 onQuery 调用 = 导出 fetch,rowPageSize = exportMaxRows
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    const secondCall = onQuery.mock.calls[1]![0] as { pageSettings: { rowPageSize: number; rowPageNo: number } };
    expect(secondCall.pageSettings.rowPageSize).toBe(5000);
    expect(secondCall.pageSettings.rowPageNo).toBe(1);

    // 确实触发下载(createObjectURL 被调)
    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it('exportMaxRows 未设 → 默认 10000', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const onQuery = vi.fn().mockResolvedValue(cs);
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();

    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
          values: [buildValueField()],
        })}
        onQuery={onQuery}
      />,
    );
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));

    const user2 = userEvent.setup();
    await user2.click(screen.getByTestId('toolbar-export'));
    await user2.click(screen.getByTestId('toolbar-export-confirm'));
    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(2));
    const secondCall = onQuery.mock.calls[1]![0] as { pageSettings: { rowPageSize: number } };
    expect(secondCall.pageSettings.rowPageSize).toBe(10000);

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  // 2026-05-16:exportMaxRows 输入从 settings modal 移到 toolbar 的导出 popover 里
  it('导出 popover 可改 exportMaxRows', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig({
          rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
          values: [buildValueField()],
        })}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-export'));
    const input = screen.getByTestId('toolbar-export-rows-input') as HTMLInputElement;
    expect(input).toHaveValue(10000);
    fireEvent.change(input, { target: { value: '20000' } });
    expect(input).toHaveValue(20000);
  });
});

// ============================================================
// P5+ 三面板可见性 — 工具栏 / 字段面板 / 字段树
// 默认全可见;每个 panel header 的 × 收起 + edge handle 重展开 + 设置面板 checkbox
// ============================================================
describe('PivotTable — 三面板可见性', () => {
  // localStorage 在测试间会污染:每个 case 前清掉,避免上次跑遗留偏好影响默认值
  // try/catch 因为某些 jsdom 版本的 localStorage shim 不是完整 Storage 实现,直接调可能 throw
  beforeEach(() => {
    try {
      localStorage.removeItem('pivot-table-panel-visibility');
    } catch {
      // 测试环境不可写 → 默认状态依赖测试声明顺序保证
    }
  });

  // 清里避免污染后续 describe block(如翻页 UI 模式)
  afterEach(() => {
    try {
      localStorage.removeItem('pivot-table-panel-visibility');
    } catch {
      // 同上
    }
  });

  it('默认 — 工具栏 / 字段面板 / 字段树 全部可见', () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const root = screen.getByTestId('pivot-table');
    expect(root.getAttribute('data-toolbar-visible')).toBe('true');
    expect(root.getAttribute('data-field-panel-visible')).toBe('true');
    expect(root.getAttribute('data-field-tree-visible')).toBe('true');
    expect(screen.getByTestId('toolbar-refresh')).toBeInTheDocument();
  });

  it('字段面板 header 的 × → 字段面板隐藏 + 出现 edge handle', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    expect(screen.queryByTestId('edge-handle-field-panel')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('panel-close-field-panel'));
    expect(screen.getByTestId('pivot-table').getAttribute('data-field-panel-visible')).toBe(
      'false',
    );
    expect(screen.getByTestId('edge-handle-field-panel')).toBeInTheDocument();
  });

  it('edge handle 点击 → 对应面板重新展开', async () => {
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={buildViewConfig()}
        onQuery={vi.fn().mockResolvedValue(makeCellSet([], []))}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('panel-close-field-tree'));
    expect(screen.getByTestId('pivot-table').getAttribute('data-field-tree-visible')).toBe(
      'false',
    );
    await user.click(screen.getByTestId('edge-handle-field-tree'));
    expect(screen.getByTestId('pivot-table').getAttribute('data-field-tree-visible')).toBe(
      'true',
    );
  });

  // 2026-05-16:"通过设置面板隐藏工具栏"的 flow 删了("面板显示"行冗余);
  // togglePanel API 仍存(localStorage / programmatic 控制),UI 入口待后续 Toolbar 加 × 按钮
});

// ============================================================
// P5+ 翻页 UI 模式 — 翻页器 / 滚动加载(隐藏底部分页栏)
// 验证 settings modal 里的 radio 切换 + 主区 Pagination 是否按预期显示/隐藏
// ============================================================
describe('PivotTable — 翻页 UI 模式(分页器 / 滚动加载)', () => {
  // localStorage 在测试间会污染:每个 case 前清掉,避免三面板可见性测试遗留的偏好影响默认值
  beforeEach(() => {
    try {
      localStorage.removeItem('pivot-table-panel-visibility');
    } catch {
      // 测试环境不可写 — 默认状态依赖测试声明顺序保证
    }
  });

  // 一个有数据的最小 viewConfig — 让 PivotTable 渲染主区(包括分页栏)
  function makeViewConfigWithData() {
    return buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
    });
  }

  it('默认(paginationMode 未设)→ 行分页栏渲染', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={makeViewConfigWithData()}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument(),
    );
  });

  it('paginationMode=scroll → 行分页栏不渲染', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...makeViewConfigWithData(),
          pageState: {
            ...makeViewConfigWithData().pageState,
            paginationMode: 'scroll',
          },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    // 等表格渲染出来,确认分页栏没出现
    await waitFor(() => {
      expect(screen.queryByTestId('pagination-prev')).not.toBeInTheDocument();
    });
  });

  it('paged 模式 → 不渲染 scroll sentinel', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={makeViewConfigWithData()}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('pivot-scroll-sentinel')).not.toBeInTheDocument();
  });

  it('scroll 模式 → 渲染底部 sentinel(state=idle 表示有更多)', async () => {
    // 服务端总行数 = 100,本页只 1 行 → hasMore=true,sentinel data-state="idle"
    const baseCs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const cs = { ...baseCs, totalRowCount: 100 };
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...makeViewConfigWithData(),
          pageState: { ...makeViewConfigWithData().pageState, paginationMode: 'scroll' },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => {
      const sentinel = screen.queryByTestId('pivot-scroll-sentinel');
      expect(sentinel).toBeInTheDocument();
      expect(sentinel!.getAttribute('data-state')).toBe('idle');
    });
  });

  it('scroll 模式 + 已全部加载 → sentinel 显示"已全部加载"', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    ); // totalRowCount = 1 = rows.length → no more
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={{
          ...makeViewConfigWithData(),
          pageState: { ...makeViewConfigWithData().pageState, paginationMode: 'scroll' },
        }}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => {
      const sentinel = screen.queryByTestId('pivot-scroll-sentinel');
      expect(sentinel).toBeInTheDocument();
      expect(sentinel!.getAttribute('data-state')).toBe('done');
      expect(sentinel!.textContent).toContain('已全部加载');
    });
  });

  // 2026-05-16:浏览态沉浸视图 — 隐藏"已全部加载"系统提示(sentinel div 保留)
  it('浏览态 + 已全部加载 → sentinel 存在但文案为空(不显示"已全部加载")', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    const user = userEvent.setup();
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={makeViewConfigWithData()}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() => expect(screen.getByText('江苏')).toBeInTheDocument());
    // 进入浏览态(toolbar 上的"浏览"按钮)
    await user.click(screen.getByTestId('toolbar-browse'));

    await waitFor(() => {
      const sentinel = screen.queryByTestId('pivot-scroll-sentinel');
      expect(sentinel).toBeInTheDocument();
      // browseMode 自动切到 scroll 模式;hasMore=false → 应该是 'done',但文案隐藏
      expect(sentinel!.getAttribute('data-state')).toBe('done');
      expect(sentinel!.textContent).not.toContain('已全部加载');
    });
  });

  it('设置面板:点"滚动加载" → 分页栏消失;点"翻页器" → 分页栏回来', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={makeViewConfigWithData()}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    // 打开设置 tab(2026-05-16 从 modal 改 inline tab)
    await user.click(screen.getByTestId('settings-tab-options'));
    expect(screen.getByTestId('settings-paginationMode')).toBeInTheDocument();

    // 默认 paged 选中
    expect(screen.getByTestId('settings-paginationMode-paged')).toHaveAttribute(
      'data-active',
      'true',
    );

    // 切到 scroll
    await user.click(screen.getByTestId('settings-paginationMode-scroll'));
    expect(screen.getByTestId('settings-paginationMode-scroll')).toHaveAttribute(
      'data-active',
      'true',
    );
    await waitFor(() =>
      expect(screen.queryByTestId('pagination-prev')).not.toBeInTheDocument(),
    );

    // 切回 paged
    await user.click(screen.getByTestId('settings-paginationMode-paged'));
    await waitFor(() =>
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument(),
    );
  });

  it('点 toolbar 浏览按钮 → 进入浏览模式后行分页栏不渲染(回归保护:之前漏判 browseMode)', async () => {
    const cs = makeCellSet(
      [{ name: '江苏', uniqueName: ['江苏'], level: 'ShipProvince2' }],
      [1000],
    );
    render(
      <PivotTable
        metadata={orderModelMetadata}
        defaultValue={makeViewConfigWithData()}
        onQuery={vi.fn().mockResolvedValue(cs)}
      />,
    );
    // 默认 paged 模式 → 分页栏存在
    await waitFor(() =>
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument(),
    );
    // 点工具栏"浏览"
    await userEvent.setup().click(screen.getByTestId('toolbar-browse'));
    // 浏览模式下分页栏应隐藏 — 即使 viewConfig.paginationMode 仍是 'paged'
    await waitFor(() =>
      expect(screen.queryByTestId('pagination-prev')).not.toBeInTheDocument(),
    );
  });
});
