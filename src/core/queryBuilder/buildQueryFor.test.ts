/**
 * buildQueryFor 测试 — 不变量:
 *   I1. queryMode='adhoc' + rows 非空 → DetailQuery
 *   I2. queryMode='adhoc' + rows 空 → null
 *   I3. queryMode 缺省/'pivot' + values 非空 → PivotQuery
 *   I4. queryMode 缺省/'pivot' + values 空 → null
 *   I5. builder 抛错(invalid viewConfig)→ null,不冒泡
 */
import { describe, expect, it } from 'vitest';

import { buildValueField, buildViewConfig, defaultPageState } from '../../fixtures/builders.js';
import { orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildQueryFor } from './buildQueryFor.js';

describe('buildQueryFor', () => {
  it('I1: adhoc 模式 + rows 非空 → DetailQuery', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [],
      queryMode: 'adhoc',
    });
    const q = buildQueryFor(vc, orderModelMetadata, defaultPageState);
    expect(q?.queryType).toBe('DetailQuery');
  });

  it('I2: adhoc 模式 + rows 空 → null', () => {
    const vc = buildViewConfig({ rows: [], queryMode: 'adhoc' });
    expect(buildQueryFor(vc, orderModelMetadata, defaultPageState)).toBeNull();
  });

  it('I3: pivot 模式(默认) + values 非空 → PivotQuery', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
    });
    const q = buildQueryFor(vc, orderModelMetadata, defaultPageState);
    expect(q?.queryType).toBe('PivotQuery');
  });

  it('I3+: queryMode 显式 pivot 同上', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
      queryMode: 'pivot',
    });
    const q = buildQueryFor(vc, orderModelMetadata, defaultPageState);
    expect(q?.queryType).toBe('PivotQuery');
  });

  it('I4: pivot 模式 + values 空 → null', () => {
    const vc = buildViewConfig({ rows: [], values: [] });
    expect(buildQueryFor(vc, orderModelMetadata, defaultPageState)).toBeNull();
  });

  it('I5: adhoc 模式不做字段存在性校验(后端 SQL 层会兜)— 字段不在 metadata 也照发', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'definitely_not_a_field', type: 'Dimension' }],
      values: [],
      queryMode: 'adhoc',
    });
    const q = buildQueryFor(vc, orderModelMetadata, defaultPageState);
    expect(q?.queryType).toBe('DetailQuery');
    expect(q?.rows).toEqual(['definitely_not_a_field']);
  });

  it('I5: 度量不在 metadata + pivot 模式 → null', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField({ measureName: 'fake_measure' })],
    });
    expect(buildQueryFor(vc, orderModelMetadata, defaultPageState)).toBeNull();
  });
});
