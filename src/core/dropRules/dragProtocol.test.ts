/**
 * dragProtocol 测试 —
 *   I1. encodePivotField → JSON 可被 decodePivotField 还原
 *   I2. decodePivotField 对非法输入返回 null(调用方忽略)
 *   I3. encodePivotFilterNode → JSON 可被 decodePivotFilterNode 还原
 *   I4. decodePivotFilterNode 对非法输入返回 null
 *   I5. MIME type 常量唯一,不冲突
 */
import { describe, expect, it } from 'vitest';

import type { PivotFieldDragPayload, PivotFilterNodeDragPayload } from './dragProtocol.js';
import {
  decodePivotField,
  decodePivotFilterNode,
  encodePivotField,
  encodePivotFilterNode,
  PIVOT_FIELD_MIME,
  PIVOT_FILTER_NODE_MIME,
} from './dragProtocol.js';

describe('PIVOT_FIELD_MIME', () => {
  it('I5: two MIME types are distinct', () => {
    expect(PIVOT_FIELD_MIME).not.toBe(PIVOT_FILTER_NODE_MIME);
  });

  it('I5: PIVOT_FIELD_MIME is custom, not text/plain', () => {
    expect(PIVOT_FIELD_MIME).not.toBe('text/plain');
    expect(PIVOT_FIELD_MIME).toBe('application/x-pivot-field');
  });

  it('I5: PIVOT_FILTER_NODE_MIME is custom, not text/plain', () => {
    expect(PIVOT_FILTER_NODE_MIME).not.toBe('text/plain');
    expect(PIVOT_FILTER_NODE_MIME).toBe('application/x-pivot-filter-node');
  });
});

describe('encodePivotField / decodePivotField', () => {
  it('I1: round-trip — full payload with sourceZone and chipKey', () => {
    const payload: PivotFieldDragPayload = {
      fieldName: 'sales',
      fieldType: 'Measure',
      sourceZone: 'value',
      chipKey: 'sales|SUM',
    };
    const encoded = encodePivotField(payload);
    expect(encoded).toBe(JSON.stringify(payload));
    const decoded = decodePivotField(encoded);
    expect(decoded).toEqual(payload);
  });

  it('I1: round-trip — minimal payload without optional fields', () => {
    const payload: PivotFieldDragPayload = {
      fieldName: 'ShipProvince',
      fieldType: 'Dimension',
    };
    const decoded = decodePivotField(encodePivotField(payload));
    expect(decoded).toEqual(payload);
  });

  it('I1: round-trip — Dimension with sourceZone undefined', () => {
    const payload: PivotFieldDragPayload = {
      fieldName: 'h1',
      fieldType: 'Hierarchy',
    };
    const decoded = decodePivotField(encodePivotField(payload));
    expect(decoded?.sourceZone).toBeUndefined();
    expect(decoded?.fieldName).toBe('h1');
  });

  it('I2: empty string → null', () => {
    expect(decodePivotField('')).toBeNull();
  });

  it('I2: garbage JSON → null', () => {
    expect(decodePivotField('{not valid json')).toBeNull();
  });

  it('I2: non-object JSON → null', () => {
    expect(decodePivotField('"just a string"')).toBeNull();
    expect(decodePivotField('42')).toBeNull();
    expect(decodePivotField('true')).toBeNull();
    expect(decodePivotField('null')).toBeNull();
    expect(decodePivotField('[]')).toBeNull();
  });

  it('I2: missing fieldName → null', () => {
    expect(decodePivotField(JSON.stringify({ fieldType: 'Dimension' }))).toBeNull();
  });

  it('I2: missing fieldType → null', () => {
    expect(decodePivotField(JSON.stringify({ fieldName: 'x' }))).toBeNull();
  });

  it('I2: fieldType is empty string → passed through (not null)', () => {
    // typeof "" === "string" → passes validation
    const result = decodePivotField(JSON.stringify({ fieldName: 'x', fieldType: '' }));
    expect(result).toEqual({ fieldName: 'x', fieldType: '' });
  });

  it('I2: extra keys are kept (passthrough JSON.parse)', () => {
    const result = decodePivotField(JSON.stringify({ fieldName: 'x', fieldType: 'Measure', extra: 1 }));
    expect(result).toMatchObject({ fieldName: 'x', fieldType: 'Measure' });
  });
});

describe('encodePivotFilterNode / decodePivotFilterNode', () => {
  it('I3: round-trip with non-empty path', () => {
    const payload: PivotFilterNodeDragPayload = {
      treeId: 'dim-filter',
      path: [0, 1, 2],
    };
    const encoded = encodePivotFilterNode(payload);
    expect(encoded).toBe(JSON.stringify(payload));
    const decoded = decodePivotFilterNode(encoded);
    expect(decoded).toEqual(payload);
  });

  it('I3: round-trip with empty path', () => {
    const payload: PivotFilterNodeDragPayload = {
      treeId: 'root',
      path: [],
    };
    const decoded = decodePivotFilterNode(encodePivotFilterNode(payload));
    expect(decoded).toEqual({ treeId: 'root', path: [] });
  });

  it('I3: round-trip with single-element path', () => {
    const payload: PivotFilterNodeDragPayload = {
      treeId: 'measure-filter',
      path: [0],
    };
    const decoded = decodePivotFilterNode(encodePivotFilterNode(payload));
    expect(decoded).toEqual(payload);
  });

  it('I4: empty string → null', () => {
    expect(decodePivotFilterNode('')).toBeNull();
  });

  it('I4: garbage JSON → null', () => {
    expect(decodePivotFilterNode('broken')).toBeNull();
  });

  it('I4: missing treeId → null', () => {
    expect(decodePivotFilterNode(JSON.stringify({ path: [0] }))).toBeNull();
  });

  it('I4: missing path → null', () => {
    expect(decodePivotFilterNode(JSON.stringify({ treeId: 'x' }))).toBeNull();
  });

  it('I4: path is not an array → null', () => {
    expect(decodePivotFilterNode(JSON.stringify({ treeId: 'x', path: '0' }))).toBeNull();
  });

  it('I4: path contains non-number → null', () => {
    expect(decodePivotFilterNode(JSON.stringify({ treeId: 'x', path: [0, '1'] }))).toBeNull();
  });

  it('I4: path contains NaN → serialized as null → rejected (not number)', () => {
    // JSON.stringify(NaN) → null; typeof null !== 'number' → rejected
    const result = decodePivotFilterNode(JSON.stringify({ treeId: 'x', path: [NaN] }));
    expect(result).toBeNull();
  });

  it('I4: treeId empty string → passed through', () => {
    const result = decodePivotFilterNode(JSON.stringify({ treeId: '', path: [] }));
    expect(result).toEqual({ treeId: '', path: [] });
  });
});
