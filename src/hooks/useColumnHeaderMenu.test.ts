/**
 * useColumnHeaderMenu — 字段级表头右键菜单 单测
 *
 * 重点覆盖 P5+ 新增的 adhoc 数值列 "条件格式化…" 菜单项:
 *   - 必须传 onOpenConditionalFormat callback
 *   - 必须 sortKind='ByDimension'(pivot 度量列头走另一路径)
 *   - 必须 valueType 数值类(STRING/DATE 等不出现)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';
import { buildViewConfig } from '../fixtures/builders.js';

import { useColumnHeaderMenu, type ColumnHeaderMenuTarget } from './useColumnHeaderMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

// fixture 里已存在的数值字段 = 销售额(valueType=DOUBLE)
const NUMERIC_FIELD = '销售额_1624531356707';
// 字符串字段 = ShipProvince
const STRING_FIELD = 'ShipProvince';

function makeOpts(target: ColumnHeaderMenuTarget | null, onOpenCF?: (f: string) => void) {
  return {
    columnHeaderMenu: target,
    viewConfig: buildViewConfig(),
    metaIndex,
    dispatch: vi.fn(),
    onOpenConditionalFormat: onOpenCF,
  };
}

describe('useColumnHeaderMenu — 基础 (sort/copy)', () => {
  it('null target → 空 items', () => {
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(null)));
    expect(result.current).toEqual([]);
  });

  it('字符串字段 + 没传 condFmt callback → 不出条件格式化项', () => {
    const target: ColumnHeaderMenuTarget = {
      fieldName: STRING_FIELD,
      sortKind: 'ByDimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(target)));
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain('条件格式化…');
    expect(labels).toContain('升序');
    expect(labels).toContain('降序');
    expect(labels).toContain('复制字段名');
  });
});

describe('useColumnHeaderMenu — P5+ adhoc 条件格式化项', () => {
  const cb = vi.fn();

  it('数值字段 + sortKind=ByDimension + callback 传 → 出现"条件格式化…"', () => {
    const target: ColumnHeaderMenuTarget = {
      fieldName: NUMERIC_FIELD,
      sortKind: 'ByDimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(target, cb)));
    const labels = result.current.map((i) => i.label);
    expect(labels).toContain('条件格式化…');
  });

  it('字符串字段 → 即使传 callback 也不出"条件格式化…"', () => {
    const target: ColumnHeaderMenuTarget = {
      fieldName: STRING_FIELD,
      sortKind: 'ByDimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(target, cb)));
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain('条件格式化…');
  });

  it('sortKind=ByMeasure(pivot 度量列头)→ 不出"条件格式化…"(走 chip 菜单路径)', () => {
    const target: ColumnHeaderMenuTarget = {
      fieldName: NUMERIC_FIELD,
      sortKind: 'ByMeasure',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(target, cb)));
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain('条件格式化…');
  });

  it('点"条件格式化…" → 调 callback,传 fieldName', () => {
    const callback = vi.fn();
    const target: ColumnHeaderMenuTarget = {
      fieldName: NUMERIC_FIELD,
      sortKind: 'ByDimension',
      x: 0,
      y: 0,
    };
    const { result } = renderHook(() => useColumnHeaderMenu(makeOpts(target, callback)));
    const item = result.current.find((i) => i.label === '条件格式化…');
    expect(item).toBeDefined();
    item?.onClick?.();
    expect(callback).toHaveBeenCalledWith(NUMERIC_FIELD);
  });
});
