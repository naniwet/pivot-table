/**
 * useTagMenu — DropZone chip 右键菜单 单测
 *
 * 主要覆盖回归 fix:Σ 度量名称(MeasureGroupName sentinel chip)右键菜单
 * 不应该有"显示小计 / 显示总计"项 — 它不是真维度,后端无小计/总计语义。
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { MEASURE_AXIS_FIELD_NAME } from '../core/queryBuilder/measureAxis.js';
import { computeViewMode } from '../core/viewMode/viewMode.js';
import { buildViewConfig } from '../fixtures/builders.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';

import { useTagMenu, type TagMenuTarget } from './useTagMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function makeOpts(target: TagMenuTarget, viewConfigOverrides = {}) {
  const viewConfig = buildViewConfig(viewConfigOverrides);
  return {
    tagMenu: target,
    viewConfig,
    metaIndex,
    timeAxis: null,
    allTimeAxes: [],
    viewMode: computeViewMode(viewConfig),
    dispatch: vi.fn(),
  };
}

describe('useTagMenu — Σ 度量名称(MeasureGroupName)chip', () => {
  const measureAxisTarget: TagMenuTarget = {
    zone: 'column',
    fieldName: MEASURE_AXIS_FIELD_NAME,
    fieldType: 'MeasureGroupName',
    x: 0,
    y: 0,
  };

  it('column 区域:不应有"显示合计 / 显示小计"项', () => {
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(measureAxisTarget, {
          columns: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });

  it('row 区域:也不应有"显示合计 / 显示小计"项', () => {
    const target: TagMenuTarget = { ...measureAxisTarget, zone: 'row' };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(target, {
          rows: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });

  it('仍保留排序 / 位置 / 从此区域移除', () => {
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(measureAxisTarget, {
          columns: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).toContain('排序');
    expect(labels).toContain('位置');
    expect(labels).toContain('从此区域移除');
  });
});

describe('useTagMenu — Dimension chip 合计/小计 互斥 + query 等价', () => {
  it('row 第 1 个字段 → label="显示合计",不出现"小计"', () => {
    const dimTarget: TagMenuTarget = {
      zone: 'row',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(dimTarget, {
          rows: [
            { fieldName: 'ShipProvince', type: 'Dimension' },
            { fieldName: 'OrderDate_Year2', type: 'Dimension' },
          ],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(true);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });

  it('row 第 2 个字段 → label="显示小计",不出现"合计"', () => {
    const dimTarget: TagMenuTarget = {
      zone: 'row',
      fieldName: 'OrderDate_Year2',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(dimTarget, {
          rows: [
            { fieldName: 'ShipProvince', type: 'Dimension' },
            { fieldName: 'OrderDate_Year2', type: 'Dimension' },
          ],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(true);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(false);
  });

  it('column 第 1 个字段 → label="显示合计"', () => {
    const dimTarget: TagMenuTarget = {
      zone: 'column',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(dimTarget, {
          columns: [
            { fieldName: 'ShipProvince', type: 'Dimension' },
            { fieldName: 'OrderDate_Year2', type: 'Dimension' },
          ],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(true);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });

  it('"合计"按钮和"小计"按钮 dispatch 同构 action(都改 field-level subTotal),不动 pageState.showGrandTotal', () => {
    // 用同一个 dispatch spy,先点第 1 个字段的"合计",再点第 2 个字段的"小计",
    // 断言两次都派发 SET_FIELD_SUB_TOTAL,且没有 SET_TOTALS
    const dispatch = vi.fn();
    const baseViewConfig = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince', type: 'Dimension' },
        { fieldName: 'OrderDate_Year2', type: 'Dimension' },
      ],
    });

    // 第 1 个字段
    const { result: r1 } = renderHook(() =>
      useTagMenu({
        tagMenu: {
          zone: 'row',
          fieldName: 'ShipProvince',
          fieldType: 'Dimension',
          x: 0,
          y: 0,
        },
        viewConfig: baseViewConfig,
        metaIndex,
        timeAxis: null,
        allTimeAxes: [],
        viewMode: computeViewMode(baseViewConfig),
        dispatch,
      }),
    );
    const grandBtn = r1.current.find(
      (i) => typeof i.label === 'string' && i.label.includes('显示合计'),
    );
    expect(grandBtn).toBeDefined();
    grandBtn?.onClick?.();

    // 第 2 个字段
    const { result: r2 } = renderHook(() =>
      useTagMenu({
        tagMenu: {
          zone: 'row',
          fieldName: 'OrderDate_Year2',
          fieldType: 'Dimension',
          x: 0,
          y: 0,
        },
        viewConfig: baseViewConfig,
        metaIndex,
        timeAxis: null,
        allTimeAxes: [],
        viewMode: computeViewMode(baseViewConfig),
        dispatch,
      }),
    );
    const subBtn = r2.current.find(
      (i) => typeof i.label === 'string' && i.label.includes('显示小计'),
    );
    expect(subBtn).toBeDefined();
    subBtn?.onClick?.();

    expect(dispatch).toHaveBeenCalledTimes(2);
    // 两次 action 类型一致,只是 fieldName 不同 → buildQuery 出来都是 fields[].subTotal='SHOW'
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'SET_FIELD_SUB_TOTAL',
      zone: 'row',
      fieldName: 'ShipProvince',
      subTotal: 'SHOW',
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'SET_FIELD_SUB_TOTAL',
      zone: 'row',
      fieldName: 'OrderDate_Year2',
      subTotal: 'SHOW',
    });
    // 关键:不应该有 SET_TOTALS(那会改 pageState.showGrandTotal,产生不同的后端 query)
    for (const call of dispatch.mock.calls) {
      expect((call[0] as { type: string }).type).not.toBe('SET_TOTALS');
    }
  });
});

describe('useTagMenu — 条件格式化入口(P5+)', () => {
  const NUMERIC_FIELD = '销售额_1624531356707'; // valueType=DOUBLE
  const STRING_FIELD = 'ShipProvince'; // valueType=STRING

  it('adhoc 模式 + row 区 + 数值字段 + 传 callback → 出"条件格式化…"', () => {
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: NUMERIC_FIELD,
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          queryMode: 'adhoc',
          rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }],
        }),
        onOpenConditionalFormat: cb,
      }),
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).toContain('条件格式化…');
  });

  it('adhoc + row + 字符串字段 → 不出"条件格式化…"', () => {
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: STRING_FIELD,
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          queryMode: 'adhoc',
          rows: [{ fieldName: STRING_FIELD, type: 'Dimension' }],
        }),
        onOpenConditionalFormat: cb,
      }),
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain('条件格式化…');
  });

  it('pivot 模式 + row 区 + 数值字段 → 不出"条件格式化…"(走 value zone chip)', () => {
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: NUMERIC_FIELD,
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }],
        }),
        onOpenConditionalFormat: cb,
      }),
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain('条件格式化…');
  });

  it('adhoc + row + 数值字段 点条件格式化 → callback 收到 fieldName', () => {
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: NUMERIC_FIELD,
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          queryMode: 'adhoc',
          rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }],
        }),
        onOpenConditionalFormat: cb,
      }),
    );
    const item = result.current.find((i) => i.label === '条件格式化…');
    item?.onClick?.();
    expect(cb).toHaveBeenCalledWith(NUMERIC_FIELD);
  });
});

describe('useTagMenu — 合计/小计 仅在透视(isMatrixView)下渲染', () => {
  it('adhoc 模式 → 第 1 个字段也不显示"合计/小计"', () => {
    const dimTarget: TagMenuTarget = {
      zone: 'row',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(dimTarget, {
          queryMode: 'adhoc',
          rows: [{ fieldName: 'ShipProvince', type: 'Dimension' }],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });

  it('chart 模式 → 第 1 个字段也不显示"合计/小计"', () => {
    const dimTarget: TagMenuTarget = {
      zone: 'row',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(dimTarget, {
          pageState: {
            rowPageNo: 1,
            rowPageSize: 50,
            columnPageNo: 1,
            columnPageSize: 50,
            displayMode: 'chart',
          },
          rows: [{ fieldName: 'ShipProvince', type: 'Dimension' }],
        }),
      ),
    );
    const labels = result.current.map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => typeof l === 'string' && l.includes('显示小计'))).toBe(false);
  });
});

describe('useTagMenu — 自定义排序…(P5+)', () => {
  function getSortSubmenu(items: ReturnType<typeof useTagMenu>): ReturnType<typeof useTagMenu> {
    const sortItem = items.find((i) => i.key === 'sort');
    return (sortItem?.children ?? []) as ReturnType<typeof useTagMenu>;
  }

  it('row 区 Dimension chip + 传 onOpenCustomSort → 出现"自定义排序…"', () => {
    const cb = vi.fn();
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          rows: [{ fieldName: 'ShipProvince', type: 'Dimension' }],
        }),
        onOpenCustomSort: cb,
      }),
    );
    const labels = getSortSubmenu(result.current).map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('自定义排序'))).toBe(true);
  });

  it('Measure chip(value 区)→ 不出"自定义排序"', () => {
    const cb = vi.fn();
    const target: TagMenuTarget = {
      zone: 'value',
      fieldName: 'sales',
      fieldType: 'Measure',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          values: [{ measureName: 'sales', aggregator: null, quickCalc: null }],
        }),
        onOpenCustomSort: cb,
      }),
    );
    const labels = getSortSubmenu(result.current).map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('自定义排序'))).toBe(false);
  });

  it('Σ 度量名称 chip → 不出"自定义排序"', () => {
    const cb = vi.fn();
    const target: TagMenuTarget = {
      zone: 'column',
      fieldName: '__measure_axis__',
      fieldType: 'MeasureGroupName',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          columns: [{ fieldName: '__measure_axis__', type: 'MeasureGroupName' }],
        }),
        onOpenCustomSort: cb,
      }),
    );
    const labels = getSortSubmenu(result.current).map((i) => i.label ?? '');
    expect(labels.some((l) => typeof l === 'string' && l.includes('自定义排序'))).toBe(false);
  });

  it('已配 ByCustomCaption → label 加 ✓ + 数量', () => {
    const cb = vi.fn();
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: 'region',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          rows: [{ fieldName: 'region', type: 'Dimension' }],
          rowSorts: [
            {
              type: 'ByCustomCaption',
              fieldName: 'region',
              direction: 'ASC',
              customCaption: ['华东', '华南', '华北'],
            },
          ],
        }),
        onOpenCustomSort: cb,
      }),
    );
    const customItem = getSortSubmenu(result.current).find(
      (i) => typeof i.label === 'string' && i.label.includes('自定义排序'),
    );
    expect(customItem?.label).toContain('✓');
    expect(customItem?.label).toContain('3'); // 3 项
  });

  it('点"自定义排序…" → onOpenCustomSort 收到 fieldName', () => {
    const cb = vi.fn();
    const target: TagMenuTarget = {
      zone: 'row',
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() =>
      useTagMenu({
        ...makeOpts(target, {
          rows: [{ fieldName: 'ShipProvince', type: 'Dimension' }],
        }),
        onOpenCustomSort: cb,
      }),
    );
    const item = getSortSubmenu(result.current).find(
      (i) => typeof i.label === 'string' && i.label.includes('自定义排序'),
    );
    item?.onClick?.();
    expect(cb).toHaveBeenCalledWith('ShipProvince');
  });
});
