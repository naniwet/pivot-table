/**
 * cycleRowSort — 行轴排序三态机：DESC → ASC → none → DESC
 *
 * P0 仅"按度量排序"（ByMeasure），点击列表头切换。
 * 简化：rowSorts 数组最多含一项（场景 B），多列排序留 P1.5。
 */
import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';

import { cycleRowSort } from './cycleRowSort.js';

const MEASURE = '销售额_1624531356707';

describe('cycleRowSort', () => {
  it('starts cycle: empty rowSorts → DESC', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
      rowSorts: [],
    });
    const after = cycleRowSort(before, MEASURE);
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('DESC → ASC for the same measure', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
    });
    const after = cycleRowSort(before, MEASURE);
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'ASC' },
    ]);
  });

  it('ASC → none (empty rowSorts)', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'ASC' }],
    });
    const after = cycleRowSort(before, MEASURE);
    expect(after.rowSorts).toEqual([]);
  });

  it('clicking a different measure replaces the existing sort starting from DESC', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: 'other', direction: 'ASC' }],
    });
    const after = cycleRowSort(before, MEASURE);
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('returns a new ViewConfig (immutable update)', () => {
    const before = buildViewConfig();
    const after = cycleRowSort(before, MEASURE);
    expect(after).not.toBe(before);
    expect(after.rowSorts).not.toBe(before.rowSorts);
  });

  it('does not mutate other ViewConfig fields', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow()],
      values: [buildValueField()],
    });
    const after = cycleRowSort(before, MEASURE);
    expect(after.rows).toBe(before.rows);
    expect(after.values).toBe(before.values);
    expect(after.pageState).toBe(before.pageState);
  });
});

describe('cycleRowSort — mode="group" (P2 BASC/BDESC 分组内排序)', () => {
  it('group 模式：empty rowSorts → BDESC 起步', () => {
    const before = buildViewConfig({ rowSorts: [] });
    const after = cycleRowSort(before, MEASURE, 'ByMeasure', { mode: 'group' });
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'BDESC' },
    ]);
  });

  it('group 模式：BDESC → BASC（保持 group 模式）', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'BDESC' }],
    });
    const after = cycleRowSort(before, MEASURE, 'ByMeasure', { mode: 'group' });
    expect(after.rowSorts[0]!.direction).toBe('BASC');
  });

  it('group 模式：BASC → none', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'BASC' }],
    });
    const after = cycleRowSort(before, MEASURE, 'ByMeasure', { mode: 'group' });
    expect(after.rowSorts).toEqual([]);
  });

  it('global 模式 click → group 模式 click 同字段：从 ASC 切到 BASC（mode 切换）', () => {
    // 已有 ASC（global），用户 alt+click 想转分组内 → 触发新 cycle，从 BDESC 起步
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'ASC' }],
    });
    const after = cycleRowSort(before, MEASURE, 'ByMeasure', { mode: 'group' });
    // current=ASC 是 ascendingDir → 触发"原位 → none"
    expect(after.rowSorts).toEqual([]);
  });
});

describe('cycleRowSort — multi=true (P1.5 多列排序，shift+click)', () => {
  const M2 = 'profit';

  it('multi 模式：empty rowSorts → 追加 DESC', () => {
    const before = buildViewConfig({ rowSorts: [] });
    const after = cycleRowSort(before, MEASURE, 'ByMeasure', { multi: true });
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('multi 模式：已有一列后 click 第二列 → append 第二列 DESC，第一列保留', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
    });
    const after = cycleRowSort(before, M2, 'ByMeasure', { multi: true });
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
      { type: 'ByMeasure', measureName: M2, direction: 'DESC' },
    ]);
  });

  it('multi 模式：再次 shift+click 同列 DESC → ASC（原位切换，其他保留）', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
        { type: 'ByMeasure', measureName: M2, direction: 'DESC' },
      ],
    });
    const after = cycleRowSort(before, M2, 'ByMeasure', { multi: true });
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
      { type: 'ByMeasure', measureName: M2, direction: 'ASC' },
    ]);
  });

  it('multi 模式：第三次 shift+click 同列 ASC → 移除该列（其他保留）', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
        { type: 'ByMeasure', measureName: M2, direction: 'ASC' },
      ],
    });
    const after = cycleRowSort(before, M2, 'ByMeasure', { multi: true });
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('普通 click（multi=false / 默认）→ 替换为单列（即使其他列存在）', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
        { type: 'ByMeasure', measureName: M2, direction: 'ASC' },
      ],
    });
    const after = cycleRowSort(before, 'newMeasure');
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: 'newMeasure', direction: 'DESC' },
    ]);
  });
});
