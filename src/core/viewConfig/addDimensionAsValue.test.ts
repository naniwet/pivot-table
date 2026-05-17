/**
 * addDimensionAsValue 测试 — I1-I5 不变量
 *
 * mintId 全程注入 deterministic 'dam_test' — 验证 I4(只在新建路径调用)用计数 spy
 */
import { describe, expect, it, vi } from 'vitest';

import { buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import type { CustomDimAsMeasureField } from '../../types/viewConfig.js';

import { addDimensionAsValue } from './addDimensionAsValue.js';

const TEST_ID = 'dam_test_id';
const newMintId = () => vi.fn(() => TEST_ID);

describe('addDimensionAsValue — I3/I5 新建路径', () => {
  it('I3: 不存在匹配 customField → 新建 + 追加 values', () => {
    const state = buildViewConfig();
    const mintId = newMintId();
    const next = addDimensionAsValue(state, 'sales_rep', 'COUNT_DISTINCT', mintId);
    expect(next.customFields).toHaveLength(1);
    expect(next.customFields[0]).toMatchObject({
      id: TEST_ID,
      kind: 'dim_as_measure',
      sourceField: 'sales_rep',
      aggregator: 'COUNT_DISTINCT',
    });
    expect(next.values).toHaveLength(1);
    expect(next.values[0]).toEqual({
      measureName: TEST_ID,
      aggregator: null,
      quickCalc: null,
    });
  });

  it('I5: 显示名格式 "<sourceField>(<aggregator>)"', () => {
    const next = addDimensionAsValue(
      buildViewConfig(),
      'product_name',
      'COUNT',
      newMintId(),
    );
    expect((next.customFields[0] as CustomDimAsMeasureField).name).toBe(
      'product_name(COUNT)',
    );
  });

  it('I4: 新建路径 mintId 被调用 1 次', () => {
    const mintId = newMintId();
    addDimensionAsValue(buildViewConfig(), 'x', 'SUM', mintId);
    expect(mintId).toHaveBeenCalledTimes(1);
  });

  it('I3: 已有其他 customField → 追加(不覆盖)', () => {
    const existingCf: CustomDimAsMeasureField = {
      id: 'dam_existing', name: 'foo(SUM)', kind: 'dim_as_measure',
      sourceField: 'foo', aggregator: 'SUM', dataFormat: '',
    };
    const state = buildViewConfig({ customFields: [existingCf] });
    const next = addDimensionAsValue(state, 'bar', 'AVG', newMintId());
    expect(next.customFields).toHaveLength(2);
    expect(next.customFields[0]).toBe(existingCf); // 引用保留
  });
});

describe('addDimensionAsValue — I2 复用 customField,仅追加 values', () => {
  it('I2: 已有同 sourceField+aggregator customField,values 不含 → 追加 values,不新建', () => {
    const existingCf: CustomDimAsMeasureField = {
      id: 'dam_existing', name: 'sales_rep(COUNT_DISTINCT)', kind: 'dim_as_measure',
      sourceField: 'sales_rep', aggregator: 'COUNT_DISTINCT', dataFormat: '',
    };
    const state = buildViewConfig({ customFields: [existingCf] });
    const mintId = newMintId();
    const next = addDimensionAsValue(state, 'sales_rep', 'COUNT_DISTINCT', mintId);
    expect(next.customFields).toHaveLength(1); // 未新建
    expect(next.customFields[0]).toBe(existingCf);
    expect(next.values).toHaveLength(1);
    expect(next.values[0]!.measureName).toBe('dam_existing');
  });

  it('I4: 复用路径 mintId 不被调用', () => {
    const existingCf: CustomDimAsMeasureField = {
      id: 'dam_existing', name: 'foo(SUM)', kind: 'dim_as_measure',
      sourceField: 'foo', aggregator: 'SUM', dataFormat: '',
    };
    const state = buildViewConfig({ customFields: [existingCf] });
    const mintId = newMintId();
    addDimensionAsValue(state, 'foo', 'SUM', mintId);
    expect(mintId).not.toHaveBeenCalled();
  });
});

describe('addDimensionAsValue — I1 完全 no-op', () => {
  it('I1: customField 已有 + values 已含同 id → 入参引用', () => {
    const existingCf: CustomDimAsMeasureField = {
      id: 'dam_existing', name: 'foo(SUM)', kind: 'dim_as_measure',
      sourceField: 'foo', aggregator: 'SUM', dataFormat: '',
    };
    const state = buildViewConfig({
      customFields: [existingCf],
      values: [buildValueField({ measureName: 'dam_existing' })],
    });
    const mintId = newMintId();
    expect(addDimensionAsValue(state, 'foo', 'SUM', mintId)).toBe(state);
    expect(mintId).not.toHaveBeenCalled();
  });
});

describe('addDimensionAsValue — 区分 aggregator 关键性', () => {
  it('同 sourceField 但不同 aggregator → 新建(不复用)', () => {
    const existingCf: CustomDimAsMeasureField = {
      id: 'dam_sum', name: 'amount(SUM)', kind: 'dim_as_measure',
      sourceField: 'amount', aggregator: 'SUM', dataFormat: '',
    };
    const state = buildViewConfig({ customFields: [existingCf] });
    const mintId = newMintId();
    const next = addDimensionAsValue(state, 'amount', 'AVG', mintId);
    expect(next.customFields).toHaveLength(2); // 新建
    expect(mintId).toHaveBeenCalledTimes(1);
  });
});
