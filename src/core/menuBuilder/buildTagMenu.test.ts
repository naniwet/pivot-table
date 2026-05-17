/**
 * buildTagMenuItems 测试 — 全面覆盖原 useTagMenu 决策树
 *
 * 跟 useTagMenu.test.ts 案例 1:1 对齐(从 hook 下沉到 core);hook 测试将瘦身为 wiring smoke。
 */
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { MEASURE_AXIS_FIELD_NAME } from '../queryBuilder/measureAxis.js';
import { computeViewMode } from '../viewMode/viewMode.js';
import { buildViewConfig, buildValueField } from '../../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import {
  type TagMenuCallbacks,
  type TagMenuTarget,
  buildTagMenuItems,
} from './buildTagMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function defaultCallbacks(overrides: Partial<TagMenuCallbacks> = {}): TagMenuCallbacks {
  return {
    onSetSortDirection: vi.fn(),
    onClearSort: vi.fn(),
    onMoveField: vi.fn(),
    onSetAggregator: vi.fn(),
    onSetQuickCalc: vi.fn(),
    onToggleSubTotal: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

function makeCtx(target: TagMenuTarget | null, viewConfigOverrides = {}) {
  const viewConfig = buildViewConfig(viewConfigOverrides);
  return {
    tagMenu: target,
    viewConfig,
    metaIndex,
    timeAxis: null,
    allTimeAxes: [],
    viewMode: computeViewMode(viewConfig),
  };
}

describe('buildTagMenuItems — Σ 度量名称(MeasureGroupName)chip', () => {
  const measureAxisTarget: TagMenuTarget = {
    zone: 'column',
    fieldName: MEASURE_AXIS_FIELD_NAME,
    fieldType: 'MeasureGroupName',
    x: 0, y: 0,
  };

  it('column 区域:不应有 "显示合计/显示小计" 项', () => {
    const items = buildTagMenuItems(
      makeCtx(measureAxisTarget, {
        columns: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }],
      }),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label ?? '');
    expect(labels.some((l) => l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => l.includes('显示小计'))).toBe(false);
  });

  it('row 区域:也不应有 "显示合计/小计" 项', () => {
    const target: TagMenuTarget = { ...measureAxisTarget, zone: 'row' };
    const items = buildTagMenuItems(
      makeCtx(target, { rows: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }] }),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label ?? '');
    expect(labels.some((l) => l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => l.includes('显示小计'))).toBe(false);
  });

  it('仍保留 排序/位置/从此区域移除', () => {
    const items = buildTagMenuItems(
      makeCtx(measureAxisTarget, {
        columns: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }],
      }),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain('排序');
    expect(labels).toContain('位置');
    expect(labels).toContain('从此区域移除');
  });
});

describe('buildTagMenuItems — Dimension chip 合计/小计 互斥', () => {
  it('row 第 1 个字段 → label="显示合计",不出现"小计"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l === '显示合计' || l === '✓ 显示合计')).toBe(true);
    expect(labels.some((l) => l && l.includes('小计'))).toBe(false);
  });

  it('row 第 2 个字段 → label="显示小计",不出现"合计"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.regionLevel, fieldType: 'Dimension', x: 0, y: 0 },
        {
          rows: [
            { fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' },
            { fieldName: FIELD_IDS.regionLevel, type: 'Dimension' },
          ],
        },
      ),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l === '显示小计' || l === '✓ 显示小计')).toBe(true);
    expect(labels.some((l) => l === '显示合计' || l === '✓ 显示合计')).toBe(false);
  });

  it('column 第 1 个字段 → label="显示合计"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'column', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { columns: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l === '显示合计' || l === '✓ 显示合计')).toBe(true);
  });

  it('点合计/小计 → onToggleSubTotal(subTotalOn=false) 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      callbacks,
    );
    const toggle = items.find((i) => i.key === 'toggle-subtotal')!;
    toggle.onClick!();
    expect(callbacks.onToggleSubTotal).toHaveBeenCalledWith(false);
  });
});

describe('buildTagMenuItems — 条件格式化入口', () => {
  const NUMERIC_FIELD = FIELD_IDS.salesMeasure;
  const STRING_FIELD = FIELD_IDS.provinceLevel;

  it('adhoc + row + 数值字段 + 传 callback → "条件格式化…" 出现', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: NUMERIC_FIELD, fieldType: 'Dimension', x: 0, y: 0 },
        { queryMode: 'adhoc', rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).toContain('条件格式化…');
  });

  it('adhoc + row + 字符串字段 → 不出现', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: STRING_FIELD, fieldType: 'Dimension', x: 0, y: 0 },
        { queryMode: 'adhoc', rows: [{ fieldName: STRING_FIELD, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).not.toContain('条件格式化…');
  });

  it('pivot + row + 数值字段 → 不出现(条件格式化走 value zone chip)', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: NUMERIC_FIELD, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).not.toContain('条件格式化…');
  });

  it('点 "条件格式化…" → onOpenConditionalFormat(fieldName) 被调', () => {
    const onOpenConditionalFormat = vi.fn();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: NUMERIC_FIELD, fieldType: 'Dimension', x: 0, y: 0 },
        { queryMode: 'adhoc', rows: [{ fieldName: NUMERIC_FIELD, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenConditionalFormat }),
    );
    items.find((i) => i.label === '条件格式化…')!.onClick!();
    expect(onOpenConditionalFormat).toHaveBeenCalledWith(NUMERIC_FIELD);
  });

  it('value zone pivot chip + 传 callback → "条件格式化…" 出现,target 是 measureName', () => {
    const onOpenConditionalFormat = vi.fn();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'value', fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure', x: 0, y: 0 },
        { values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })] },
      ),
      defaultCallbacks({ onOpenConditionalFormat }),
    );
    items.find((i) => i.label === '条件格式化…')!.onClick!();
    expect(onOpenConditionalFormat).toHaveBeenCalledWith(FIELD_IDS.salesMeasure);
  });
});

describe('buildTagMenuItems — 合计/小计 仅在 matrix view 下渲染', () => {
  it('adhoc 模式 → 第 1 个字段也不显示"合计/小计"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { queryMode: 'adhoc', rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l && l.includes('显示合计'))).toBe(false);
    expect(labels.some((l) => l && l.includes('显示小计'))).toBe(false);
  });

  it('chart 模式 → 第 1 个字段也不显示"合计/小计"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        {
          rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }],
          pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50, displayMode: 'chart' },
        },
      ),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l && l.includes('显示合计'))).toBe(false);
  });
});

describe('buildTagMenuItems — 自定义排序', () => {
  it('row Dimension + 传 onOpenCustomSort → "自定义排序…" 出现', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenCustomSort: vi.fn() }),
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    expect(sortMenu.children!.map((c) => c.label)).toContain('自定义排序…');
  });

  it('Measure chip(value 区)→ 不出 "自定义排序"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'value', fieldName: FIELD_IDS.salesMeasure, fieldType: 'Measure', x: 0, y: 0 },
        { values: [buildValueField({ measureName: FIELD_IDS.salesMeasure })] },
      ),
      defaultCallbacks({ onOpenCustomSort: vi.fn() }),
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    expect(sortMenu.children!.map((c) => c.label)).not.toContain('自定义排序…');
  });

  it('Σ 度量名称 chip → 不出 "自定义排序"', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'column', fieldName: MEASURE_AXIS_FIELD_NAME, fieldType: 'MeasureGroupName', x: 0, y: 0 },
        { columns: [{ fieldName: MEASURE_AXIS_FIELD_NAME, type: 'MeasureGroupName' }] },
      ),
      defaultCallbacks({ onOpenCustomSort: vi.fn() }),
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    expect(sortMenu.children!.map((c) => c.label)).not.toContain('自定义排序…');
  });

  it('已配 ByCustomCaption → label 加 ✓ + 数量', () => {
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        {
          rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }],
          rowSorts: [{
            type: 'ByCustomCaption', fieldName: FIELD_IDS.provinceLevel, direction: 'ASC',
            customCaption: ['北京', '上海'],
          }],
        },
      ),
      defaultCallbacks({ onOpenCustomSort: vi.fn() }),
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    expect(sortMenu.children!.map((c) => c.label)).toContain('✓ 自定义排序…(2 项)');
  });

  it('点 "自定义排序…" → onOpenCustomSort(fieldName) 被调', () => {
    const onOpenCustomSort = vi.fn();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      defaultCallbacks({ onOpenCustomSort }),
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    const item = sortMenu.children!.find((c) => c.label === '自定义排序…')!;
    item.onClick!();
    expect(onOpenCustomSort).toHaveBeenCalledWith(FIELD_IDS.provinceLevel);
  });
});

describe('buildTagMenuItems — guard / wiring', () => {
  it('tagMenu=null → 空 items', () => {
    expect(buildTagMenuItems(makeCtx(null), defaultCallbacks())).toEqual([]);
  });

  it('点排序方向 → onSetSortDirection(direction) 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      callbacks,
    );
    const sortMenu = items.find((i) => i.key === 'sort')!;
    sortMenu.children!.find((c) => c.label === '升序')!.onClick!();
    expect(callbacks.onSetSortDirection).toHaveBeenCalledWith('ASC');
  });

  it('点取消排序 → onClearSort 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        {
          rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }],
          rowSorts: [{ type: 'ByDimension', fieldName: FIELD_IDS.provinceLevel, direction: 'ASC' }],
        },
      ),
      callbacks,
    );
    items.find((i) => i.key === 'sort')!.children!.find((c) => c.key === 'sort-clear')!.onClick!();
    expect(callbacks.onClearSort).toHaveBeenCalled();
  });

  it('点 上移 → onMoveField("up") 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.regionLevel, fieldType: 'Dimension', x: 0, y: 0 },
        {
          rows: [
            { fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' },
            { fieldName: FIELD_IDS.regionLevel, type: 'Dimension' },
          ],
        },
      ),
      callbacks,
    );
    items.find((i) => i.key === 'move')!.children!.find((c) => c.key === 'move-up')!.onClick!();
    expect(callbacks.onMoveField).toHaveBeenCalledWith('up');
  });

  it('点 从此区域移除 → onRemove 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildTagMenuItems(
      makeCtx(
        { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
      ),
      callbacks,
    );
    items.find((i) => i.key === 'remove')!.onClick!();
    expect(callbacks.onRemove).toHaveBeenCalled();
  });
});
