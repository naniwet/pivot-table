/**
 * clampColumnWidth — 列宽拖拽时的边界约束
 *
 * 单一职责：把任意 width(可能是 NaN / 负数 / 巨值) clamp 到 [min, max]
 * 用在 PivotRenderer 拖动 column-resize handle 时
 */
import { describe, expect, it } from 'vitest';

import { clampColumnWidth } from './clampColumnWidth.js';

describe('clampColumnWidth', () => {
  it('在 [min, max] 区间内 → 原值', () => {
    expect(clampColumnWidth(100)).toBe(100);
    expect(clampColumnWidth(40)).toBe(40);
    expect(clampColumnWidth(800)).toBe(800);
  });

  it('小于 min → min（默认 40）', () => {
    expect(clampColumnWidth(0)).toBe(40);
    expect(clampColumnWidth(-50)).toBe(40);
    expect(clampColumnWidth(20)).toBe(40);
  });

  it('大于 max → max（默认 800）', () => {
    expect(clampColumnWidth(1000)).toBe(800);
    expect(clampColumnWidth(99999)).toBe(800);
  });

  it('NaN → min（防御）', () => {
    expect(clampColumnWidth(NaN)).toBe(40);
  });

  it('支持显式 min/max', () => {
    expect(clampColumnWidth(50, { min: 60, max: 200 })).toBe(60);
    expect(clampColumnWidth(300, { min: 60, max: 200 })).toBe(200);
    expect(clampColumnWidth(150, { min: 60, max: 200 })).toBe(150);
  });

  it('整数化（避免 sub-pixel 闪烁）', () => {
    expect(clampColumnWidth(100.7)).toBe(101);
    expect(clampColumnWidth(100.4)).toBe(100);
  });
});
