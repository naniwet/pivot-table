/**
 * buildTreeRows 测试
 */
import { describe, expect, it } from 'vitest';

import type { Member } from '../../types/cellSet.js';
import type { BranchEntry, BranchRow } from '../../types/tree.js';

import { pathKey } from './buildBranchQuery.js';
import { buildTreeRows } from './buildTreeRows.js';

function member(name: string): Member {
  return {
    name,
    fieldName: 'fld',
    dimension: 'D',
    level: 'L',
    uniqueName: ['D', name],
  } as unknown as Member;
}

function branchRow(name: string, parentPath: string[] = []): BranchRow {
  return {
    member: member(name),
    fullPath: [...parentPath, name],
    cells: [{ value: 1, formattedValue: '1', isEmpty: false, isMasked: false }],
  };
}

function successBranch(rows: BranchRow[]): BranchEntry {
  return {
    status: 'success',
    rows,
    columnHeader: [],
    cellSet: { rows: [], columns: [], data: [], columnMetadataArray: [], rowFields: [], columnFields: [], fieldNameToUniqueId: {}, totalRowCount: rows.length } as unknown as BranchEntry extends { cellSet: infer C } ? C : never,
    renderModel: { rowHeader: [], columnHeader: [], matrix: [], grandTotalRow: null, columnMeta: [], pagination: { totalRowCount: rows.length } },
  };
}

describe('buildTreeRows', () => {
  it('全折叠 → 仅 root 各行(没父展开)', () => {
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('亚洲'), branchRow('欧洲')])],
    ]);
    const items = buildTreeRows({ branches, expanded: new Set(), maxDepth: 3 });
    expect(items.map((i) => `${i.kind}:${i.kind === 'row' ? i.row.member.name : 'P'}`)).toEqual([
      'row:亚洲',
      'row:欧洲',
    ]);
    // 都是非叶层 → hasChildren=true,expanded=false
    expect(items.every((i) => i.kind === 'row' && i.hasChildren && !i.expanded)).toBe(true);
  });

  it('展开"亚洲" → 紧跟"中国/日本"行;其他保持折叠', () => {
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('亚洲'), branchRow('欧洲')])],
      [pathKey(['亚洲']), successBranch([branchRow('中国', ['亚洲']), branchRow('日本', ['亚洲'])])],
    ]);
    const items = buildTreeRows({
      branches,
      expanded: new Set([pathKey(['亚洲'])]),
      maxDepth: 3,
    });
    const labels = items.map((i) => `${i.kind === 'row' ? i.row.member.name : 'P'}@${i.depth}`);
    expect(labels).toEqual(['亚洲@0', '中国@1', '日本@1', '欧洲@0']);
  });

  it('展开父但 branch 还在 loading → placeholder', () => {
    const ctrl = new AbortController();
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('亚洲')])],
      [pathKey(['亚洲']), { status: 'loading', controller: ctrl }],
    ]);
    const items = buildTreeRows({
      branches,
      expanded: new Set([pathKey(['亚洲'])]),
      maxDepth: 3,
    });
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ kind: 'row', row: { member: { name: '亚洲' } } });
    expect(items[1]).toMatchObject({ kind: 'placeholder', state: 'loading', depth: 1 });
  });

  it('展开父但 branch error → placeholder error,带 error 对象', () => {
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('亚洲')])],
      [pathKey(['亚洲']), { status: 'error', error: new Error('boom') }],
    ]);
    const items = buildTreeRows({
      branches,
      expanded: new Set([pathKey(['亚洲'])]),
      maxDepth: 3,
    });
    const ph = items.find((i) => i.kind === 'placeholder')!;
    expect(ph).toMatchObject({ state: 'error' });
    expect(ph.kind === 'placeholder' && ph.error?.message).toBe('boom');
  });

  it('叶子层节点 hasChildren=false', () => {
    // maxDepth=2 → 第二层(depth=1)就是叶子,不能再展开
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('A')])],
      [pathKey(['A']), successBranch([branchRow('a1', ['A']), branchRow('a2', ['A'])])],
    ]);
    const items = buildTreeRows({
      branches,
      expanded: new Set([pathKey(['A'])]),
      maxDepth: 2,
    });
    const a1 = items.find((i) => i.kind === 'row' && i.row.member.name === 'a1');
    expect(a1).toMatchObject({ kind: 'row', hasChildren: false, depth: 1 });
  });

  it('root 未加载(branches 为空)→ 渲染 loading placeholder', () => {
    const items = buildTreeRows({ branches: new Map(), expanded: new Set(), maxDepth: 3 });
    expect(items).toEqual([
      { kind: 'placeholder', pathKey: 'root', forParentPath: [], depth: 0, state: 'loading' },
    ]);
  });

  it('多层嵌套:展开"亚洲"+"中国",收"欧洲"', () => {
    const branches = new Map<string, BranchEntry>([
      [pathKey([]), successBranch([branchRow('亚洲'), branchRow('欧洲')])],
      [pathKey(['亚洲']), successBranch([branchRow('中国', ['亚洲']), branchRow('日本', ['亚洲'])])],
      [
        pathKey(['亚洲', '中国']),
        successBranch([
          branchRow('北京', ['亚洲', '中国']),
          branchRow('上海', ['亚洲', '中国']),
        ]),
      ],
    ]);
    const items = buildTreeRows({
      branches,
      expanded: new Set([pathKey(['亚洲']), pathKey(['亚洲', '中国'])]),
      maxDepth: 3,
    });
    const labels = items.map((i) => `${i.kind === 'row' ? i.row.member.name : 'P'}@${i.depth}`);
    expect(labels).toEqual([
      '亚洲@0',
      '中国@1',
      '北京@2',
      '上海@2',
      '日本@1',
      '欧洲@0',
    ]);
  });
});
