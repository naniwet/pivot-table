/**
 * detectTimeAxis — 从 viewConfig 行/列轴上找时间字段，推导 dateDimension/dateLevel
 *
 * 用途：P2 时间智能 quickCalc（同期值 / 同比 / 上期 / 环比）需要知道
 * "按哪个时间维度、哪个 level 偏移"。从行/列轴上自动找第一个 LEVEL_TIME_* 字段即可。
 *
 * 设计：
 *   - 纯函数；输入 viewConfig + metadata，输出 { dateDimension, dateLevel } | null
 *   - 行轴优先（PRD §7：通常时间在行轴）；行轴没有时再看列轴
 *   - hierarchy 类型按其当前 drillDepth 对应的 level 推导
 *   - 找不到时间字段 → null（UI 据此置灰菜单）
 */
import { describe, expect, it } from 'vitest';

import {
  buildDimensionRow,
  buildHierarchyRow,
  buildViewConfig,
} from '../../fixtures/builders.js';
import type { FieldNode, FieldNodeType, Metadata } from '../../types/metadata.js';

import { detectAllTimeAxes, detectTimeAxis } from './detectTimeAxis.js';

/**
 * 把树形 root 节点(含 children)展开成扁平 nodes[](parentId/children 同时存在,
 * 跟新 Metadata.nodes 的冗余表达对齐)。
 */
function flattenNodes(roots: FieldNode[]): FieldNode[] {
  const out: FieldNode[] = [];
  function walk(n: FieldNode) {
    out.push(n);
    for (const c of n.children) walk(c);
  }
  for (const r of roots) walk(r);
  return out;
}

/** 工具:用一个时间 level 字段 + 一个普通维度构造最小 metadata */
function makeMetadataWith(timeLevels: FieldNode[]): Metadata {
  // 给 timeLevels 设上 parentId(指向 dimension root)
  const dimensionRoot: FieldNode = makeNode({
    id: 'root',
    name: 'root',
    type: 'DIMENSION_FOLDER',
    parentId: null,
    children: timeLevels.map((tl) => ({ ...tl, parentId: 'root' })),
  });
  const measureRoot: FieldNode = makeNode({
    id: 'measure-root',
    name: 'measure',
    type: 'MEASURE_FOLDER',
    parentId: null,
  });
  return {
    id: 'm',
    name: 'm',
    alias: 'Order',
    desc: '',
    providerName: '',
    views: [],
    fields: [],
    levels: [],
    measures: [],
    calcMeasures: [],
    namedSets: [],
    nodes: flattenNodes([dimensionRoot, measureRoot]),
  };
}

/** 通用 FieldNode 工厂(填默认值) */
function makeNode(p: Partial<FieldNode> & Pick<FieldNode, 'id' | 'name' | 'type' | 'parentId'>): FieldNode {
  return {
    aliasFromDb: p.name,
    descFromDb: null,
    useFromDb: false,
    group: null,
    level: 0,
    order: 0,
    visible: 1,
    valueType: null,
    dataFormat: null,
    extended: null,
    refDataSetFieldId: null,
    referenceFieldId: null,
    originalDataType: null,
    aggregator: null,
    businessCaliber: null,
    children: [],
    alias: p.name,
    desc: null,
    creatorId: null,
    ...p,
  };
}

function makeTimeField(name: string, type: FieldNodeType, _hierarchy = 'OrderDate'): FieldNode {
  return makeNode({
    id: name,
    name,
    alias: name,
    aliasFromDb: name,
    type,
    valueType: 'DATE',
    group: 'DIMENSION',
    parentId: null, // 测试里会被 makeMetadataWith / wrapInTimeHierarchy 覆盖
  });
}

/**
 * 把 level 节点包到 HIERARCHY_TIME 父下 — 模拟真实 metadata 树形结构,
 * 让 detectTimeAxis 能上溯找到 hierarchy。
 */
function wrapInTimeHierarchy(name: string, levels: FieldNode[]): FieldNode {
  const hier = makeTimeField(name, 'HIERARCHY_TIME');
  return {
    ...hier,
    children: levels.map((l) => ({ ...l, parentId: hier.id })),
  };
}

describe('detectTimeAxis', () => {
  it('行轴上有 LEVEL_TIME_MONTH 字段 → 返回 { dateDimension=hierarchy.name, dateLevel=field.name }', () => {
    const monthField = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    // 真实结构:level 必须在 HIERARCHY_TIME 父下 — 否则 detectTimeAxis 找不到 hierarchy
    const hier = wrapInTimeHierarchy('OrderDate', [monthField]);
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'OrderDate_Month' })],
    });
    const result = detectTimeAxis(vc, meta);
    expect(result).toEqual({
      dateDimension: 'OrderDate', // ← hierarchy.name(从父节点上溯取的),不是 level.hierarchy 字段
      dateLevel: 'OrderDate_Month',
    });
  });

  it('列轴上有 LEVEL_TIME_QUARTER → 行轴没有时间也能从列轴找到', () => {
    const q = makeTimeField('OrderDate_Q', 'LEVEL_TIME_QUARTER', 'OrderDate');
    const hier = wrapInTimeHierarchy('OrderDate', [q]);
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      columns: [{ fieldName: 'OrderDate_Q', type: 'Dimension' }],
    });
    expect(detectTimeAxis(vc, meta)).toEqual({
      dateDimension: 'OrderDate',
      dateLevel: 'OrderDate_Q',
    });
  });

  it('行轴 + 列轴都有时间字段 → 行轴优先（PRD §7）', () => {
    const m = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH', 'OrderDate');
    const y = makeTimeField('Other_Year', 'LEVEL_TIME_YEAR', 'OtherDate');
    const orderHier = wrapInTimeHierarchy('OrderDate', [m]);
    const otherHier = wrapInTimeHierarchy('OtherDate', [y]);
    const meta = makeMetadataWith([orderHier, otherHier]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'OrderDate_Month' })],
      columns: [{ fieldName: 'Other_Year', type: 'Dimension' }],
    });
    expect(detectTimeAxis(vc, meta)).toMatchObject({
      dateDimension: 'OrderDate',
      dateLevel: 'OrderDate_Month',
    });
  });

  it('level 节点的 .hierarchy 字段是垃圾(LEVEL_TIME_YEAR)→ 仍然能上溯到 HIERARCHY_TIME 父正确取 dateDimension', () => {
    // 模拟真实 probe 数据:level.hierarchy = type 字符串(语义错误)
    const monthField = makeTimeField('the_date_Year2', 'LEVEL_TIME_YEAR', 'LEVEL_TIME_YEAR');
    const hier = wrapInTimeHierarchy('the_date', [monthField]);
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'the_date_Year2' })],
    });
    expect(detectTimeAxis(vc, meta)).toEqual({
      dateDimension: 'the_date', // 父 hierarchy.name,不是 level.hierarchy 字段
      dateLevel: 'the_date_Year2',
    });
  });

  it('孤立 LEVEL_TIME_*(没有 HIERARCHY_TIME 父)→ null,UI 据此置灰', () => {
    const orphan = makeTimeField('OrphanYear', 'LEVEL_TIME_YEAR');
    // 直接挂 dimensions root 下,没 hierarchy 父
    const meta = makeMetadataWith([orphan]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'OrphanYear' })],
    });
    expect(detectTimeAxis(vc, meta)).toBeNull();
  });

  it('hierarchy with drillDepth → 用对应深度的 level（child[depth-1]）', () => {
    // OrderDate hierarchy: [Year, Quarter, Month] 子 levels
    const year = makeTimeField('OrderDate_Year', 'LEVEL_TIME_YEAR');
    const quarter = makeTimeField('OrderDate_Quarter', 'LEVEL_TIME_QUARTER');
    const month = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const hier: FieldNode = {
      ...makeTimeField('OrderDate', 'HIERARCHY_TIME'),
      children: [year, quarter, month],
    };
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'OrderDate', drillDepth: 2 })],
    });
    expect(detectTimeAxis(vc, meta)).toEqual({
      dateDimension: 'OrderDate',
      dateLevel: 'OrderDate_Quarter', // depth=2 → 第 2 个 child（index 1）
    });
  });

  it('hierarchy 没有 drillDepth → 默认 depth=1（顶层 level）', () => {
    const year = makeTimeField('OrderDate_Year', 'LEVEL_TIME_YEAR');
    const month = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const hier: FieldNode = {
      ...makeTimeField('OrderDate', 'HIERARCHY_TIME'),
      children: [year, month],
    };
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'OrderDate' })],
    });
    expect(detectTimeAxis(vc, meta)?.dateLevel).toBe('OrderDate_Year');
  });

  it('行/列轴都没时间字段 → null', () => {
    const meta = makeMetadataWith([]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'ShipProvince' })],
    });
    expect(detectTimeAxis(vc, meta)).toBeNull();
  });

  it('行/列轴的字段不在 metadata 里 → null（防御）', () => {
    const meta = makeMetadataWith([]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'NotInMetadata' })],
    });
    expect(detectTimeAxis(vc, meta)).toBeNull();
  });
});

describe('detectAllTimeAxes — 多时间字段场景(quickCalc 时间智能子菜单用)', () => {
  it('hierarchy with drillDepth=3 → 返回当前展开的 3 个 levels(用户可按年/季/月任选)', () => {
    const year = makeTimeField('OrderDate_Year', 'LEVEL_TIME_YEAR');
    const quarter = makeTimeField('OrderDate_Quarter', 'LEVEL_TIME_QUARTER');
    const month = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const hier: FieldNode = {
      ...makeTimeField('OrderDate', 'HIERARCHY_TIME'),
      children: [year, quarter, month],
    };
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'OrderDate', drillDepth: 3 })],
    });
    expect(detectAllTimeAxes(vc, meta)).toEqual([
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Year' },
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Quarter' },
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Month' },
    ]);
  });

  it('hierarchy drillDepth=1 → 只返回顶层 level(还没展开下层)', () => {
    const year = makeTimeField('OrderDate_Year', 'LEVEL_TIME_YEAR');
    const month = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const hier: FieldNode = {
      ...makeTimeField('OrderDate', 'HIERARCHY_TIME'),
      children: [year, month],
    };
    const meta = makeMetadataWith([hier]);
    const vc = buildViewConfig({
      rows: [buildHierarchyRow({ fieldName: 'OrderDate', drillDepth: 1 })],
    });
    expect(detectAllTimeAxes(vc, meta)).toEqual([
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Year' },
    ]);
  });

  it('行+列轴各有不同时间字段 → 都返回(行优先顺序)', () => {
    const m = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const y = makeTimeField('Other_Year', 'LEVEL_TIME_YEAR');
    const orderHier = wrapInTimeHierarchy('OrderDate', [m]);
    const otherHier = wrapInTimeHierarchy('OtherDate', [y]);
    const meta = makeMetadataWith([orderHier, otherHier]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'OrderDate_Month' })],
      columns: [{ fieldName: 'Other_Year', type: 'Dimension' }],
    });
    expect(detectAllTimeAxes(vc, meta)).toEqual([
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Month' },
      { dateDimension: 'OtherDate', dateLevel: 'Other_Year' },
    ]);
  });

  it('行/列轴同字段(罕见)→ 去重,只返回 1 个', () => {
    const m = makeTimeField('OrderDate_Month', 'LEVEL_TIME_MONTH');
    const orderHier = wrapInTimeHierarchy('OrderDate', [m]);
    const meta = makeMetadataWith([orderHier]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'OrderDate_Month' })],
      columns: [{ fieldName: 'OrderDate_Month', type: 'Dimension' }],
    });
    expect(detectAllTimeAxes(vc, meta)).toEqual([
      { dateDimension: 'OrderDate', dateLevel: 'OrderDate_Month' },
    ]);
  });

  it('没时间字段 → 空数组', () => {
    const meta = makeMetadataWith([]);
    const vc = buildViewConfig({
      rows: [buildDimensionRow({ fieldName: 'ShipProvince' })],
    });
    expect(detectAllTimeAxes(vc, meta)).toEqual([]);
  });
});
