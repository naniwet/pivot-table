/**
 * deriveEditorOpenFromExisting 测试 — I1-I5 不变量(从 useCustomFieldEditor.test.ts 下沉)
 */
import { describe, expect, it } from 'vitest';

import type { CustomField } from '../../types/viewConfig.js';

import { deriveEditorOpenFromExisting } from './deriveEditorOpen.js';

describe('deriveEditorOpenFromExisting — I1 expr editor 路由', () => {
  it('calc_measure → expr editor', () => {
    const cf: CustomField = {
      id: 'cm_1', name: '利润率', kind: 'calc_measure',
      dataFormat: '0.00%', expression: '[销售额]/[成本]', ast: null,
    };
    expect(deriveEditorOpenFromExisting(cf)).toEqual({ kind: 'expr', initialField: cf });
  });

  it('calc_column → expr editor(共享 modal,form 内部分支)', () => {
    const cf: CustomField = {
      id: 'cc_1', name: '均价', kind: 'calc_column',
      dataFormat: '0.00', expression: '[销售额]/[数量]', ast: null,
    };
    expect(deriveEditorOpenFromExisting(cf)).toEqual({ kind: 'expr', initialField: cf });
  });
});

describe('deriveEditorOpenFromExisting — I2/I3 enum/range editor 路由', () => {
  it('I2: enum_group → enum editor + baseField 透传', () => {
    const cf: CustomField = {
      id: 'eg_1', name: '区域分组', kind: 'enum_group',
      baseField: 'ShipProvince2', groups: [],
      ungroupedHandling: 'show_individually' as const,
    };
    expect(deriveEditorOpenFromExisting(cf, '省份')).toEqual({
      kind: 'enum', initialField: cf, baseField: 'ShipProvince2', baseFieldAlias: '省份',
    });
  });

  it('I3: range_group → range editor + baseField 透传', () => {
    const cf: CustomField = {
      id: 'rg_1', name: '销售额档位', kind: 'range_group',
      baseField: 'sales', ranges: [],
    };
    expect(deriveEditorOpenFromExisting(cf, '销售额')).toEqual({
      kind: 'range', initialField: cf, baseField: 'sales', baseFieldAlias: '销售额',
    });
  });

  it('I2: 不传 baseFieldAlias → fallback baseField 自身', () => {
    const cf: CustomField = {
      id: 'eg_1', name: '分组', kind: 'enum_group',
      baseField: 'province', groups: [],
      ungroupedHandling: 'show_individually' as const,
    };
    expect(deriveEditorOpenFromExisting(cf)?.baseFieldAlias).toBe('province');
  });
});

describe('deriveEditorOpenFromExisting — I4/I5 no-op', () => {
  it('I4: dim_as_measure → null(UI 暂无独立 editor)', () => {
    const cf: CustomField = {
      id: 'dam_1', name: 'sales_rep(COUNT)', kind: 'dim_as_measure',
      sourceField: 'sales_rep', aggregator: 'COUNT', dataFormat: '',
    };
    expect(deriveEditorOpenFromExisting(cf)).toBeNull();
  });
});
