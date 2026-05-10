/**
 * buildMemberQuery — 取某字段 distinct 成员的查询 (不要求 measure)
 *
 * 用途:loadMembers (P1.5 成员选择器) / 任何只需要"某字段唯一成员列表"的场景。
 * 跟 buildQuery 不同,不要求 viewConfig.values 有 measure。
 */
import { describe, expect, it } from 'vitest';

import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';

import { buildMemberQuery } from './buildMemberQuery.js';

describe('buildMemberQuery', () => {
  it('返回最小 query: rows=[field], 其他默认空', () => {
    const q = buildMemberQuery(FIELD_IDS.provinceLevel, orderModelMetadata);
    expect(q.modelId).toBe(orderModelMetadata.id);
    expect(q.rows).toEqual([FIELD_IDS.provinceLevel]);
    expect(q.columns).toEqual([]);
    expect(q.fields).toEqual([]);
    expect(q.filters).toEqual([]);
    expect(q.measureFilters).toEqual([]);
    expect(q.rowSorts).toEqual([]);
    expect(q.columnSorts).toEqual([]);
    expect(q.customElements).toEqual([]);
  });

  it('queryType 与 buildQuery 一致 ("PivotQuery")', () => {
    const q = buildMemberQuery(FIELD_IDS.provinceLevel, orderModelMetadata);
    expect(q.queryType).toBe('PivotQuery');
  });

  it('pageSettings.rowPageSize 默认 1000 (distinct 集通常 < 1k)', () => {
    const q = buildMemberQuery(FIELD_IDS.provinceLevel, orderModelMetadata);
    expect(q.pageSettings.rowPageSize).toBe(1000);
    expect(q.pageSettings.rowPageNo).toBe(1);
  });

  it('支持自定义 pageSize', () => {
    const q = buildMemberQuery(FIELD_IDS.provinceLevel, orderModelMetadata, {
      pageSize: 5000,
    });
    expect(q.pageSettings.rowPageSize).toBe(5000);
  });

  it('字段不在 metadata 中 → throw (防御性)', () => {
    expect(() =>
      buildMemberQuery('UnknownField', orderModelMetadata),
    ).toThrow(/not in metadata/i);
  });
});
