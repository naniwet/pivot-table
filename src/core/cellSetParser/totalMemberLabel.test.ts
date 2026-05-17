import { describe, expect, it } from 'vitest';

import { formatTotalMemberLabel } from './totalMemberLabel.js';

describe('formatTotalMemberLabel', () => {
  it('SMARTBI合计 → 合计', () => {
    expect(formatTotalMemberLabel('SMARTBI合计')).toBe('合计');
  });

  it('total → 小计', () => {
    expect(formatTotalMemberLabel('total')).toBe('小计');
  });

  it('其他 name 原样返回(普通 member 名不被改)', () => {
    expect(formatTotalMemberLabel('江苏省')).toBe('江苏省');
    expect(formatTotalMemberLabel('华东')).toBe('华东');
    expect(formatTotalMemberLabel('2024')).toBe('2024');
  });

  it('空字符串原样返回', () => {
    expect(formatTotalMemberLabel('')).toBe('');
  });

  it('大小写敏感(Total / TOTAL 不当 magic)', () => {
    expect(formatTotalMemberLabel('Total')).toBe('Total');
    expect(formatTotalMemberLabel('TOTAL')).toBe('TOTAL');
  });
});
