/**
 * treeColumnItems 测试 — 不变量:
 *   I1. 没 collapsed → filteredLevels 跟 input 同形;hidden 集为空
 *   I2. 折叠某 parent → 该 parent 后续 level 的 cell 全消失;数据列也藏起来(除 parent.startCol)
 *   I3. collapsed parent 自身在 filtered 里 colSpan=1
 *   I4. 多层折叠累计生效
 */
import { describe, expect, it } from 'vitest';

import type { ColumnHeaderGroupCell } from '../../types/renderModel.js';

import { buildColumnCellKey, buildTreeColumnLevels } from './treeColumnItems.js';

function cell(label: string, colSpan: number, isMeasure = false): ColumnHeaderGroupCell {
  return { fieldName: label, label, colSpan, isMeasure };
}

describe('buildTreeColumnLevels', () => {
  it('I1: 空 input', () => {
    const r = buildTreeColumnLevels([], new Set());
    expect(r.filteredLevels).toEqual([]);
    expect(r.hiddenBodyCols.size).toBe(0);
    expect(r.placeholderBodyCols.size).toBe(0);
  });

  it('I1: 没 collapsed → 透传(only 加了 startCol/key/isLeaf 元数据)', () => {
    const levels = [
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    const r = buildTreeColumnLevels(levels, new Set());
    expect(r.filteredLevels[0]!.length).toBe(2);
    expect(r.filteredLevels[1]!.length).toBe(4);
    expect(r.hiddenBodyCols.size).toBe(0);
    expect(r.placeholderBodyCols.size).toBe(0);
    expect(r.filteredLevels[0]![0]).toMatchObject({ label: 'A', startCol: 0 });
    expect(r.filteredLevels[0]![1]).toMatchObject({ label: 'B', startCol: 2 });
  });

  it('I2 + I3: 折叠 A → A 自身 colSpan=1, A 下两 leaf 消失, hidden 含 col 1', () => {
    const levels = [
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    const collapsed = new Set([buildColumnCellKey(0, 0)]); // A
    const r = buildTreeColumnLevels(levels, collapsed);
    // hidden = {1}(A 的第二个数据列);col 0 是 placeholder
    expect([...r.hiddenBodyCols].sort((a, b) => a - b)).toEqual([1]);
    expect(r.placeholderBodyCols.get(0)?.key).toBe(buildColumnCellKey(0, 0));
    // A 自身 colSpan=1, B 还在 colSpan=2
    expect(r.filteredLevels[0]).toEqual([
      expect.objectContaining({ label: 'A', colSpan: 1, collapsed: true }),
      expect.objectContaining({ label: 'B', colSpan: 2 }),
    ]);
    // 第二层:a1/a2 被 A 的 rowSpan 覆盖,跳过;b1/b2 保留
    expect(r.filteredLevels[1]!.map((c) => c.label)).toEqual(['b1', 'b2']);
    // I-A 不变量:body 一行 = origCols(4) - hidden(1) = 3 td(其中 col 0 是 placeholder)
    expect(4 - r.hiddenBodyCols.size).toBe(3);
  });

  it('I4: 三层结构 — 折叠 X(level0)整个 subtree 折叠掉', () => {
    const levels = [
      [cell('X', 4)],
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    const r = buildTreeColumnLevels(levels, new Set([buildColumnCellKey(0, 0)]));
    // X collapsed → cols 1,2,3 hidden(0 留给 X 当 placeholder)
    expect([...r.hiddenBodyCols].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(r.placeholderBodyCols.get(0)?.key).toBe(buildColumnCellKey(0, 0));
    // A/B 完全在 X 的 rowSpan 覆盖下 → 不渲染
    expect(r.filteredLevels[1]!.length).toBe(0);
    expect(r.filteredLevels[2]!.length).toBe(0);
    expect(r.filteredLevels[0]).toEqual([
      expect.objectContaining({ label: 'X', colSpan: 1, collapsed: true }),
    ]);
  });

  it('I4: 部分 hidden — 折叠 A(level1)只藏 a1/a2,b1/b2 保留', () => {
    const levels = [
      [cell('X', 4)],
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    const r = buildTreeColumnLevels(levels, new Set([buildColumnCellKey(1, 0)]));
    // A collapsed → col 1 hidden;col 0 是 placeholder
    expect([...r.hiddenBodyCols]).toEqual([1]);
    expect(r.placeholderBodyCols.get(0)?.key).toBe(buildColumnCellKey(1, 0));
    expect(r.placeholderBodyCols.get(0)?.colSpan).toBe(2); // A 原 colSpan=2
    // X colSpan = 4 - 1 hidden = 3
    expect(r.filteredLevels[0]).toEqual([
      expect.objectContaining({ label: 'X', colSpan: 3 }),
    ]);
    // A 自身 colSpan=1, B 还是 colSpan=2
    expect(r.filteredLevels[1]!.map((c) => `${c.label}:${c.colSpan}`)).toEqual([
      'A:1',
      'B:2',
    ]);
    // 第三层:a1/a2 被 A rowSpan 覆盖,b1/b2 保留
    expect(r.filteredLevels[2]!.map((c) => c.label)).toEqual(['b1', 'b2']);
  });

  it('I-B: header 每层 colSpan 之和 ≤ 可见 body 列数(差额是被 ancestor rowSpan 覆盖)', () => {
    const levels = [
      [cell('X', 4)],
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    for (const collapsed of [
      new Set<string>(),
      new Set([buildColumnCellKey(0, 0)]),
      new Set([buildColumnCellKey(1, 0)]),
      new Set([buildColumnCellKey(1, 2)]),
    ]) {
      const r = buildTreeColumnLevels(levels, collapsed);
      const visibleBodyCount = 4 - r.hiddenBodyCols.size;
      for (const lvl of r.filteredLevels) {
        const sum = lvl.reduce((s, c) => s + c.colSpan, 0);
        // 每层 colSpan 总和 ≤ visibleBodyCount(差额 = 被上游 collapsed 的 rowSpan 占据的列数)
        expect(sum).toBeLessThanOrEqual(visibleBodyCount);
      }
    }
  });

  it('I-B+: 没 collapsed 时每层 colSpan 总和 = origCols', () => {
    const levels = [
      [cell('X', 4)],
      [cell('A', 2), cell('B', 2)],
      [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)],
    ];
    const r = buildTreeColumnLevels(levels, new Set());
    for (const lvl of r.filteredLevels) {
      const sum = lvl.reduce((s, c) => s + c.colSpan, 0);
      expect(sum).toBe(4);
    }
  });

  // ============================================================
  // 度量层下方不允许折叠(用户反馈:树形列头里度量列不该出现 ▼)
  // 规则:某 level 下一 level 整层 isMeasure=true → 该 level 所有 cell hasChildren=false
  // ============================================================
  describe('hasChildren 在度量层之上要为 false', () => {
    it('叶层是度量(销售成本/销售额)→ 上一层 dim cell hasChildren=false(不可折叠)', () => {
      // 模拟用户截图:产品类别 → 产品名 → [销售成本, 销售额](度量)
      const levels = [
        [cell('白色家电', 4)], // 产品类别(dim)
        [cell('冰柜', 2), cell('冰箱', 2)], // 产品名(dim) — 下一层是度量,不该有 ▼
        [
          cell('销售成本', 1, true), // 度量(isMeasure=true)
          cell('销售额', 1, true),
          cell('销售成本', 1, true),
          cell('销售额', 1, true),
        ],
      ];
      const r = buildTreeColumnLevels(levels, new Set());

      // 白色家电(level 0):下一 level 是 dim(冰柜/冰箱),仍可折叠 → hasChildren=true
      expect(r.filteredLevels[0]![0]).toMatchObject({
        label: '白色家电', hasChildren: true,
      });
      // 冰柜/冰箱(level 1):下一 level 是度量 → hasChildren=false(本次修复点)
      expect(r.filteredLevels[1]![0]).toMatchObject({
        label: '冰柜', hasChildren: false,
      });
      expect(r.filteredLevels[1]![1]).toMatchObject({
        label: '冰箱', hasChildren: false,
      });
      // 度量层自身是 leaf → hasChildren=false(本来就是)
      expect(r.filteredLevels[2]!.every((c) => c.hasChildren === false)).toBe(true);
    });

    it('全是 dim(没度量层)→ 非叶 cell 还是可折叠', () => {
      // 度量在行轴(列轴全 dim)的场景 — 行为不变
      const levels = [
        [cell('A', 2), cell('B', 2)], // dim
        [cell('a1', 1), cell('a2', 1), cell('b1', 1), cell('b2', 1)], // dim
      ];
      const r = buildTreeColumnLevels(levels, new Set());
      expect(r.filteredLevels[0]!.every((c) => c.hasChildren === true)).toBe(true);
    });

    it('度量在中间层(很罕见但合法)→ 上方 dim 也不可折叠', () => {
      const levels = [
        [cell('A', 4)], // dim
        [cell('SUM', 2, true), cell('AVG', 2, true)], // 度量层
        [cell('x', 1), cell('y', 1), cell('x', 1), cell('y', 1)], // dim
      ];
      const r = buildTreeColumnLevels(levels, new Set());
      // A 下面是度量 → hasChildren=false
      expect(r.filteredLevels[0]![0]).toMatchObject({ label: 'A', hasChildren: false });
      // 度量层下面是 dim → hasChildren=true(度量不可折叠;但这条逻辑只对"度量是叶"
      // 的本 issue 场景,中间层度量本身可不可折叠不在本修复范围)
    });
  });
});
