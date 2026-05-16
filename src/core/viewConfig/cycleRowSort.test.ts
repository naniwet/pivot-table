/**
 * cycleRowSort — 行轴排序三态机：DESC → ASC → none → DESC
 *
 * P0 仅"按度量排序"（ByMeasure），点击列表头切换。
 * 简化：rowSorts 数组最多含一项（场景 B），多列排序留 P1.5。
 */
import { describe, expect, it } from 'vitest';

import { buildHierarchyRow, buildValueField, buildViewConfig } from '../../fixtures/builders.js';

import { cycleRowSort, setCustomSortOrder, removeCustomSortOrder } from './cycleRowSort.js';

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

describe('setCustomSortOrder', () => {
  it('adds ByCustomCaption sort when no existing sort for the field', () => {
    const before = buildViewConfig({ rowSorts: [] });
    const after = setCustomSortOrder(before, 'ShipProvince', ['华南', '华北', '华东']);
    expect(after.rowSorts).toEqual([
      { type: 'ByCustomCaption', fieldName: 'ShipProvince', direction: 'ASC', customCaption: ['华南', '华北', '华东'] },
    ]);
  });

  it('replaces existing ByCustomCaption for the same field', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByCustomCaption', fieldName: 'ShipProvince', direction: 'ASC', customCaption: ['华北', '华南'] },
      ],
    });
    const after = setCustomSortOrder(before, 'ShipProvince', ['华东', '华南', '华北'], 'DESC');
    expect(after.rowSorts).toEqual([
      { type: 'ByCustomCaption', fieldName: 'ShipProvince', direction: 'DESC', customCaption: ['华东', '华南', '华北'] },
    ]);
  });

  it('appends alongside existing ByMeasure sort', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
    });
    const after = setCustomSortOrder(before, 'ShipProvince', ['华南', '华东']);
    expect(after.rowSorts).toHaveLength(2);
    expect(after.rowSorts[0]).toMatchObject({ type: 'ByMeasure' });
    expect(after.rowSorts[1]).toMatchObject({ type: 'ByCustomCaption', fieldName: 'ShipProvince' });
  });

  it('default direction is ASC', () => {
    const before = buildViewConfig({ rowSorts: [] });
    const after = setCustomSortOrder(before, 'Region', ['华南']);
    expect(after.rowSorts[0]!.direction).toBe('ASC');
  });

  it('returns new ViewConfig (immutable)', () => {
    const before = buildViewConfig({ rowSorts: [] });
    const after = setCustomSortOrder(before, 'Region', ['华南']);
    expect(after).not.toBe(before);
    expect(after.rowSorts).not.toBe(before.rowSorts);
  });
});

describe('removeCustomSortOrder', () => {
  it('removes ByCustomCaption for given field', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByCustomCaption', fieldName: 'ShipProvince', direction: 'ASC', customCaption: ['华南'] },
      ],
    });
    const after = removeCustomSortOrder(before, 'ShipProvince');
    expect(after.rowSorts).toEqual([]);
  });

  it('leaves other sort types untouched', () => {
    const before = buildViewConfig({
      rowSorts: [
        { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
        { type: 'ByCustomCaption', fieldName: 'Region', direction: 'ASC', customCaption: ['华东'] },
      ],
    });
    const after = removeCustomSortOrder(before, 'Region');
    expect(after.rowSorts).toEqual([
      { type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' },
    ]);
  });

  it('no-op when field not in custom sorts', () => {
    const before = buildViewConfig({
      rowSorts: [{ type: 'ByMeasure', measureName: MEASURE, direction: 'DESC' }],
    });
    const after = removeCustomSortOrder(before, 'ShipProvince');
    expect(after.rowSorts).toEqual(before.rowSorts);
  });
});
