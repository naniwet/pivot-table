/**
 * buildColumnHeaderMenuItems 测试 — I1-I7(从 useColumnHeaderMenu.test.ts 下沉)
 */
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { orderModelMetadata } from '../../fixtures/metadata/orderModel.js';
import { buildViewConfig } from '../../fixtures/builders.js';
import type { Sort } from '../../types/viewConfig.js';

import {
  type ColumnHeaderMenuCallbacks,
  type ColumnHeaderMenuTarget,
  buildColumnHeaderMenuItems,
} from './buildColumnHeaderMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

const NUMERIC_FIELD = '销售额_1624531356707';
const STRING_FIELD = 'ShipProvince';

function defaultCallbacks(overrides: Partial<ColumnHeaderMenuCallbacks> = {}): ColumnHeaderMenuCallbacks {
  return {
    onSetSortDirection: vi.fn(),
    onCopyFieldName: vi.fn(),
    ...overrides,
  };
}

function makeCtx(
  target: ColumnHeaderMenuTarget | null,
  extras?: { queryMode?: 'pivot' | 'adhoc'; rowSorts?: Sort[] },
) {
  return {
    columnHeaderMenu: target,
    viewConfig: buildViewConfig({
      ...(extras?.queryMode ? { queryMode: extras.queryMode } : {}),
      ...(extras?.rowSorts ? { rowSorts: extras.rowSorts } : {}),
    }),
    metaIndex,
  };
}

describe('buildColumnHeaderMenuItems — I1 guard', () => {
  it('I1: null target → 空 items', () => {
    expect(buildColumnHeaderMenuItems(makeCtx(null), defaultCallbacks())).toEqual([]);
  });
});

describe('buildColumnHeaderMenuItems — I2/I3 sort items', () => {
  const target: ColumnHeaderMenuTarget = { fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 };

  it('I2/I3 pivot 模式 → 升序/降序/全局升序/全局降序 4 项', () => {
    const items = buildColumnHeaderMenuItems(makeCtx(target), defaultCallbacks());
    const labels = items.map((i) => i.label);
    expect(labels).toContain('升序');
    expect(labels).toContain('降序');
    expect(labels).toContain('全局升序');
    expect(labels).toContain('全局降序');
  });

  it('I3 adhoc 模式 → 无 全局升序/降序', () => {
    const items = buildColumnHeaderMenuItems(makeCtx(target, { queryMode: 'adhoc' }), defaultCallbacks());
    const labels = items.map((i) => i.label);
    expect(labels).toContain('升序');
    expect(labels).toContain('降序');
    expect(labels).not.toContain('全局升序');
    expect(labels).not.toContain('全局降序');
  });

  it('I2: 当前 sort 是 BASC → "✓ 全局升序"显示勾(其他不打)', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx(target, { rowSorts: [{ type: 'ByDimension', fieldName: STRING_FIELD, direction: 'BASC' }] }),
      defaultCallbacks(),
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain('✓ 全局升序');
    expect(labels).toContain('升序');
    expect(labels).not.toContain('✓ 升序');
  });

  it('点排序项 → onSetSortDirection(direction) 被调', () => {
    const callbacks = defaultCallbacks();
    const items = buildColumnHeaderMenuItems(makeCtx(target), callbacks);
    items.find((i) => i.label === '降序')!.onClick!();
    expect(callbacks.onSetSortDirection).toHaveBeenCalledWith('DESC');
  });
});

describe('buildColumnHeaderMenuItems — I4 取消排序', () => {
  const target: ColumnHeaderMenuTarget = { fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 };

  it('I4: 该字段当前有 sort → 显示"取消排序"', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx(target, { rowSorts: [{ type: 'ByDimension', fieldName: STRING_FIELD, direction: 'ASC' }] }),
      defaultCallbacks(),
    );
    expect(items.map((i) => i.label)).toContain('取消排序');
  });

  it('I4: 无 sort → 不显示"取消排序"', () => {
    const items = buildColumnHeaderMenuItems(makeCtx(target), defaultCallbacks());
    expect(items.map((i) => i.label)).not.toContain('取消排序');
  });

  it('I4: 点取消排序 → onSetSortDirection(null)', () => {
    const callbacks = defaultCallbacks();
    const items = buildColumnHeaderMenuItems(
      makeCtx(target, { rowSorts: [{ type: 'ByDimension', fieldName: STRING_FIELD, direction: 'ASC' }] }),
      callbacks,
    );
    items.find((i) => i.label === '取消排序')!.onClick!();
    expect(callbacks.onSetSortDirection).toHaveBeenCalledWith(null);
  });
});

describe('buildColumnHeaderMenuItems — I5 自定义排序', () => {
  const target: ColumnHeaderMenuTarget = { fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 };

  it('I5: ByDimension + onOpenCustomSort 传 → 显示"自定义排序…"', () => {
    const onOpenCustomSort = vi.fn();
    const items = buildColumnHeaderMenuItems(makeCtx(target), defaultCallbacks({ onOpenCustomSort }));
    expect(items.map((i) => i.label)).toContain('自定义排序…');
  });

  it('I5: ByMeasure → 不显示(度量不支持 ByCustomCaption)', () => {
    const measureTarget: ColumnHeaderMenuTarget = { fieldName: NUMERIC_FIELD, sortKind: 'ByMeasure', x: 0, y: 0 };
    const items = buildColumnHeaderMenuItems(makeCtx(measureTarget), defaultCallbacks({ onOpenCustomSort: vi.fn() }));
    expect(items.map((i) => i.label)).not.toContain('自定义排序…');
  });

  it('I5: 当前有 ByCustomCaption → "✓ 自定义排序…(N 项)"', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx(target, {
        rowSorts: [{ type: 'ByCustomCaption', fieldName: STRING_FIELD, direction: 'ASC', customCaption: ['江苏', '浙江', '安徽'] }],
      }),
      defaultCallbacks({ onOpenCustomSort: vi.fn() }),
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain('✓ 自定义排序…(3 项)');
    expect(labels).toContain('取消排序');
  });
});

describe('buildColumnHeaderMenuItems — I6 条件格式化', () => {
  it('I6: 数值列 + sortKind=ByDimension + callback → 出现"条件格式化…"', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: NUMERIC_FIELD, sortKind: 'ByDimension', x: 0, y: 0 }),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).toContain('条件格式化…');
  });

  it('I6: 字符串列 → 不出现(数值类才合适)', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 }),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).not.toContain('条件格式化…');
  });

  it('I6: 数值列 + ByMeasure → 不出现(走 chip 菜单路径)', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: NUMERIC_FIELD, sortKind: 'ByMeasure', x: 0, y: 0 }),
      defaultCallbacks({ onOpenConditionalFormat: vi.fn() }),
    );
    expect(items.map((i) => i.label)).not.toContain('条件格式化…');
  });

  it('I6: 没传 callback → 不出现', () => {
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: NUMERIC_FIELD, sortKind: 'ByDimension', x: 0, y: 0 }),
      defaultCallbacks(), // 无 onOpenConditionalFormat
    );
    expect(items.map((i) => i.label)).not.toContain('条件格式化…');
  });

  it('I6: 点"条件格式化…" → 调 callback,传 fieldName', () => {
    const onOpenConditionalFormat = vi.fn();
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: NUMERIC_FIELD, sortKind: 'ByDimension', x: 0, y: 0 }),
      defaultCallbacks({ onOpenConditionalFormat }),
    );
    items.find((i) => i.label === '条件格式化…')!.onClick!();
    expect(onOpenConditionalFormat).toHaveBeenCalledWith(NUMERIC_FIELD);
  });
});

describe('buildColumnHeaderMenuItems — I7 复制字段名', () => {
  it('I7: 末尾永远有"复制字段名"item;onClick → 传 alias', () => {
    const onCopyFieldName = vi.fn();
    const items = buildColumnHeaderMenuItems(
      makeCtx({ fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 }),
      defaultCallbacks({ onCopyFieldName }),
    );
    const copyItem = items.find((i) => i.key === 'copy-name')!;
    expect(copyItem.label).toBe('复制字段名');
    copyItem.onClick!();
    expect(onCopyFieldName).toHaveBeenCalled();
  });
});
