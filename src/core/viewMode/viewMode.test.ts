/**
 * viewMode — 派生 flag 表驱动测试
 *
 * 不变量:
 *   - isAdhoc + isPivot 互斥(且二选一为 true)
 *   - isTable / isChart / isTree 三选一为 true
 *   - isMatrixView <=> isPivot && isTable
 *   - isDetailView <=> isAdhoc
 */
import { describe, expect, it } from 'vitest';

import { buildViewConfig } from '../../fixtures/builders.js';
import { computeViewMode, type ViewMode } from './viewMode.js';

function makeViewConfig(opts: {
  queryMode?: 'pivot' | 'adhoc';
  displayMode?: 'table' | 'chart' | 'tree';
}) {
  const vc = buildViewConfig({ queryMode: opts.queryMode });
  if (opts.displayMode !== undefined) {
    vc.pageState.displayMode = opts.displayMode;
  }
  return vc;
}

describe('computeViewMode — 默认值', () => {
  it('queryMode 未指定 → isPivot=true', () => {
    const m = computeViewMode(makeViewConfig({}));
    expect(m.isPivot).toBe(true);
    expect(m.isAdhoc).toBe(false);
  });

  it('displayMode 未指定 → isTable=true(默认表格)', () => {
    const m = computeViewMode(makeViewConfig({}));
    expect(m.isTable).toBe(true);
    expect(m.isChart).toBe(false);
    expect(m.isTree).toBe(false);
  });

  it('默认 = pivot + table → isMatrixView=true', () => {
    const m = computeViewMode(makeViewConfig({}));
    expect(m.isMatrixView).toBe(true);
    expect(m.isDetailView).toBe(false);
  });
});

describe('computeViewMode — 表驱动', () => {
  // 6 种组合
  const cases: Array<{
    queryMode: 'pivot' | 'adhoc';
    displayMode: 'table' | 'chart' | 'tree';
    expected: ViewMode;
  }> = [
    {
      queryMode: 'pivot',
      displayMode: 'table',
      expected: {
        isPivot: true, isAdhoc: false,
        isTable: true, isChart: false, isTree: false,
        isMatrixView: true, isDetailView: false,
      },
    },
    {
      queryMode: 'pivot',
      displayMode: 'chart',
      expected: {
        isPivot: true, isAdhoc: false,
        isTable: false, isChart: true, isTree: false,
        isMatrixView: false, isDetailView: false,
      },
    },
    {
      queryMode: 'pivot',
      displayMode: 'tree',
      expected: {
        isPivot: true, isAdhoc: false,
        isTable: false, isChart: false, isTree: true,
        isMatrixView: false, isDetailView: false,
      },
    },
    {
      queryMode: 'adhoc',
      displayMode: 'table',
      expected: {
        isPivot: false, isAdhoc: true,
        isTable: true, isChart: false, isTree: false,
        isMatrixView: false, isDetailView: true,
      },
    },
    {
      queryMode: 'adhoc',
      displayMode: 'chart',
      expected: {
        isPivot: false, isAdhoc: true,
        isTable: false, isChart: true, isTree: false,
        isMatrixView: false, isDetailView: true,
      },
    },
    {
      queryMode: 'adhoc',
      displayMode: 'tree',
      expected: {
        isPivot: false, isAdhoc: true,
        isTable: false, isChart: false, isTree: true,
        isMatrixView: false, isDetailView: true,
      },
    },
  ];

  for (const c of cases) {
    it(`${c.queryMode} + ${c.displayMode} → 期望各 flag 一致`, () => {
      const m = computeViewMode(
        makeViewConfig({ queryMode: c.queryMode, displayMode: c.displayMode }),
      );
      expect(m).toEqual(c.expected);
    });
  }
});

describe('computeViewMode — 不变量', () => {
  it('isAdhoc + isPivot 永远互斥(都是 boolean,XOR 为 true)', () => {
    for (const q of ['pivot', 'adhoc'] as const) {
      const m = computeViewMode(makeViewConfig({ queryMode: q }));
      expect(m.isAdhoc !== m.isPivot).toBe(true);
    }
  });

  it('isTable / isChart / isTree 恰好一个为 true', () => {
    for (const d of ['table', 'chart', 'tree'] as const) {
      const m = computeViewMode(makeViewConfig({ displayMode: d }));
      const trueCount = [m.isTable, m.isChart, m.isTree].filter(Boolean).length;
      expect(trueCount).toBe(1);
    }
  });

  it('isMatrixView <=> isPivot && isTable', () => {
    for (const q of ['pivot', 'adhoc'] as const) {
      for (const d of ['table', 'chart', 'tree'] as const) {
        const m = computeViewMode(makeViewConfig({ queryMode: q, displayMode: d }));
        expect(m.isMatrixView).toBe(m.isPivot && m.isTable);
      }
    }
  });

  it('isDetailView <=> isAdhoc', () => {
    for (const q of ['pivot', 'adhoc'] as const) {
      const m = computeViewMode(makeViewConfig({ queryMode: q }));
      expect(m.isDetailView).toBe(m.isAdhoc);
    }
  });
});
