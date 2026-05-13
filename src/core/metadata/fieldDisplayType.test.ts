/**
 * deriveFieldDisplayType — 时间 level 优先,数值/文本/日期/布尔 各自
 *
 * 不变量参见 fieldDisplayType.ts 头部
 */
import { describe, expect, it } from 'vitest';

import type { FieldNode } from '../../types/metadata.js';

import { deriveFieldDisplayType } from './fieldDisplayType.js';

function makeNode(overrides: Partial<FieldNode>): FieldNode {
  return {
    id: 'x',
    name: 'x',
    aliasFromDb: 'x',
    descFromDb: null,
    useFromDb: false,
    alias: 'x',
    desc: null,
    type: 'FIELD',
    group: 'DIMENSION',
    level: 0,
    order: 0,
    visible: 1,
    parentId: null,
    valueType: null,
    dataFormat: null,
    extended: null,
    refDataSetFieldId: null,
    referenceFieldId: null,
    originalDataType: null,
    aggregator: null,
    businessCaliber: null,
    children: [],
    creatorId: null,
    ...overrides,
  };
}

describe('deriveFieldDisplayType — type 优先(时间 level)', () => {
  it('LEVEL_TIME_YEAR + valueType=STRING → date(不会误标 text)', () => {
    // 真实后端把 LEVEL_TIME_YEAR 的 valueType 设为 STRING(年份串),
    // 必须按 type 优先判,否则会误标 text 字段
    expect(
      deriveFieldDisplayType(makeNode({ type: 'LEVEL_TIME_YEAR', valueType: 'STRING' })),
    ).toBe('date');
  });

  it('LEVEL_TIME_QUARTER → date', () => {
    expect(
      deriveFieldDisplayType(makeNode({ type: 'LEVEL_TIME_QUARTER', valueType: 'STRING' })),
    ).toBe('date');
  });

  it('LEVEL_TIME_MONTH → date', () => {
    expect(
      deriveFieldDisplayType(makeNode({ type: 'LEVEL_TIME_MONTH', valueType: 'STRING' })),
    ).toBe('date');
  });

  it('LEVEL_TIME_DAY → date', () => {
    expect(
      deriveFieldDisplayType(makeNode({ type: 'LEVEL_TIME_DAY', valueType: 'STRING' })),
    ).toBe('date');
  });

  it('HIERARCHY_TIME → date', () => {
    expect(
      deriveFieldDisplayType(makeNode({ type: 'HIERARCHY_TIME', valueType: null })),
    ).toBe('date');
  });
});

describe('deriveFieldDisplayType — valueType 映射', () => {
  it.each([
    ['INTEGER', 'numeric'],
    ['LONG', 'numeric'],
    ['BIGINT', 'numeric'],
    ['FLOAT', 'numeric'],
    ['DOUBLE', 'numeric'],
    ['BIGDECIMAL', 'numeric'],
    ['NUMERIC', 'numeric'],
    ['STRING', 'text'],
    ['ASCII_CODE', 'text'],
    ['DATE', 'date'],
    ['TIME', 'date'],
    ['DATETIME', 'date'],
    ['TIMESTAMP', 'date'],
    ['BOOLEAN', 'boolean'],
  ] as const)('valueType=%s → %s', (vt, expected) => {
    expect(deriveFieldDisplayType(makeNode({ type: 'FIELD', valueType: vt }))).toBe(
      expected,
    );
  });

  it('valueType 大小写不敏感', () => {
    expect(deriveFieldDisplayType(makeNode({ valueType: 'string' as never }))).toBe('text');
    expect(deriveFieldDisplayType(makeNode({ valueType: 'BigInt' as never }))).toBe('numeric');
  });

  it('null node → null', () => {
    expect(deriveFieldDisplayType(null)).toBeNull();
  });

  it('未知 valueType → null', () => {
    expect(
      deriveFieldDisplayType(makeNode({ valueType: 'UNKNOWN_VTYPE' as never })),
    ).toBeNull();
  });

  it('valueType=null → null', () => {
    expect(deriveFieldDisplayType(makeNode({ valueType: null }))).toBeNull();
  });
});
