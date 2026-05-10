/**
 * customFields 操作 — 添加/删除/更新用户自建字段（P2）
 *
 * 三种 customField：calc_measure / enum_group / range_group（详见 viewConfig.ts）
 * 操作语义统一，不区分 kind。
 */
import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';
import type { CustomField } from '../../types/viewConfig.js';

import {
  applyAddCustomField,
  applyRemoveCustomField,
  applyUpdateCustomField,
} from './customFields.js';

const enumGroup: CustomField = {
  id: 'eg1',
  name: '区域分组',
  kind: 'enum_group',
  baseField: 'ShipProvince',
  groups: [{ label: '沿海', members: ['广东'] }],
  ungroupedHandling: 'show_individually',
};

const rangeGroup: CustomField = {
  id: 'rg1',
  name: '年龄段',
  kind: 'range_group',
  baseField: 'Age',
  ranges: [{ min: null, max: 18, label: '未成年' }],
};

describe('applyAddCustomField', () => {
  it('append 到 viewConfig.customFields 末尾', () => {
    const before = buildViewConfig();
    const after = applyAddCustomField(before, enumGroup);
    expect(after.customFields).toEqual([enumGroup]);
  });

  it('id 已存在 → throw（防御）', () => {
    const before = buildViewConfig({ customFields: [enumGroup] });
    expect(() => applyAddCustomField(before, enumGroup)).toThrow(/duplicate id/i);
  });
});

describe('applyRemoveCustomField', () => {
  it('按 id 移除', () => {
    const before = buildViewConfig({ customFields: [enumGroup, rangeGroup] });
    const after = applyRemoveCustomField(before, 'eg1');
    expect(after.customFields).toEqual([rangeGroup]);
  });

  it('id 不存在 → 原对象返回 (noop)', () => {
    const before = buildViewConfig({ customFields: [enumGroup] });
    const after = applyRemoveCustomField(before, 'unknown');
    expect(after).toBe(before);
  });
});

describe('applyUpdateCustomField', () => {
  it('按 id 替换整个 entry（保留顺序）', () => {
    const before = buildViewConfig({ customFields: [enumGroup, rangeGroup] });
    const updated: CustomField = { ...enumGroup, name: '区域 v2' };
    const after = applyUpdateCustomField(before, updated);
    expect(after.customFields).toEqual([updated, rangeGroup]);
  });

  it('id 不存在 → 原对象返回 (noop)', () => {
    const before = buildViewConfig({ customFields: [enumGroup] });
    const after = applyUpdateCustomField(before, { ...rangeGroup, id: 'xxx' });
    expect(after).toBe(before);
  });
});
