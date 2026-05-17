/**
 * useFieldMenu — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:I1-I5 + click→callback(11 case)下沉到 core
 *   buildFieldMenu.test.ts。hook 层只保留:
 *   - 1 条 null guard
 *   - 2 条 dispatch wiring(click DROP_FIELD / ADD_DIMENSION_AS_VALUE)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';

import { useFieldMenu } from './useFieldMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

describe('useFieldMenu — wiring', () => {
  it('fieldMenu=null → 空 items', () => {
    const { result } = renderHook(() =>
      useFieldMenu({ fieldMenu: null, isAdhoc: false, metaIndex, dispatch: vi.fn() }),
    );
    expect(result.current).toEqual([]);
  });

  it('点 "添加到行区" → dispatch DROP_FIELD(zone=row, fieldName/fieldType 透传)', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useFieldMenu({
        fieldMenu: { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        isAdhoc: false,
        metaIndex,
        dispatch,
      }),
    );
    result.current.find((i) => i.key === 'add-row')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DROP_FIELD',
      zone: 'row',
      fieldName: FIELD_IDS.provinceLevel,
      fieldType: 'Dimension',
    });
  });

  it('点 "作为度量(COUNT)" → dispatch ADD_DIMENSION_AS_VALUE', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useFieldMenu({
        fieldMenu: { fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
        isAdhoc: false,
        metaIndex,
        dispatch,
      }),
    );
    const asMeasure = result.current.find((i) => i.key === 'as-measure')!;
    const countChild = asMeasure.children!.find((c) => c.key === 'as-measure-COUNT')!;
    countChild.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_DIMENSION_AS_VALUE',
      fieldName: FIELD_IDS.provinceLevel,
      aggregator: 'COUNT',
    });
  });
});
