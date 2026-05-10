/**
 * useMemberContextMenu — pivot 行/列头成员右键菜单 单测
 *
 * 重点:`addMemberToFilter` 的合并逻辑(避免重复 leaf)
 *   - 没现存同 field+op leaf → 新建
 *   - 有现存 → 把 member 追加到 value 数组
 *   - 已包含相同 member → 不重复
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildMetadataIndex } from '../core/metadata/fieldIndex.js';
import { orderModelMetadata } from '../fixtures/metadata/orderModel.js';
import type { ClientFilter } from '../types/viewConfig.js';

import { useMemberContextMenu } from './useMemberContextMenu.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function leaf(field: string, op: string, value: unknown): ClientFilter {
  return { kind: 'leaf', field, operator: op, value } as ClientFilter;
}

describe('useMemberContextMenu — items', () => {
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

  it('memberContextMenu 给 → 渲染 3 个 item:筛选 = / 排除 = / 复制(中间一个 separator)', () => {
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: [],
        metaIndex,
        onChangeFilters: vi.fn(),
      }),
    );
    const items = result.current;
    expect(items).toHaveLength(4); // 3 menu items + 1 separator
    expect(items[0]!.label).toContain('筛选');
    expect(items[0]!.label).toContain('江苏');
    expect(items[1]!.label).toContain('排除');
    expect(items[2]!.separator).toBe(true);
    expect(items[3]!.label).toBe('复制成员名');
  });
});

describe('useMemberContextMenu — In 合并行为', () => {
  it('filters 空 → 点筛选 → 新建 In leaf,value=[memberName]', () => {
    const onChangeFilters = vi.fn();
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: [],
        metaIndex,
        onChangeFilters,
      }),
    );
    const inItem = result.current.find((i) => i.key === 'filter-in')!;
    inItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'leaf',
        field: 'ShipProvince2',
        operator: 'In',
        value: ['江苏'],
      }),
    ]);
  });

  it('已有同 field + In leaf → 合并:把 member 追加到现有 value 数组', () => {
    const onChangeFilters = vi.fn();
    const existing: ClientFilter[] = [leaf('ShipProvince2', 'In', ['北京'])];
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: existing,
        metaIndex,
        onChangeFilters,
      }),
    );
    const inItem = result.current.find((i) => i.key === 'filter-in')!;
    inItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'leaf',
        field: 'ShipProvince2',
        operator: 'In',
        value: ['北京', '江苏'],
      }),
    ]);
  });

  it('已有同 field + In leaf 且已含此 member → 不重复', () => {
    const onChangeFilters = vi.fn();
    const existing: ClientFilter[] = [leaf('ShipProvince2', 'In', ['江苏', '北京'])];
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: existing,
        metaIndex,
        onChangeFilters,
      }),
    );
    const inItem = result.current.find((i) => i.key === 'filter-in')!;
    inItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({
        value: ['江苏', '北京'], // 没变
      }),
    ]);
  });

  it('已有同 field 但 op 是 Equals → 不合并,新建独立 In leaf', () => {
    const onChangeFilters = vi.fn();
    const existing: ClientFilter[] = [leaf('ShipProvince2', 'Equals', '北京')];
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: existing,
        metaIndex,
        onChangeFilters,
      }),
    );
    const inItem = result.current.find((i) => i.key === 'filter-in')!;
    inItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      // 原 Equals leaf 保留
      expect.objectContaining({ operator: 'Equals', value: '北京' }),
      // 新 In leaf
      expect.objectContaining({ operator: 'In', value: ['江苏'] }),
    ]);
  });
});

describe('useMemberContextMenu — NotIn 排除行为', () => {
  it('点排除 → 新建 NotIn leaf', () => {
    const onChangeFilters = vi.fn();
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: [],
        metaIndex,
        onChangeFilters,
      }),
    );
    const notInItem = result.current.find((i) => i.key === 'filter-not-in')!;
    notInItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({ operator: 'NotIn', value: ['江苏'] }),
    ]);
  });

  it('已有 In leaf 同 field → 排除新建独立 NotIn leaf(不影响 In)', () => {
    const onChangeFilters = vi.fn();
    const existing: ClientFilter[] = [leaf('ShipProvince2', 'In', ['北京'])];
    const { result } = renderHook(() =>
      useMemberContextMenu({
        memberContextMenu: { fieldName: 'ShipProvince2', memberName: '江苏', x: 0, y: 0 },
        filters: existing,
        metaIndex,
        onChangeFilters,
      }),
    );
    const notInItem = result.current.find((i) => i.key === 'filter-not-in')!;
    notInItem.onClick!();
    expect(onChangeFilters).toHaveBeenCalledWith([
      expect.objectContaining({ operator: 'In', value: ['北京'] }),
      expect.objectContaining({ operator: 'NotIn', value: ['江苏'] }),
    ]);
  });
});
