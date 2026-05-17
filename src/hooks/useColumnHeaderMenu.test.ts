/**
 * useColumnHeaderMenu — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:I1-I7 (12 case sort/cond-fmt/custom-sort 决策)
 *   下沉到 core buildColumnHeaderMenu.test.ts。hook 层只保留:
 *   - 1 条 dispatch wiring:click 排序项 → dispatch SET 含新 rowSorts
 *   - 1 条 callback 透传:click 条件格式化 → onOpenConditionalFormat 被调
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';
import { buildViewConfig } from '../fixtures/builders.js';

import { useColumnHeaderMenu } from './useColumnHeaderMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);
const NUMERIC_FIELD = '销售额_1624531356707';
const STRING_FIELD = 'ShipProvince';

describe('useColumnHeaderMenu — wiring', () => {
  it('点排序项 → dispatch SET 含更新后的 rowSorts(wiring)', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useColumnHeaderMenu({
        columnHeaderMenu: { fieldName: STRING_FIELD, sortKind: 'ByDimension', x: 0, y: 0 },
        viewConfig: buildViewConfig(),
        metaIndex,
        dispatch,
      }),
    );
    result.current.find((i) => i.label === '升序')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET',
      viewConfig: expect.objectContaining({
        rowSorts: expect.arrayContaining([
          expect.objectContaining({ type: 'ByDimension', fieldName: STRING_FIELD, direction: 'ASC' }),
        ]),
      }),
    }));
  });

  it('点"条件格式化…" → onOpenConditionalFormat 被调,传 fieldName', () => {
    const onOpenConditionalFormat = vi.fn();
    const { result } = renderHook(() =>
      useColumnHeaderMenu({
        columnHeaderMenu: { fieldName: NUMERIC_FIELD, sortKind: 'ByDimension', x: 0, y: 0 },
        viewConfig: buildViewConfig(),
        metaIndex,
        dispatch: vi.fn(),
        onOpenConditionalFormat,
      }),
    );
    result.current.find((i) => i.label === '条件格式化…')!.onClick!();
    expect(onOpenConditionalFormat).toHaveBeenCalledWith(NUMERIC_FIELD);
  });
});
