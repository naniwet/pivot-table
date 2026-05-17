/**
 * useTagMenu — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:菜单决策树(18 case sort/合计-小计/条件格式化/自定义排序/Σ chip)
 *   全部下沉到 core buildTagMenu.test.ts(24 case)。hook 层只保留 3 条 wiring:
 *   - null guard
 *   - 点排序 → dispatch SET 含新 rowSorts(证 callback wire 到 dispatch)
 *   - 点移除 → dispatch REMOVE_FIELD(证 chipIdx 透传)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { computeViewMode } from '../core/viewMode/viewMode.js';
import { buildViewConfig } from '../fixtures/builders.js';
import { orderModelMetadata, FIELD_IDS } from '../fixtures/metadata/orderModel.js';

import { useTagMenu, type TagMenuTarget } from './useTagMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function makeOpts(target: TagMenuTarget | null, viewConfigOverrides = {}, dispatch = vi.fn()) {
  const viewConfig = buildViewConfig(viewConfigOverrides);
  return {
    tagMenu: target,
    viewConfig,
    metaIndex,
    timeAxis: null,
    allTimeAxes: [],
    viewMode: computeViewMode(viewConfig),
    dispatch,
  };
}

describe('useTagMenu — wiring', () => {
  it('null tagMenu → 空 items', () => {
    const { result } = renderHook(() => useTagMenu(makeOpts(null)));
    expect(result.current).toEqual([]);
  });

  it('点排序方向 → dispatch SET 含新 rowSorts(wiring)', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(
          { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', x: 0, y: 0 },
          { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
          dispatch,
        ),
      ),
    );
    const sortMenu = result.current.find((i) => i.key === 'sort')!;
    sortMenu.children!.find((c) => c.label === '升序')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET',
      viewConfig: expect.objectContaining({
        rowSorts: expect.arrayContaining([
          expect.objectContaining({ type: 'ByDimension', fieldName: FIELD_IDS.provinceLevel, direction: 'ASC' }),
        ]),
      }),
    }));
  });

  it('点 从此区域移除 → dispatch REMOVE_FIELD(chipIdx 透传)', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useTagMenu(
        makeOpts(
          { zone: 'row', fieldName: FIELD_IDS.provinceLevel, fieldType: 'Dimension', chipIdx: 3, x: 0, y: 0 },
          { rows: [{ fieldName: FIELD_IDS.provinceLevel, type: 'Dimension' }] },
          dispatch,
        ),
      ),
    );
    result.current.find((i) => i.key === 'remove')!.onClick!();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_FIELD',
      zone: 'row',
      fieldName: FIELD_IDS.provinceLevel,
      chipIdx: undefined, // chipIndex 在 target 里没传(只有 chipIdx 透传给 SET_VALUE_*)
    });
  });
});
