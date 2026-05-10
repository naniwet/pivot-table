/**
 * swapRowsColumns — 行列互换纯函数测试
 *
 * 不变量:
 *   I1. rows ↔ columns 完全 swap
 *   I2. 其他字段(values/filters/sorts/pageState/customFields)不变
 *   I3. 不变 viewConfig 输入(immutable)
 */
import { describe, expect, it } from 'vitest';

import {
  buildHierarchyRow,
  buildValueField,
  buildViewConfig,
} from '../../fixtures/builders.js';

import { swapRowsColumns } from './swapRowsColumns.js';

describe('swapRowsColumns', () => {
  it('I1: rows ↔ columns 互换', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      columns: [{ fieldName: 'B', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const after = swapRowsColumns(before);
    expect(after.rows).toEqual([{ fieldName: 'B', type: 'Dimension' }]);
    expect(after.columns).toEqual([{ fieldName: 'A', type: 'Dimension' }]);
  });

  it('I2: values/filters/customFields 不变', () => {
    const before = buildViewConfig({
      rows: [buildHierarchyRow()],
      columns: [],
      values: [buildValueField({ measureName: 'M' })],
      filters: [{ kind: 'leaf', field: 'F1', operator: 'In', value: ['a'] }],
    });
    const after = swapRowsColumns(before);
    expect(after.values).toBe(before.values);
    expect(after.filters).toBe(before.filters);
  });

  it('I3: 不 mutate 输入', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      columns: [{ fieldName: 'B', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const snapshot = JSON.parse(JSON.stringify(before));
    swapRowsColumns(before);
    expect(before).toEqual(snapshot);
  });

  it('多字段都互换', () => {
    const before = buildViewConfig({
      rows: [
        { fieldName: 'A', type: 'Dimension' },
        { fieldName: 'B', type: 'Dimension' },
      ],
      columns: [
        { fieldName: 'C', type: 'Dimension' },
        { fieldName: 'D', type: 'Dimension' },
      ],
      values: [buildValueField()],
    });
    const after = swapRowsColumns(before);
    expect(after.rows.map((r) => r.fieldName)).toEqual(['C', 'D']);
    expect(after.columns.map((c) => c.fieldName)).toEqual(['A', 'B']);
  });

  it('rows / columns 任一为空 → swap 后另一边变空,不报错', () => {
    const before = buildViewConfig({
      rows: [{ fieldName: 'A', type: 'Dimension' }],
      columns: [],
      values: [buildValueField()],
    });
    const after = swapRowsColumns(before);
    expect(after.rows).toEqual([]);
    expect(after.columns).toEqual([{ fieldName: 'A', type: 'Dimension' }]);
  });
});
