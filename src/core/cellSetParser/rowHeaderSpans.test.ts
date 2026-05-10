/**
 * buildRowHeaderSpans — 多级行头的 rowSpan 合并算法（与 buildColumnHeaderLevels 镜像）
 *
 * 标准 BI 渲染：行头每一层 lvl 上，相邻行 fullPath[0..lvl] 完全相同 → 合并 rowSpan
 * 例如 2023/Q1, 2023/Q2, 2024/Q1, 2024/Q2 渲染：
 *   ┌────┬───┐
 *   │2023│Q1 │
 *   │    ├───┤
 *   │    │Q2 │
 *   ├────┼───┤
 *   │2024│Q1 │
 *   │    ├───┤
 *   │    │Q2 │
 *   └────┴───┘
 *
 * 输出：number[r][lvl]
 *   - 0：该 cell 被前一行的 rowSpan 覆盖，跳过渲染
 *   - >=1：渲染并 rowSpan=该值
 */
import { describe, expect, it } from 'vitest';

import { buildRowHeaderSpans } from './rowHeaderSpans.js';

describe('buildRowHeaderSpans', () => {
  it('单 level 单行', () => {
    expect(buildRowHeaderSpans([['A']])).toEqual([[1]]);
  });

  it('单 level 两行不同 → 各自 1', () => {
    expect(buildRowHeaderSpans([['A'], ['B']])).toEqual([[1], [1]]);
  });

  it('单 level 两行相同 → 第 0 行 rowSpan=2，第 1 行跳过', () => {
    expect(buildRowHeaderSpans([['A'], ['A']])).toEqual([[2], [0]]);
  });

  it('两 level 经典：2023/Q1, 2023/Q2, 2024/Q1, 2024/Q2', () => {
    expect(
      buildRowHeaderSpans([
        ['2023', 'Q1'],
        ['2023', 'Q2'],
        ['2024', 'Q1'],
        ['2024', 'Q2'],
      ]),
    ).toEqual([
      [2, 1],
      [0, 1],
      [2, 1],
      [0, 1],
    ]);
  });

  it('两 level：2023/Q1×3 + 2023/Q2 + 2024/Q1', () => {
    expect(
      buildRowHeaderSpans([
        ['2023', 'Q1'],
        ['2023', 'Q1'], // 罕见但允许：相同 fullPath 多行
        ['2023', 'Q1'],
        ['2023', 'Q2'],
        ['2024', 'Q1'],
      ]),
    ).toEqual([
      [4, 3], // 2023 跨 4 行；Q1 跨前 3 行
      [0, 0],
      [0, 0],
      [0, 1], // 2023 仍被覆盖；Q2 单独一行
      [1, 1],
    ]);
  });

  it('三 level：2023/Q1/Jan, 2023/Q1/Feb, 2023/Q2/Apr', () => {
    expect(
      buildRowHeaderSpans([
        ['2023', 'Q1', 'Jan'],
        ['2023', 'Q1', 'Feb'],
        ['2023', 'Q2', 'Apr'],
      ]),
    ).toEqual([
      [3, 2, 1], // 2023 跨 3 行；Q1 跨 2 行；Jan 自己
      [0, 0, 1],
      [0, 1, 1], // 2023 被覆盖；Q2 自己；Apr 自己
    ]);
  });

  it('空输入 → []', () => {
    expect(buildRowHeaderSpans([])).toEqual([]);
  });

  it('行有不同长度 fullPath（边角 case）→ 按各自长度 fallback', () => {
    // 通常 fullPath length 应一致；这里只验证不 crash
    const result = buildRowHeaderSpans([['A'], ['A', 'B']]);
    expect(result.length).toBe(2);
  });
});
