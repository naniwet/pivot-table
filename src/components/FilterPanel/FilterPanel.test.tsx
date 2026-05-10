/**
 * FilterPanel 单测(P3 重构后:树编辑器版)
 *
 * 维度筛选 + 度量筛选 各自一棵 FilterTree
 *   - testid 前缀:filter-tree-dim / filter-tree-measure
 *   - leaf renderLeaf 输出:filter-leaf-{op,val,field,pick}-{path}
 *   - 度量 leaf renderLeaf 输出:filter-measure-leaf-{op,val,min,max,field}-{path}
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PIVOT_FIELD_MIME } from '../../core/dropRules/dragProtocol.js';
import {
  buildLeafFilter,
  buildMeasureFilter,
  buildViewConfig,
} from '../../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import { FilterPanel } from './FilterPanel.js';

const PROVINCE = FIELD_IDS.provinceLevel; // STRING 字段
const SALES = FIELD_IDS.salesMeasure; // DOUBLE 字段

/** 模拟拖拽 drop */
function fireDropEvent(target: Element, fieldName: string, fieldType: string) {
  const data = new Map<string, string>();
  data.set(PIVOT_FIELD_MIME, JSON.stringify({ fieldName, fieldType }));
  const event = new Event('drop', { bubbles: true }) as Event & {
    dataTransfer: { getData: (k: string) => string };
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (k: string) => data.get(k) ?? '' },
  });
  target.dispatchEvent(event);
}

describe('FilterPanel — 空状态', () => {
  it('两段都空 → 各自显示 emptyHint', () => {
    render(
      <FilterPanel
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(screen.getByText(/拖维度字段到这里/)).toBeInTheDocument();
    expect(screen.getByText(/拖度量字段到这里/)).toBeInTheDocument();
  });

  it('两段都空 → 不显示重置按钮', () => {
    render(
      <FilterPanel
        viewConfig={buildViewConfig()}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('filter-reset')).not.toBeInTheDocument();
  });
});

describe('FilterPanel — 维度树 leaf 渲染 + 编辑', () => {
  it('单 leaf:渲染 alias / op / value', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: ['江苏'] })],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('filter-leaf-field-0')).toHaveTextContent('省份');
    expect(screen.getByTestId('filter-leaf-op-0')).toHaveValue('In');
    expect(screen.getByTestId('filter-leaf-val-0')).toHaveValue('江苏');
  });

  it('删除 leaf → onChangeFilters 收到去掉该 leaf 的数组', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: ['江苏'] })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    fireEvent.click(screen.getByTestId('filter-tree-dim-remove-0'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('改 value → onChangeFilters 收到新值', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: [] })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    fireEvent.change(screen.getByTestId('filter-leaf-val-0'), {
      target: { value: '江苏,浙江' },
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'leaf', field: PROVINCE, value: ['江苏', '浙江'] }),
    ]);
  });

  it('STRING 字段 op 下拉含 包含/开头是,不含 大于', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: [] })],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    const select = screen.getByTestId('filter-leaf-op-0');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toContain('包含');
    expect(labels).toContain('开头是');
    expect(labels).not.toContain('大于');
  });

  it('DOUBLE 字段 op 下拉含 大于/小于,不含 开头是', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: SALES, operator: 'GreaterThan', value: 1000 })],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    const select = screen.getByTestId('filter-leaf-op-0');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toContain('大于');
    expect(labels).toContain('小于');
    expect(labels).not.toContain('开头是');
  });

  it('数值 operator → input 类型 number,输入解析为 number', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: SALES, operator: 'GreaterThan', value: 0 })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    const input = screen.getByTestId('filter-leaf-val-0');
    expect(input).toHaveAttribute('type', 'number');
    fireEvent.change(input, { target: { value: '1500' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last[0]).toMatchObject({ kind: 'leaf', value: 1500 });
  });

  it('In op → input 类型 text(多值用逗号)', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: [] })],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('filter-leaf-val-0')).toHaveAttribute('type', 'text');
  });

  it('切 op In → GreaterThan 时 value 重置(避免数组传给单值 op)', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: SALES, operator: 'In', value: ['1', '2'] })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    fireEvent.change(screen.getByTestId('filter-leaf-op-0'), {
      target: { value: 'GreaterThan' },
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last[0]).toMatchObject({ operator: 'GreaterThan' });
    expect(last[0].value === '' || last[0].value === null).toBe(true);
  });
});

describe('FilterPanel — 拖拽接收(树编辑器自己处理)', () => {
  it('拖维度字段进维度树 → onChangeFilters 收到追加的 leaf', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({})}
        metadata={orderModelMetadata}
        onChangeFilters={onChange}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-dim'), PROVINCE, 'Dimension');
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'leaf', field: PROVINCE }),
    ]);
  });

  it('拖度量字段进度量树 → onChangeMeasureFilters 收到追加的 leaf', () => {
    const onMeasure = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({})}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onMeasure}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-measure'), SALES, 'Measure');
    expect(onMeasure).toHaveBeenCalledWith([
      expect.objectContaining({ measureName: SALES, operator: 'GreaterThan' }),
    ]);
  });

  it('拖度量字段进维度树 → 不接受(fieldDropToLeaf 返回 null)', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({})}
        metadata={orderModelMetadata}
        onChangeFilters={onChange}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-dim'), SALES, 'Measure');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('拖维度字段进度量树 → 不接受', () => {
    const onMeasure = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({})}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onMeasure}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-measure'), PROVINCE, 'Dimension');
    expect(onMeasure).not.toHaveBeenCalled();
  });
});

describe('FilterPanel — adhoc(明细)模式:Measure 当原始列过滤', () => {
  it('adhoc 模式 → 度量筛选段不渲染(measureFilters 在 adhoc 下被 buildAdhocQuery 清空)', () => {
    render(
      <FilterPanel
        viewConfig={buildViewConfig({ queryMode: 'adhoc' })}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId('filter-panel-section-measure'),
    ).not.toBeInTheDocument();
    // 维度筛选段标题改成"筛选"
    expect(screen.getByText('筛选')).toBeInTheDocument();
    expect(screen.queryByText('维度筛选')).not.toBeInTheDocument();
  });

  it('adhoc 模式 + 拖 Measure 到筛选 → onChangeFilters 收到 leaf,默认 op=GreaterThan', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({ queryMode: 'adhoc' })}
        metadata={orderModelMetadata}
        onChangeFilters={onChange}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-dim'), SALES, 'Measure');
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'leaf',
        field: SALES,
        operator: 'GreaterThan',
      }),
    ]);
  });

  it('pivot 模式 + 拖 Measure 到维度筛选 → 不接受(回归保护)', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={buildViewConfig({})}
        metadata={orderModelMetadata}
        onChangeFilters={onChange}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-dim'), SALES, 'Measure');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FilterPanel — AND/OR 嵌套(group)', () => {
  it('"拆分"leaf → onChangeFilters 收到升格为 OR group 的树', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: ['江苏'] })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    fireEvent.click(screen.getByTestId('filter-tree-dim-wrap-0'));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'group',
        op: 'Or',
        children: expect.arrayContaining([
          expect.objectContaining({ kind: 'leaf', field: PROVINCE }),
        ]),
      }),
    ]);
  });

  it('group 渲染 op select(显示 group.op)', () => {
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            buildLeafFilter({ field: PROVINCE, operator: 'Equals', value: '江苏' }),
            buildLeafFilter({ field: PROVINCE, operator: 'Equals', value: '浙江' }),
          ],
        },
      ],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('filter-tree-dim-op-0')).toHaveValue('Or');
    // 嵌套两个 leaf field 渲染
    expect(screen.getByTestId('filter-leaf-field-0-0')).toHaveTextContent('省份');
    expect(screen.getByTestId('filter-leaf-field-0-1')).toHaveTextContent('省份');
  });

  it('切 group op Or → And', () => {
    const vc = buildViewConfig({
      filters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            buildLeafFilter({ field: PROVINCE, operator: 'Equals', value: '江苏' }),
            buildLeafFilter({ field: PROVINCE, operator: 'Equals', value: '浙江' }),
          ],
        },
      ],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={onChange} />,
    );
    fireEvent.change(screen.getByTestId('filter-tree-dim-op-0'), {
      target: { value: 'And' },
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'group', op: 'And' }),
    ]);
  });
});

describe('FilterPanel — 度量 leaf', () => {
  it('单 leaf:渲染 alias / op / value', () => {
    const vc = buildViewConfig({
      measureFilters: [buildMeasureFilter({ measureName: SALES, operator: 'GreaterThan', value: 1000 })],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(screen.getByTestId('filter-measure-leaf-field-0')).toHaveTextContent('销售额');
    expect(screen.getByTestId('filter-measure-leaf-op-0')).toHaveValue('GreaterThan');
    expect(screen.getByTestId('filter-measure-leaf-val-0')).toHaveValue(1000);
  });

  it('改 op → onChangeMeasureFilters 收到新 op', () => {
    const vc = buildViewConfig({
      measureFilters: [buildMeasureFilter({ measureName: SALES, operator: 'GreaterThan', value: 100 })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-measure-leaf-op-0'), {
      target: { value: 'LessThan' },
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ measureName: SALES, operator: 'LessThan', value: 100 }),
    ]);
  });

  it('改 value → 解析为 number', () => {
    const vc = buildViewConfig({
      measureFilters: [buildMeasureFilter({ measureName: SALES, operator: 'GreaterThan', value: 0 })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-measure-leaf-val-0'), {
      target: { value: '999' },
    });
    expect(onChange.mock.calls[0]![0][0]).toMatchObject({ value: 999 });
  });

  it('删除度量 leaf → onChangeMeasureFilters []', () => {
    const vc = buildViewConfig({
      measureFilters: [buildMeasureFilter({ measureName: SALES })],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-tree-measure-remove-0'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('Between op → 渲染 min/max 两个 input', () => {
    const vc = buildViewConfig({
      measureFilters: [
        buildMeasureFilter({ measureName: SALES, operator: 'Between', value: [100, 1000] }),
      ],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(screen.getByTestId('filter-measure-leaf-min-0')).toHaveValue(100);
    expect(screen.getByTestId('filter-measure-leaf-max-0')).toHaveValue(1000);
    expect(screen.queryByTestId('filter-measure-leaf-val-0')).not.toBeInTheDocument();
  });

  it('改 min → value: [新值, 原最大值]', () => {
    const vc = buildViewConfig({
      measureFilters: [
        buildMeasureFilter({ measureName: SALES, operator: 'Between', value: [100, 1000] }),
      ],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-measure-leaf-min-0'), {
      target: { value: '500' },
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ operator: 'Between', value: [500, 1000] }),
    ]);
  });

  it('从其他 op 切到 Between → value 重置 []', () => {
    const vc = buildViewConfig({
      measureFilters: [
        buildMeasureFilter({ measureName: SALES, operator: 'GreaterThan', value: 100 }),
      ],
    });
    const onChange = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-measure-leaf-op-0'), {
      target: { value: 'Between' },
    });
    expect(onChange.mock.calls[0]![0][0]).toMatchObject({
      operator: 'Between',
      value: [],
    });
  });

  it('度量 op 下拉仅含数值/比较类(不含 In/Like)', () => {
    const vc = buildViewConfig({
      measureFilters: [buildMeasureFilter({ measureName: SALES })],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    const select = screen.getByTestId('filter-measure-leaf-op-0');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toContain('大于');
    expect(labels).toContain('小于');
    expect(labels).not.toContain('包含');
  });
});

describe('FilterPanel — 跨度量 OR(度量树 group)', () => {
  it('度量树 group 渲染 op select', () => {
    const vc = buildViewConfig({
      measureFilters: [
        {
          kind: 'group',
          op: 'Or',
          children: [
            buildMeasureFilter({ measureName: SALES, operator: 'GreaterThan', value: 10000 }),
            buildMeasureFilter({ measureName: SALES, operator: 'LessThan', value: 100 }),
          ],
        },
      ],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        onChangeMeasureFilters={vi.fn()}
      />,
    );
    expect(screen.getByTestId('filter-tree-measure-op-0')).toHaveValue('Or');
  });
});

describe('FilterPanel — 重置', () => {
  it('有过滤条件时显示重置按钮,点击 → 两段都清空', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: ['江苏'] })],
      measureFilters: [buildMeasureFilter({ measureName: SALES })],
    });
    const onF = vi.fn();
    const onM = vi.fn();
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={onF}
        onChangeMeasureFilters={onM}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-reset'));
    expect(onF).toHaveBeenCalledWith([]);
    expect(onM).toHaveBeenCalledWith([]);
  });
});

describe('FilterPanel — 成员选择器入口', () => {
  it('In op + loadMembers 提供 → 显示成员选择按钮', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: [] })],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        loadMembers={vi.fn().mockResolvedValue(['江苏', '浙江'])}
      />,
    );
    expect(screen.getByTestId('filter-leaf-pick-0')).toBeInTheDocument();
  });

  it('In op + 不传 loadMembers → 不显示成员选择按钮', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'In', value: [] })],
    });
    render(
      <FilterPanel viewConfig={vc} metadata={orderModelMetadata} onChangeFilters={vi.fn()} />,
    );
    expect(screen.queryByTestId('filter-leaf-pick-0')).not.toBeInTheDocument();
  });

  it('单值 op (Equals) → 不显示成员选择按钮', () => {
    const vc = buildViewConfig({
      filters: [buildLeafFilter({ field: PROVINCE, operator: 'Equals', value: '' })],
    });
    render(
      <FilterPanel
        viewConfig={vc}
        metadata={orderModelMetadata}
        onChangeFilters={vi.fn()}
        loadMembers={vi.fn().mockResolvedValue(['A'])}
      />,
    );
    expect(screen.queryByTestId('filter-leaf-pick-0')).not.toBeInTheDocument();
  });
});
