/**
 * conditionalFormatActions 测试 — ADD/UPDATE/REMOVE 不变量 I1-I6
 */
import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';
import type { ConditionalFormatRule } from '../../types/viewConfig.js';

import {
  addConditionalFormat,
  removeConditionalFormat,
  updateConditionalFormat,
} from './conditionalFormatActions.js';

const ruleA: ConditionalFormatRule = {
  id: 'r1',
  measure: 'sales',
  kind: 'threshold',
  conditions: [{ op: 'gt', value: 100, style: { bg: 'red' } }],
};
const ruleB: ConditionalFormatRule = {
  id: 'r2',
  measure: 'cost',
  kind: 'dataBar',
  color: 'blue',
  range: 'auto',
};

describe('addConditionalFormat — I1/I2', () => {
  it('I2: 新 id → 追加末尾;原 conditionalFormats undefined 也能加', () => {
    const state = buildViewConfig();
    expect(state.pageState.conditionalFormats).toBeUndefined();
    const next = addConditionalFormat(state, ruleA);
    expect(next.pageState.conditionalFormats).toEqual([ruleA]);
  });

  it('I2: 多次 add → 按调用顺序排列', () => {
    let state = buildViewConfig();
    state = addConditionalFormat(state, ruleA);
    state = addConditionalFormat(state, ruleB);
    expect(state.pageState.conditionalFormats).toEqual([ruleA, ruleB]);
  });

  it('I1: 同 id 已存在 → 返回入参引用(no-op)', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    expect(addConditionalFormat(state, ruleA)).toBe(state);
  });
});

describe('updateConditionalFormat — I3/I4', () => {
  it('I4: id 存在 → 替换 rule,顺序保留', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA, ruleB] },
    });
    const ruleAUpdated: ConditionalFormatRule = {
      ...ruleA,
      conditions: [{ op: 'lt', value: 0, style: { bg: 'green' } }],
    };
    const next = updateConditionalFormat(state, ruleAUpdated);
    const list = next.pageState.conditionalFormats!;
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(ruleAUpdated);
    expect(list[1]).toEqual(ruleB);
  });

  it('I3: id 不存在 → 返回入参引用(no-op)', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    expect(
      updateConditionalFormat(state, { ...ruleB, id: '__nonexistent__' }),
    ).toBe(state);
  });

  it('I3: conditionalFormats 缺省 → no-op(等同 id 不存在)', () => {
    const state = buildViewConfig();
    expect(updateConditionalFormat(state, ruleA)).toBe(state);
  });
});

describe('removeConditionalFormat — I5/I6', () => {
  it('I6: id 存在 → 按 id 过滤', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA, ruleB] },
    });
    const next = removeConditionalFormat(state, 'r1');
    expect(next.pageState.conditionalFormats).toEqual([ruleB]);
  });

  it('I5: id 不存在 → 返回入参引用(no-op)', () => {
    const state = buildViewConfig({
      pageState: { ...buildViewConfig().pageState, conditionalFormats: [ruleA] },
    });
    expect(removeConditionalFormat(state, 'nope')).toBe(state);
  });

  it('I5: conditionalFormats 缺省 → no-op', () => {
    const state = buildViewConfig();
    expect(removeConditionalFormat(state, 'r1')).toBe(state);
  });
});
