/**
 * treeRowItems 测试 — 不变量:
 *   I1. 全展开:每个 leaf 前都按 prefix 递归补 parent(只补一次)
 *   I2. 折叠某 prefix → 该 subtree 的 leaf/更深 parent 全部消失,但被折叠的 parent 自身仍在
 *   I3. 顺序保留:leaf 顺序 vs 输入 rowHeader 顺序一致
 *   I4. depth 正确(0=root level,深度 = prefix.length-1)
 *   I5. key 用作折叠判断 — buildTreeRowItems(rh, new Set([key])) 真折叠
 */
import { describe, expect, it } from 'vitest';

import type { Member } from '../../types/cellSet.js';
import type { RowHeaderNode } from '../../types/renderModel.js';

import { buildTreeRowItems, TREE_PATH_SEPARATOR } from './treeRowItems.js';

const dummyMember: Member = {
  fieldName: 'x',
  name: 'x',
  dimension: 'X',
  level: 'L',
} as unknown as Member;

function rh(fullPaths: string[][]): RowHeaderNode[] {
  return fullPaths.map((fp, i) => ({
    member: { ...dummyMember, name: fp[fp.length - 1] ?? '' },
    depth: fp.length - 1,
    rowIndex: i,
    fullPath: fp,
    hierarchyFieldName: null,
    canDrillDown: false,
    canDrillUp: false,
  }));
}

describe('buildTreeRowItems', () => {
  it('I1: 单层 leaf — 没有 parent,只输出 leaf 本身', () => {
    const out = buildTreeRowItems(rh([['A'], ['B']]), new Set());
    expect(out.map((i) => `${i.kind}:${i.label}`)).toEqual(['leaf:A', 'leaf:B']);
  });

  it('I1: 两层 leaf — emit 父 + 子(父只 emit 一次)', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', 'a1'],
        ['A', 'a2'],
        ['B', 'b1'],
      ]),
      new Set(),
    );
    expect(out.map((i) => `${i.kind}:${i.label}`)).toEqual([
      'parent:A',
      'leaf:a1',
      'leaf:a2',
      'parent:B',
      'leaf:b1',
    ]);
  });

  it('I1: 三层 — parent 链(只第一次出现 emit)', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', 'B1', 'c1'],
        ['A', 'B1', 'c2'],
        ['A', 'B2', 'c3'],
      ]),
      new Set(),
    );
    expect(out.map((i) => `${i.kind}:${i.label}@${i.depth}`)).toEqual([
      'parent:A@0',
      'parent:B1@1',
      'leaf:c1@2',
      'leaf:c2@2',
      'parent:B2@1',
      'leaf:c3@2',
    ]);
  });

  it('I2: 折叠 A → 整 A 子树消失,但 parent A 仍在(用户能展开)', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', 'a1'],
        ['A', 'a2'],
        ['B', 'b1'],
      ]),
      new Set(['A']),
    );
    expect(out.map((i) => `${i.kind}:${i.label}`)).toEqual(['parent:A', 'parent:B', 'leaf:b1']);
    // parent A 应该标记 collapsed
    const parentA = out.find((i) => i.kind === 'parent' && i.label === 'A')!;
    expect(parentA).toMatchObject({ collapsed: true });
  });

  it('I2: 折叠中间层 — A.B1 折叠 → c1/c2 消失但 B1 仍在,c3 正常', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', 'B1', 'c1'],
        ['A', 'B1', 'c2'],
        ['A', 'B2', 'c3'],
      ]),
      new Set([`A${TREE_PATH_SEPARATOR}B1`]),
    );
    expect(out.map((i) => `${i.kind}:${i.label}`)).toEqual([
      'parent:A',
      'parent:B1',
      'parent:B2',
      'leaf:c3',
    ]);
  });

  it('I3: leaf 顺序保留', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', '1'],
        ['B', '2'],
        ['A', '3'],
      ]),
      new Set(),
    );
    // 注意 ['A','3'] 的 parent A 在 ['A','1'] 时已 emit,不重复
    const leafs = out.filter((i) => i.kind === 'leaf').map((i) => i.label);
    expect(leafs).toEqual(['1', '2', '3']);
  });

  it('I4: depth 跟 prefix.length-1 一致', () => {
    const out = buildTreeRowItems(rh([['x', 'y', 'z']]), new Set());
    expect(out).toEqual([
      expect.objectContaining({ kind: 'parent', label: 'x', depth: 0 }),
      expect.objectContaining({ kind: 'parent', label: 'y', depth: 1 }),
      expect.objectContaining({ kind: 'leaf', label: 'z', depth: 2 }),
    ]);
  });

  it('I5: rowIndex 跟原 rowHeader 顺序对齐', () => {
    const out = buildTreeRowItems(
      rh([
        ['A', 'a1'],
        ['A', 'a2'],
        ['B', 'b1'],
      ]),
      new Set(),
    );
    const leafIndexes = out
      .filter((i) => i.kind === 'leaf')
      .map((i) => (i as { rowIndex: number }).rowIndex);
    expect(leafIndexes).toEqual([0, 1, 2]);
  });

  it('空 rowHeader → 空数组', () => {
    expect(buildTreeRowItems([], new Set())).toEqual([]);
  });
});
