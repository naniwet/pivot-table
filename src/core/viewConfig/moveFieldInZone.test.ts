/**
 * moveFieldInZone — 调整 zone 内字段顺序（上移 / 下移一格）
 *
 * 用途：DropZones 上下箭头按钮 → 调整列轴/行轴的字段层次顺序。
 * 这对 cross-table 列头合并尤其关键 — 列轴第一个字段是顶层（合并最多），
 * 最后一个是最深层（每列变）。用户拖入顺序可能不符合预期，需要 UI reorder。
 *
 * 设计：
 *   - 纯函数；输入 zone + fieldName + direction，输出新 ViewConfig
 *   - 已经在边界（首项 'up' / 末项 'down'）→ 原对象返回（noop，避免无谓 rerender）
 *   - 不存在 fieldName → 原对象返回（防御）
 *   - filter zone：仅维度 leaf filters 重排（measureFilters 是另一个数组，需要时再加）
 */
import { describe, expect, it } from 'vitest';

import {
  buildHierarchyRow,
  buildDimensionRow,
  buildLeafFilter,
  buildMeasureFilter,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';

import { moveFieldInZone } from './moveFieldInZone.js';

describe('moveFieldInZone — column zone', () => {
  it('"down" 把字段往后移一位（典型场景：列头合并 cross-table）', () => {
    const before = buildViewConfig({
      columns: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
        { fieldName: 'C', type: 'Dimension' },
      ],
    });
    const after = moveFieldInZone(before, 'column', 'A', 'down');
    expect(after.columns.map((f) => f.fieldName)).toEqual(['B', 'A', 'C']);
  });

  it('"up" 把字段往前移一位', () => {
    const before = buildViewConfig({
      columns: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
        { fieldName: 'C', type: 'Dimension' },
      ],
    });
    const after = moveFieldInZone(before, 'column', 'C', 'up');
    expect(after.columns.map((f) => f.fieldName)).toEqual(['A', 'C', 'B']);
  });

  it('"up" 在首项 → 原对象返回（noop）', () => {
    const before = buildViewConfig({
      columns: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const after = moveFieldInZone(before, 'column', 'A', 'up');
    expect(after).toBe(before);
  });

  it('"down" 在末项 → 原对象返回（noop）', () => {
    const before = buildViewConfig({
      columns: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
    });
    const after = moveFieldInZone(before, 'column', 'B', 'down');
    expect(after).toBe(before);
  });

  it('字段不存在 → 原对象返回', () => {
    const before = buildViewConfig({
      columns: [{ fieldName: 'A', type: 'Dimension' }],
    });
    const after = moveFieldInZone(before, 'column', 'X', 'down');
    expect(after).toBe(before);
  });
});

describe('moveFieldInZone — row zone', () => {
  it('row zone 重排（hierarchy + dimension 混合）', () => {
    const before = buildViewConfig({
      rows: [
        buildHierarchyRow({ fieldName: 'h1' }),
        buildDimensionRow({ fieldName: 'd1' }),
      ],
    });
    const after = moveFieldInZone(before, 'row', 'h1', 'down');
    expect(after.rows.map((r) => r.fieldName)).toEqual(['d1', 'h1']);
  });
});

describe('moveFieldInZone — value zone', () => {
  it('value zone 重排（多 measure 时改顺序）', () => {
    const before = buildViewConfig({
      values: [
        buildValueField({ measureName: 'sales' }),
        buildValueField({ measureName: 'profit' }),
      ],
    });
    const after = moveFieldInZone(before, 'value', 'sales', 'down');
    expect(after.values.map((v) => v.measureName)).toEqual(['profit', 'sales']);
  });
});

describe('moveFieldInZone — filter zone', () => {
  it('维度 leaf filter 重排（field 名匹配）', () => {
    const before = buildViewConfig({
      filters: [
        buildLeafFilter({ field: 'A' }),
        buildLeafFilter({ field: 'B' }),
      ],
    });
    const after = moveFieldInZone(before, 'filter', 'A', 'down');
    expect(after.filters.map((f) => (f.kind === 'leaf' ? f.field : '?'))).toEqual(
      ['B', 'A'],
    );
  });

  it('measureFilter 重排（measureName 匹配）', () => {
    const before = buildViewConfig({
      measureFilters: [
        buildMeasureFilter({ measureName: 'sales' }),
        buildMeasureFilter({ measureName: 'profit' }),
      ],
    });
    const after = moveFieldInZone(before, 'filter', 'sales', 'down');
    expect(
      after.measureFilters.map((mf) =>
        'kind' in mf && mf.kind === 'group' ? '<group>' : mf.measureName,
      ),
    ).toEqual(['profit', 'sales']);
  });
});
