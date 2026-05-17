/**
 * addMemberToFilter 测试 — I1-I6 不变量(从 useMemberContextMenu.test.ts 下沉)
 */
import { describe, expect, it } from 'vitest';

import type { ClientFilter } from '../../types/viewConfig.js';

import { addMemberToFilter } from './addMemberToFilter.js';

function leaf(field: string, op: string, value: unknown): ClientFilter {
  return { kind: 'leaf', field, operator: op, value } as ClientFilter;
}

describe('addMemberToFilter — I1 新建 leaf', () => {
  it('I1: filters 空 + In → 新建 In leaf,value=[memberName]', () => {
    const next = addMemberToFilter([], 'ShipProvince2', '江苏', 'In');
    expect(next).toEqual([
      expect.objectContaining({
        kind: 'leaf', field: 'ShipProvince2', operator: 'In', value: ['江苏'],
      }),
    ]);
  });

  it('I1: filters 空 + NotIn → 新建 NotIn leaf', () => {
    const next = addMemberToFilter([], 'ShipProvince2', '江苏', 'NotIn');
    expect(next).toEqual([
      expect.objectContaining({ operator: 'NotIn', value: ['江苏'] }),
    ]);
  });
});

describe('addMemberToFilter — I2/I3 In 合并', () => {
  it('I2: 已有同 field + In leaf + 未含此 member → 追加进 value 数组', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', ['北京'])];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next).toEqual([
      expect.objectContaining({ value: ['北京', '江苏'] }),
    ]);
  });

  it('I3: 已含此 member → value 不变(去重,但引用换为新 leaf)', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', ['江苏', '北京'])];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next).toEqual([
      expect.objectContaining({ value: ['江苏', '北京'] }), // 不变
    ]);
  });
});

describe('addMemberToFilter — I4 单值 / 空值升数组', () => {
  it('I4: 已有 leaf value 是单值字符串 → 升为 [oldValue, memberName]', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', '北京')];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next[0]).toMatchObject({ value: ['北京', '江苏'] });
  });

  it('I4: 已有 leaf value=null → 直接 [memberName]', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', null)];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next[0]).toMatchObject({ value: ['江苏'] });
  });

  it('I4: 已有 leaf value=空字符串 → 直接 [memberName]', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', '')];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next[0]).toMatchObject({ value: ['江苏'] });
  });
});

describe('addMemberToFilter — I5/I6 跨 op 不合并', () => {
  it('I5: 已有 Equals leaf → 不合并,在顶层新建独立 In leaf', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'Equals', '北京')];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'In');
    expect(next).toEqual([
      expect.objectContaining({ operator: 'Equals', value: '北京' }), // 保留
      expect.objectContaining({ operator: 'In', value: ['江苏'] }),
    ]);
  });

  it('I6: 已有 In leaf + 加 NotIn → 独立新建 NotIn leaf(不影响 In)', () => {
    const before: ClientFilter[] = [leaf('ShipProvince2', 'In', ['北京'])];
    const next = addMemberToFilter(before, 'ShipProvince2', '江苏', 'NotIn');
    expect(next).toEqual([
      expect.objectContaining({ operator: 'In', value: ['北京'] }),
      expect.objectContaining({ operator: 'NotIn', value: ['江苏'] }),
    ]);
  });
});
