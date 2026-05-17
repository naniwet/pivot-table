/**
 * useMemberContextMenu — hook 集成 wiring 测试
 *
 * 2026-05-17 测试瘦身:`addMemberToFilter` 的 6 条合并/去重/跨 op 不变量(I1-I6)
 *   已下沉到 core `addMemberToFilter.test.ts`。hook 层只保留:
 *   - menu items 结构(null / 正常),组件 API 形状契约
 *   - 1 条 click → onChangeFilters wiring(证 hook 把 click 路由到 core fn)
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';

import { useMemberContextMenu } from './useMemberContextMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

describe('useMemberContextMenu — items 结构', () => {
  it('memberContextMenu=null → 空 items', () => {
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: null,
        filters: [],
        metaIndex,
        onChangeFilters: vi.fn(),
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('memberContextMenu 给 → 3 个 item + 1 separator(筛选 / 排除 / 复制成员名)', () => {
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: [],
        metaIndex,
        onChangeFilters: vi.fn(),
      }),
    );
    const items = result.current;
    expect(items).toHaveLength(4);
    expect(items[0]!.label).toContain('筛选');
    expect(items[0]!.label).toContain('江苏');
    expect(items[1]!.label).toContain('排除');
    expect(items[2]!.separator).toBe(true);
    expect(items[3]!.label).toBe('复制成员名');
  });
});

describe('useMemberContextMenu — click → onChangeFilters wiring', () => {
  it('点筛选 → onChangeFilters 被调一次,产出含 In leaf(具体合并/去重由 core 证)', () => {
    const onChangeFilters = vi.fn();
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: [],
        metaIndex,
        onChangeFilters,
      }),
    );
    result.current.find((i) => i.key === 'filter-in')!.onClick!();
    expect(onChangeFilters).toHaveBeenCalledTimes(1);
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({ operator: 'In', value: ['江苏'] }),
    ]);
  });
});
