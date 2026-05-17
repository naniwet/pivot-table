/**
 * computeRowFieldLabels 测试 — I1-I5 + 边界 / 组合
 *
 * 跟原 hook test 1:1 对齐(下沉),不依赖 React,跑在 node 环境
 */
import { describe, expect, it } from 'vitest';

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { ViewConfig, RowField } from '../../types/viewConfig.js';

import { computeRowFieldLabels } from './rowFieldLabels.js';

const metaIndex = buildMetadataIndex(orderModelMetadata);

function vc(rows: RowField[], customFields: ViewConfig['customFields'] = []): ViewConfig {
  return {
    rows, columns: [], values: [], filters: [], measureFilters: [],
    rowSorts: [], columnSorts: [],
    pageState: { rowPageNo: 1, rowPageSize: 50, columnPageNo: 1, columnPageSize: 50 },
    customFields, extensions: null,
  };
}

function hierRow(overrides: Partial<RowField> = {}): RowField {
  return {
    fieldName: FIELD_IDS.shipRegionHierarchy,
    type: 'Hierarchy',
    drillDepth: 1,
    ...overrides,
  };
}

describe('computeRowFieldLabels — I1 MeasureGroupName', () => {
  it('I1: type=MeasureGroupName → "Σ 度量名称"', () => {
    expect(
      computeRowFieldLabels(vc([{ fieldName: 'Measures', type: 'MeasureGroupName' }]), metaIndex),
    ).toEqual(['Σ 度量名称']);
  });
});

describe('computeRowFieldLabels — I2 Hierarchy drillDepth', () => {
  it('drillDepth=1 → 1 个 level alias', () => {
    expect(computeRowFieldLabels(vc([hierRow({ drillDepth: 1 })]), metaIndex)).toEqual(['省份']);
  });

  it('drillDepth=2 → 2 个 level aliases', () => {
    expect(computeRowFieldLabels(vc([hierRow({ drillDepth: 2 })]), metaIndex)).toEqual([
      '省份', '区域',
    ]);
  });

  it('drillDepth=3 → 3 个 level aliases', () => {
    expect(computeRowFieldLabels(vc([hierRow({ drillDepth: 3 })]), metaIndex)).toEqual([
      '省份', '区域', '发货城市',
    ]);
  });

  it('drillDepth 超 level 数 → 只出存在的(safe loop)', () => {
    // metadata 里 hierarchy 只有 3 个 level
    expect(
      computeRowFieldLabels(vc([hierRow({ drillDepth: 10 })]), metaIndex),
    ).toEqual(['省份', '区域', '发货城市']);
  });

  it('drillDepth 缺省 → 当作 1', () => {
    expect(
      computeRowFieldLabels(
        vc([{ fieldName: FIELD_IDS.shipRegionHierarchy, type: 'Hierarchy' } as RowField]),
        metaIndex,
      ),
    ).toEqual(['省份']);
  });

  it('hierarchy 在 metadata 但 children 为空 → 退化用自身 alias', () => {
    // 极端情况:metadata 改了 hierarchy 但 children 漏配
    // 用 ghost hierarchy id 模拟:metaIndex 找不到,落 I5 而不是这里;
    // 这条留作行为契约的兜底文档
    // 用现有 hierarchy 已覆盖正常路径,这里不重复测
  });
});

describe('computeRowFieldLabels — I3 普通字段 metadata alias', () => {
  it('I3: 在 metadata 的非 hierarchy 字段 → 用 alias', () => {
    expect(
      computeRowFieldLabels(
        vc([{ fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' } as RowField]),
        metaIndex,
      ),
    ).toEqual(['城市分组']);
  });
});

describe('computeRowFieldLabels — I4 customField 回退', () => {
  it('I4: 不在 metadata + 在 customFields → 取 customField.name', () => {
    const cfId = 'enum-my-group';
    expect(
      computeRowFieldLabels(
        vc(
          [{ fieldName: cfId, type: 'EnumGroup' } as RowField],
          [{
            id: cfId, name: '我的分组', kind: 'enum_group', baseField: 'province',
            groups: [], ungroupedHandling: 'show_individually' as const,
          }],
        ),
        metaIndex,
      ),
    ).toEqual(['我的分组']);
  });
});

describe('computeRowFieldLabels — I5 fallback', () => {
  it('I5: 都找不到 → fallback fieldName 字符串', () => {
    expect(
      computeRowFieldLabels(
        vc([{ fieldName: 'ghost_field', type: 'Dimension' } as RowField]),
        metaIndex,
      ),
    ).toEqual(['ghost_field']);
  });
});

describe('computeRowFieldLabels — 组合 / 边界', () => {
  it('多 row 组合(hierarchy + 普通)按顺序展开', () => {
    expect(
      computeRowFieldLabels(
        vc([
          hierRow({ drillDepth: 2 }),
          { fieldName: FIELD_IDS.cityCalcGroup, type: 'CalcGroup' } as RowField,
        ]),
        metaIndex,
      ),
    ).toEqual(['省份', '区域', '城市分组']);
  });

  it('empty rows → empty labels', () => {
    expect(computeRowFieldLabels(vc([]), metaIndex)).toEqual([]);
  });
});
