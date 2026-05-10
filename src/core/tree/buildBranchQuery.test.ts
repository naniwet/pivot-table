/**
 * buildBranchQuery 测试 — 不变量:
 *   I1. parentPath=[] → 查 rows[0],无 path 约束
 *   I2. parentPath=[v1] → 查 rows[1],dimFilter 含 rows[0].equals(v1)
 *   I3. parentPath 太长(超过 rows.length-1)→ throw
 *   I4. user.filters 跟 path 约束并存(AND 关系)
 *   I5. Hierarchy row → throw(MVP 不支持)
 *   I6. pathKey / pathFromKey 互逆
 */
import { describe, expect, it } from 'vitest';

import { buildValueField, buildViewConfig } from '../../fixtures/builders.js';
import { FIELD_IDS, orderModelMetadata } from '../../fixtures/metadata/orderModel.js';

import { buildBranchQuery, pathFromKey, pathKey } from './buildBranchQuery.js';

describe('buildBranchQuery', () => {
  it('I1: parentPath=[] → 查 rows[0],无 path 约束', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince2', type: 'Dimension' },
        { fieldName: 'ShipRegion2', type: 'Dimension' },
      ],
      values: [buildValueField()],
    });
    const q = buildBranchQuery({ viewConfig: vc, metadata: orderModelMetadata, parentPath: [] });
    expect(q.rows).toEqual(['ShipProvince2']);
    // 没 user filter,也没 path filter → dimensionFilter=null
    expect(q.dimensionFilter).toBeNull();
  });

  it('I2: parentPath=["北京"] → 查 rows[1],dimFilter 含 rows[0].equals("北京")', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince2', type: 'Dimension' },
        { fieldName: 'ShipRegion2', type: 'Dimension' },
      ],
      values: [buildValueField()],
    });
    const q = buildBranchQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      parentPath: ['北京'],
    });
    expect(q.rows).toEqual(['ShipRegion2']);
    // dimensionFilter 应含 ShipProvince2 = '北京'
    expect(q.dimensionFilter).not.toBeNull();
    const dfStr = JSON.stringify(q.dimensionFilter);
    expect(dfStr).toContain('ShipProvince2');
    expect(dfStr).toContain('北京');
    expect(dfStr).toContain('Equals');
  });

  it('I3: parentPath 超长 → throw', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Dimension' }],
      values: [buildValueField()],
    });
    expect(() =>
      buildBranchQuery({
        viewConfig: vc,
        metadata: orderModelMetadata,
        parentPath: ['北京', '广东'],
      }),
    ).toThrow(/already leaf/);
  });

  it('I4: user filters + path 约束并存', () => {
    const vc = buildViewConfig({
      rows: [
        { fieldName: 'ShipProvince2', type: 'Dimension' },
        { fieldName: 'ShipRegion2', type: 'Dimension' },
      ],
      values: [buildValueField()],
      filters: [
        { kind: 'leaf', field: FIELD_IDS.salesMeasure, operator: 'GreaterThan', value: 100 },
      ],
    });
    const q = buildBranchQuery({
      viewConfig: vc,
      metadata: orderModelMetadata,
      parentPath: ['北京'],
    });
    const dfStr = JSON.stringify(q.dimensionFilter);
    // user filter
    expect(dfStr).toContain(FIELD_IDS.salesMeasure);
    // path filter
    expect(dfStr).toContain('ShipProvince2');
    expect(dfStr).toContain('北京');
  });

  it('I5: Hierarchy row → throw', () => {
    const vc = buildViewConfig({
      rows: [{ fieldName: 'ShipProvince2', type: 'Hierarchy', drillDepth: 2 }],
      values: [buildValueField()],
    });
    expect(() =>
      buildBranchQuery({ viewConfig: vc, metadata: orderModelMetadata, parentPath: [] }),
    ).toThrow(/Hierarchy row not supported/);
  });

  it('rows 为空 → throw', () => {
    const vc = buildViewConfig({
      rows: [],
      values: [buildValueField()],
    });
    expect(() =>
      buildBranchQuery({ viewConfig: vc, metadata: orderModelMetadata, parentPath: [] }),
    ).toThrow(/rows is empty/);
  });
});

describe('pathKey / pathFromKey', () => {
  it('I6: 互逆', () => {
    for (const path of [[], ['亚洲'], ['亚洲', '中国'], ['亚洲', '中国', '北京']]) {
      const k = pathKey(path);
      expect(pathFromKey(k)).toEqual(path);
    }
  });

  it('root key 是 "root"(短稳定)', () => {
    expect(pathKey([])).toBe('root');
  });

  it('不同路径 key 不相同', () => {
    expect(pathKey(['A', 'B'])).not.toBe(pathKey(['AB']));
    expect(pathKey(['亚洲', '中国'])).not.toBe(pathKey(['亚洲', '中国', '']));
  });
});
