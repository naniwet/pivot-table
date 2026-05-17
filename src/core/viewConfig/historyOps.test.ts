/**
 * historyOps 测试 — I1-I5 不变量
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_HISTORY,
  clearHistory,
  isSignificantAction,
  pushHistory,
  redoHistory,
  undoHistory,
} from './historyOps.js';

describe('historyOps — I1 pushHistory', () => {
  it('空栈 push → past=[s], future=[]', () => {
    expect(pushHistory({ past: [], future: [] }, 'a')).toEqual({ past: ['a'], future: [] });
  });

  it('已有 past 再 push → 末尾追加', () => {
    expect(pushHistory({ past: ['a', 'b'], future: [] }, 'c')).toEqual({
      past: ['a', 'b', 'c'],
      future: [],
    });
  });

  it('push 时清掉 future(经典编辑器行为)', () => {
    expect(pushHistory({ past: ['a'], future: ['x', 'y'] }, 'b')).toEqual({
      past: ['a', 'b'],
      future: [],
    });
  });

  it('past 超 maxHistory(3)→ 从头丢一个,保最近 3', () => {
    const result = pushHistory({ past: [1, 2, 3], future: [] }, 4, 3);
    expect(result.past).toEqual([2, 3, 4]);
  });

  it('默认 maxHistory=50(MAX_HISTORY 常量)', () => {
    expect(MAX_HISTORY).toBe(50);
    const past = Array.from({ length: 50 }, (_, i) => i);
    const next = pushHistory({ past, future: [] }, 50);
    expect(next.past).toHaveLength(50);
    expect(next.past[0]).toBe(1); // 0 被挤掉
    expect(next.past[49]).toBe(50);
  });
});

describe('historyOps — I2 undoHistory', () => {
  it('past 空 → null(no-op 信号)', () => {
    expect(undoHistory({ past: [], future: [] }, 'cur')).toBeNull();
  });

  it('past 非空 → restored 是末尾;past 弹一,current 进 future 头', () => {
    const res = undoHistory({ past: ['a', 'b'], future: [] }, 'cur');
    expect(res).not.toBeNull();
    expect(res!.restored).toBe('b');
    expect(res!.next).toEqual({ past: ['a'], future: ['cur'] });
  });

  it('future 截 maxHistory(3)— current 进头,旧的挤掉', () => {
    const res = undoHistory<number>({ past: [0], future: [1, 2, 3] }, 4, 3);
    expect(res!.next.future).toEqual([4, 1, 2]); // 进 4,3 被挤掉
  });
});

describe('historyOps — I3 redoHistory', () => {
  it('future 空 → null', () => {
    expect(redoHistory({ past: [], future: [] }, 'cur')).toBeNull();
  });

  it('future 非空 → restored 是 future[0];future shift,current 进 past', () => {
    const res = redoHistory({ past: ['a'], future: ['b', 'c'] }, 'cur');
    expect(res).not.toBeNull();
    expect(res!.restored).toBe('b');
    expect(res!.next).toEqual({ past: ['a', 'cur'], future: ['c'] });
  });

  it('past 截 maxHistory(3)', () => {
    const res = redoHistory<number>({ past: [1, 2, 3], future: [99] }, 100, 3);
    expect(res!.next.past).toEqual([2, 3, 100]); // 1 被挤掉
  });
});

describe('historyOps — I4 clearHistory', () => {
  it('返回空栈', () => {
    expect(clearHistory()).toEqual({ past: [], future: [] });
  });
});

describe('historyOps — I5 isSignificantAction', () => {
  it('SET_ROW_PAGE → false(翻页不算编辑)', () => {
    expect(isSignificantAction('SET_ROW_PAGE')).toBe(false);
  });

  it('其他 action 都 → true', () => {
    expect(isSignificantAction('DRILL_DOWN')).toBe(true);
    expect(isSignificantAction('SET_VALUE_AGGREGATOR')).toBe(true);
    expect(isSignificantAction('REMOVE_FIELD')).toBe(true);
    expect(isSignificantAction('SET')).toBe(true);
    expect(isSignificantAction('ADD_CONDITIONAL_FORMAT')).toBe(true);
  });

  it('未知 action 也算 true(防御 — 默认入栈)', () => {
    expect(isSignificantAction('UNKNOWN_ACTION')).toBe(true);
  });
});
