/**
 * FieldTree 组件测试
 *
 * 范围（P0）：
 *   - 三大组渲染：维度 / 度量 / 命名集
 *   - visible:false 字段完全隐藏
 *   - 显示 alias（非 name），hover desc
 *   - alias 全局搜索（子串匹配，命中时父节点自动展开）
 *   - 拖拽源：HTML5 dragstart → 触发 onFieldDragStart(name, FieldType)
 *   - NamedSet 区域显示但不可拖（P0）
 *   - CalcGroup 字段标记 data-field-type='CalcGroup'，可拖
 *
 * 不在 P0 范围（不测）：
 *   - accessible:false 置灰：FieldNode 类型未包含 accessible，按 ColumnMetaData
 *     在查询返回时处理，FieldTree 不感知
 *   - 国际化分组名：P4+
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { orderModelMetadata, FIELD_IDS } from '../../fixtures/metadata/orderModel.js';
import type { FieldNode, FieldNodeType, Metadata } from '../../types/metadata.js';

import { FieldTree } from './FieldTree.js';

/** 通用 FieldNode 工厂(填默认值,跟新接口对齐) */
function makeNode(
  p: Partial<FieldNode> & Pick<FieldNode, 'id' | 'name' | 'type' | 'parentId'>,
): FieldNode {
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

/**
 * 拿到 fixture 里某个根级 group 节点(parentId=null)按 type 过滤,如 'MEASURE_FOLDER'。
 * 注:旧测试通过 metadata.measures/dimensions/namedsets 拿根节点,新结构用 nodes 数组反查。
 */
function findRootByType(metadata: Metadata, type: FieldNodeType): FieldNode {
  const root = metadata.nodes.find((n) => n.parentId === null && n.type === type);
  if (!root) throw new Error(`No root node of type ${type}`);
  return root;
}

/**
 * 递归克隆并 patch:走 nodes[] 树形结构(从 root 开始,沿 children),命中节点应用 patch。
 *
 * 注意:fixture 同时维护扁平 nodes[] + 嵌套 children 两种引用。FieldTree 渲染走的是
 * root.children 递归,所以 patch 必须沿 children 逐层重建,不能只改 nodes[] 数组。
 */
function patchNode(
  metadata: Metadata,
  predicate: (n: FieldNode) => boolean,
  patch: Partial<FieldNode>,
): Metadata {
  function rebuild(n: FieldNode): FieldNode {
    const newChildren = n.children.map(rebuild);
    const base: FieldNode = { ...n, children: newChildren };
    return predicate(n) ? { ...base, ...patch } : base;
  }
  // 收集新树扁平
  const newRoots = metadata.nodes.filter((n) => n.parentId === null).map(rebuild);
  const flat: FieldNode[] = [];
  function walk(n: FieldNode) {
    flat.push(n);
    for (const c of n.children) walk(c);
  }
  for (const r of newRoots) walk(r);
  return { ...metadata, nodes: flat };
}

/**
 * 替换某个 root 节点(按 type)的 children — 同时更新扁平 nodes[]
 *   1. 计算新的 root.children
 *   2. 把新加入的节点扁平化追加到 nodes[](old root + 老 children 全保留,只是 root 的 children 数组替换)
 *
 * 注意:这里把"新 root + 新 children 的整棵子树"一起塞进 nodes[],老节点也保留。
 * FieldTree 渲染只看 root nodes(parentId=null) + 沿 children 递归,所以即便 nodes[] 含
 * 多余节点也无所谓(Renderer 不直接迭代扁平数组)。
 */
function replaceRootChildren(
  metadata: Metadata,
  rootType: FieldNodeType,
  newChildren: FieldNode[],
): Metadata {
  const oldRoot = findRootByType(metadata, rootType);
  const newRoot: FieldNode = { ...oldRoot, children: newChildren };
  // 用新 root 替换 nodes[] 中老 root;FieldTree 沿 root.children 递归渲染,
  // 不直接迭代扁平 nodes[],所以老 children 节点保留在 nodes[] 也无影响。
  return {
    ...metadata,
    nodes: metadata.nodes.map((n) => (n.id === oldRoot.id ? newRoot : n)),
  };
}

describe('FieldTree', () => {
  // 2026-05-16:命名集功能未接通,先隐藏 NAMEDSET_FOLDER 整 subtree
  it('renders top-level groups: 维度 / 度量(命名集已隐藏)', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('维度')).toBeInTheDocument();
    expect(screen.getByText('度量')).toBeInTheDocument();
    expect(screen.queryByText('命名集')).not.toBeInTheDocument();
  });

  it('renders fields by alias (not name)', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('发货区域')).toBeInTheDocument(); // hierarchy alias
    expect(screen.getByText('销售额')).toBeInTheDocument();    // measure alias
    expect(screen.queryByText(FIELD_IDS.salesMeasure)).not.toBeInTheDocument();
  });

  it('hides visible:false fields entirely', () => {
    // 新结构:在 nodes[] 中找到发货区域 hierarchy 节点,visible=0(隐藏)
    const hidden: Metadata = patchNode(
      orderModelMetadata,
      (n) => n.name === FIELD_IDS.shipRegionHierarchy,
      { visible: 0 },
    );
    render(<FieldTree metadata={hidden} onFieldDragStart={vi.fn()} />);
    expect(screen.queryByText('发货区域')).not.toBeInTheDocument();
  });

  it('marks CalcGroup field with data-field-type="CalcGroup"', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const node = screen.getByText('城市分组').closest('[data-field-type]');
    expect(node).toHaveAttribute('data-field-type', 'CalcGroup');
  });

  it('marks Hierarchy field with data-field-type="Hierarchy" and Measure with "Measure"', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const hier = screen.getByText('发货区域').closest('[data-field-type]');
    expect(hier).toHaveAttribute('data-field-type', 'Hierarchy');
    const meas = screen.getByText('销售额').closest('[data-field-type]');
    expect(meas).toHaveAttribute('data-field-type', 'Measure');
  });

  it('calls onFieldDragStart with (fieldName, fieldType) on dragstart', () => {
    const onDrag = vi.fn();
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={onDrag} />);
    const measureNode = screen.getByText('销售额').closest('[data-field-type]')!;
    fireEvent.dragStart(measureNode);
    expect(onDrag).toHaveBeenCalledWith(FIELD_IDS.salesMeasure, 'Measure');
  });

  // 2026-05-16:命名集整 subtree 隐藏 — 自然不可拖也不渲染
  it('NamedSet 整 subtree 隐藏(folder + 子节点都不渲染)', () => {
    const namedsetRoot = findRootByType(orderModelMetadata, 'NAMEDSET_FOLDER');
    const namedsetChild = makeNode({
      id: 'ns_1',
      name: 'top10客户',
      alias: 'Top10 客户',
      aliasFromDb: 'Top10 客户',
      type: 'NAMEDSET',
      group: 'NAMEDSET',
      parentId: namedsetRoot.id,
      order: 0,
    });
    const withNamedSet = replaceRootChildren(orderModelMetadata, 'NAMEDSET_FOLDER', [namedsetChild]);
    render(<FieldTree metadata={withNamedSet} onFieldDragStart={vi.fn()} />);
    expect(screen.queryByText('命名集')).not.toBeInTheDocument();
    expect(screen.queryByText('Top10 客户')).not.toBeInTheDocument();
  });

  // 2026-05-16:用户反馈截图 — 后端建的"成员"分组 name=member 且 type 是通用 FOLDER,
  // 仅 HIDDEN_FIELD_TYPES 抓不住;需按 name 兜底过滤(member / namedset / calcmember 等)
  it('按 name="member" 兜底隐藏(type=FOLDER 也命中)', () => {
    // 直接 mock 一个 root level 的 FOLDER 节点(模拟用户截图里的"成员"tab)
    const memberFolder = makeNode({
      id: 'member_root',
      name: 'member',
      alias: '成员',
      aliasFromDb: '成员',
      type: 'FOLDER',
      group: null,
      parentId: null,
      order: 99,
      children: [
        makeNode({
          id: 'm1',
          name: '一线城市',
          alias: '一线城市',
          aliasFromDb: '一线城市',
          type: 'FIELD',
          group: 'DIMENSION',
          parentId: 'member_root',
          order: 0,
        }),
      ],
    });
    const withMember: Metadata = {
      ...orderModelMetadata,
      nodes: [...orderModelMetadata.nodes, memberFolder, ...memberFolder.children],
    };
    render(<FieldTree metadata={withMember} onFieldDragStart={vi.fn()} />);
    expect(screen.queryByText('成员')).not.toBeInTheDocument();
    expect(screen.queryByText('一线城市')).not.toBeInTheDocument();
  });

  it('filters tree by searchQuery (alias substring, case-insensitive)', () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        searchQuery="销售"
        onFieldDragStart={vi.fn()}
      />,
    );
    expect(screen.getByText('销售额')).toBeInTheDocument();
    expect(screen.queryByText('发货区域')).not.toBeInTheDocument();
    expect(screen.queryByText('城市分组')).not.toBeInTheDocument();
  });

  it('search auto-keeps the matched leaf even when nested deep', async () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        searchQuery="城市"
        onFieldDragStart={vi.fn()}
      />,
    );
    expect(screen.getByText('城市分组')).toBeInTheDocument();
    expect(screen.queryByText('销售额')).not.toBeInTheDocument();
  });

  it('dragging a hierarchy LEVEL child does not get overridden by parent hierarchy dragstart', () => {
    // Regression: 用户 2026-05-05 报告，拖 "销售_年" 进了"销售日期"。
    // 原因：dragstart 冒泡到父 hierarchy 容器，覆写了 dataTransfer。
    // 期望：drag 一个 level 时只触发该 level 的 onFieldDragStart，不触发 hierarchy。
    const onDrag = vi.fn();
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={onDrag} />);

    // 拖 hierarchy "发货区域" 下的 level "省份"（ShipProvince2 alias='省份'）
    const provinceLevel = screen.getByText('省份').closest('[data-field-type]')!;
    fireEvent.dragStart(provinceLevel);

    // onDrag 只被该 level 调，不应被父 hierarchy 也调
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(onDrag).toHaveBeenCalledWith('ShipProvince2', 'Dimension');
  });

  it('right-click on a draggable field calls onFieldContextMenu with field info and (x,y)', () => {
    // P1.0：右键字段树节点 → 弹出上下文菜单（添加到行/列/筛选/数值）。
    // FieldTree 自身不渲染菜单，只把右键事件转出去；宿主决定怎么渲染。
    const onContext = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldContextMenu={onContext}
      />,
    );
    const measure = screen.getByText('销售额').closest('[data-field-type]')!;
    fireEvent.contextMenu(measure, { clientX: 123, clientY: 456 });
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(onContext).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: FIELD_IDS.salesMeasure,
        fieldType: 'Measure',
        x: 123,
        y: 456,
      }),
    );
  });

  // 2026-05-16:命名集整 subtree 隐藏后,自然 querySelector 找不到节点就没右键能触发
  // (上面的"NamedSet 整 subtree 隐藏"测试已覆盖该路径)

  it('right-click on a folder does NOT trigger onFieldContextMenu', () => {
    // 文件夹（维度/度量根节点）不是 field，没有"添加到 X"语义。
    const onContext = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldContextMenu={onContext}
      />,
    );
    fireEvent.contextMenu(screen.getByText('维度'));
    expect(onContext).not.toHaveBeenCalled();
  });

  it('right-click on a hierarchy LEVEL child does not bubble to parent hierarchy', () => {
    // 同 dragstart 的回归测试：右键 level 时，不应同时触发父 hierarchy 的右键。
    const onContext = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldContextMenu={onContext}
      />,
    );
    const province = screen.getByText('省份').closest('[data-field-type]')!;
    fireEvent.contextMenu(province);
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(onContext).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: 'ShipProvince2', fieldType: 'Dimension' }),
    );
  });

  it('double-click on draggable field → onFieldDoubleClick(name, type) (P2)', () => {
    const onDouble = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldDoubleClick={onDouble}
      />,
    );
    const measure = screen.getByText('销售额').closest('[data-field-type]')!;
    fireEvent.doubleClick(measure);
    expect(onDouble).toHaveBeenCalledWith(FIELD_IDS.salesMeasure, 'Measure');
  });

  it('double-click on hierarchy LEVEL not bubbling to parent hierarchy (P2)', () => {
    const onDouble = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldDoubleClick={onDouble}
      />,
    );
    const province = screen.getByText('省份').closest('[data-field-type]')!;
    fireEvent.doubleClick(province);
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onDouble).toHaveBeenCalledWith('ShipProvince2', 'Dimension');
  });

  it('hides MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE 节点（P3：由 Σ chip 管理，不在字段树暴露）', () => {
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const fakeMeasureName = makeNode({
      id: 'mgn',
      name: 'measure_axis_name',
      alias: '度量名称',
      aliasFromDb: '度量名称',
      type: 'MEASURE_GROUP_NAME',
      group: 'MEASURE',
      parentId: measureRoot.id,
      order: 0,
    });
    const fakeMeasureValue = makeNode({
      id: 'mgv',
      name: 'measure_axis_value',
      alias: '度量值',
      aliasFromDb: '度量值',
      type: 'MEASURE_GROUP_VALUE',
      group: 'MEASURE',
      parentId: measureRoot.id,
      order: 1,
    });
    const meta = replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [
      ...measureRoot.children,
      fakeMeasureName,
      fakeMeasureValue,
    ]);
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    expect(screen.queryByText('度量名称')).not.toBeInTheDocument();
    expect(screen.queryByText('度量值')).not.toBeInTheDocument();
  });

  it('shows desc as title attribute on hover', async () => {
    const user = userEvent.setup();
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const node = screen.getByText('发货区域').closest('[data-field-type]')!;
    // 用 title 属性是最简单的 hover-提示方式（P0：不引 tooltip 库）
    expect(node).toHaveAttribute('title');
    await user.hover(node);
  });
});

describe('FieldTree — single-child folder 链折叠 (修"度量/指标"重复显示)', () => {
  // 模拟真实后端常见结构:
  //   度量(MEASURE_FOLDER) → 指标(FOLDER, only child) → [Σ销售额, Σ成本]
  // 期望:只显示外层"度量"标题,中间"指标"被折叠,字段直接挂在度量下
  function buildNestedMeasures(): Metadata {
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const sales = makeNode({
      id: 'm-sales',
      name: 'sales_m',
      alias: '销售额',
      aliasFromDb: '销售额',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'inner',
      order: 0,
      visible: 1,
    });
    const cost = makeNode({
      id: 'm-cost',
      name: 'cost_m',
      alias: '成本',
      aliasFromDb: '成本',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'inner',
      order: 1,
      visible: 1,
    });
    const innerFolder = makeNode({
      id: 'inner',
      name: '指标_inner',
      alias: '指标',
      aliasFromDb: '指标',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [sales, cost],
    });
    return replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [innerFolder]);
  }

  it('度量(only child=指标 folder)→ 折掉"指标"标题,字段直接挂在"度量"下', () => {
    const meta = buildNestedMeasures();
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    // 外层"度量"标题保留
    expect(screen.getByText('度量')).toBeInTheDocument();
    // 中间冗余"指标"标题被折掉(注意:'指标' 文字在 fixture 维度树里也没有,所以 query 整树不应找到)
    expect(screen.queryByText('指标')).not.toBeInTheDocument();
    // 字段照常显示
    expect(screen.getByText('销售额')).toBeInTheDocument();
    expect(screen.getByText('成本')).toBeInTheDocument();
  });

  it('多 child 时不折叠(指标 folder 有 2 个 measure 兄弟,正常嵌套渲染)', () => {
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const sales = makeNode({
      id: 'm-sales',
      name: 'sales_m',
      alias: '销售额',
      aliasFromDb: '销售额',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'fa',
      visible: 1,
    });
    const folderA = makeNode({
      id: 'fa',
      name: 'fa',
      alias: '基础指标',
      aliasFromDb: '基础指标',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [sales],
    });
    const folderB = makeNode({
      id: 'fb',
      name: 'fb',
      alias: '高级指标',
      aliasFromDb: '高级指标',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [{ ...sales, id: 'm-sales-b', parentId: 'fb' }],
    });
    const meta = replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [folderA, folderB]);
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    // 度量根 + 两个子文件夹都正常显示(不折)
    expect(screen.getByText('度量')).toBeInTheDocument();
    expect(screen.getByText('基础指标')).toBeInTheDocument();
    expect(screen.getByText('高级指标')).toBeInTheDocument();
  });

  it('度量有多个 children 但只 1 个 visible(其他 visible:false)→ 仍按 single-child 折叠', () => {
    // 真实 bug 场景:metadata 里 measures.children = [指标(visible), 隐藏 folder(visible:false)]
    // 旧实现按 children.length 判断 → 不折叠,用户看到"度量 / 指标"两层标签
    // 新实现按 visible-filtered 判断 → 仍折叠,只显示"度量"
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const sales = makeNode({
      id: 's',
      name: 'sales_m',
      alias: '销售额',
      aliasFromDb: '销售额',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'inner',
      visible: 1,
    });
    const visibleInner = makeNode({
      id: 'inner',
      name: '指标_inner',
      alias: '指标',
      aliasFromDb: '指标',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [sales],
    });
    const hiddenSibling = makeNode({
      id: 'hidden',
      name: 'hidden_folder',
      alias: '隐藏分组',
      aliasFromDb: '隐藏分组',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 0, // ← 关键:隐藏,渲染时 skip
    });
    const meta = replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [
      visibleInner,
      hiddenSibling,
    ]);
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('度量')).toBeInTheDocument();
    // "指标" 不应出现 — 被折掉
    expect(screen.queryByText('指标')).not.toBeInTheDocument();
    // 隐藏 folder 自然不应出现
    expect(screen.queryByText('隐藏分组')).not.toBeInTheDocument();
    // 字段正常显示
    expect(screen.getByText('销售额')).toBeInTheDocument();
  });

  it('hidden 类型(MEASURE_GROUP_NAME)不计入 visible children,仍按 single-child 折叠', () => {
    // metadata 里 measures.children = [指标 folder, MEASURE_GROUP_NAME 虚拟字段]
    // MEASURE_GROUP_NAME 走 HIDDEN_FIELD_TYPES 分支,渲染时 skip
    // 新实现把它跟 visible:false 同等对待,仍折叠
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const sales = makeNode({
      id: 's2',
      name: 'sales_m2',
      alias: '销售额',
      aliasFromDb: '销售额',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'inner2',
      visible: 1,
    });
    const visibleInner = makeNode({
      id: 'inner2',
      name: '指标_inner2',
      alias: '指标',
      aliasFromDb: '指标',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [sales],
    });
    const measureGroupName = makeNode({
      id: 'mgn',
      name: 'mgn',
      alias: '度量名称',
      aliasFromDb: '度量名称',
      type: 'MEASURE_GROUP_NAME',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1, // visible 为 true,但被 HIDDEN_FIELD_TYPES 过滤
    });
    const meta = replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [
      visibleInner,
      measureGroupName,
    ]);
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('度量')).toBeInTheDocument();
    expect(screen.queryByText('指标')).not.toBeInTheDocument();
  });

  it('多层 single-child 链(度量→A→B→字段)递归折叠,只剩外层"度量"', () => {
    const measureRoot = findRootByType(orderModelMetadata, 'MEASURE_FOLDER');
    const sales = makeNode({
      id: 's',
      name: 'sales_m',
      alias: '销售额',
      aliasFromDb: '销售额',
      type: 'MEASURE',
      group: 'MEASURE',
      parentId: 'fb',
      visible: 1,
    });
    const folderB = makeNode({
      id: 'fb',
      name: 'fb',
      alias: 'B',
      aliasFromDb: 'B',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: 'fa',
      visible: 1,
      children: [sales],
    });
    const folderA = makeNode({
      id: 'fa',
      name: 'fa',
      alias: 'A',
      aliasFromDb: 'A',
      type: 'FOLDER',
      group: 'MEASURE',
      parentId: measureRoot.id,
      visible: 1,
      children: [folderB],
    });
    const meta = replaceRootChildren(orderModelMetadata, 'MEASURE_FOLDER', [folderA]);
    render(<FieldTree metadata={meta} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('度量')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(screen.getByText('销售额')).toBeInTheDocument();
  });
});

// ============================================================
// P5+ 字段在用 checkbox(opt-in)
// ============================================================
describe('FieldTree — 字段 checkbox(opt-in)', () => {
  it('不传 fieldUsage / onFieldToggle → checkbox 不渲染', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    expect(
      screen.queryByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`),
    ).not.toBeInTheDocument();
  });

  it('传了 → 叶子字段渲染 checkbox', () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map()}
        onFieldToggle={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`),
    ).toBeInTheDocument();
  });

  it('usage=0 → 未勾,未 disabled', () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map()}
        onFieldToggle={vi.fn()}
      />,
    );
    const cb = screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`);
    expect(cb).not.toBeChecked();
    expect(cb).not.toBeDisabled();
  });

  it('usage=1 → 勾上,未 disabled(可点取消)', () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map([[FIELD_IDS.salesMeasure, 1]])}
        onFieldToggle={vi.fn()}
      />,
    );
    const cb = screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`);
    expect(cb).toBeChecked();
    expect(cb).not.toBeDisabled();
  });

  it('usage>=2 → 勾上但 disabled,tooltip 提示走 chip ×', () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map([[FIELD_IDS.salesMeasure, 2]])}
        onFieldToggle={vi.fn()}
      />,
    );
    const cb = screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`);
    expect(cb).toBeChecked();
    expect(cb).toBeDisabled();
    expect(cb).toHaveAttribute('title', expect.stringContaining('多个区域'));
  });

  it('点 unchecked → 调 onFieldToggle(name, type)', () => {
    const onToggle = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map()}
        onFieldToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`));
    expect(onToggle).toHaveBeenCalledWith(FIELD_IDS.salesMeasure, 'Measure');
  });

  it('点 usage=1 checked → 调 onFieldToggle(uncheck)', () => {
    const onToggle = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map([[FIELD_IDS.salesMeasure, 1]])}
        onFieldToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`));
    expect(onToggle).toHaveBeenCalledWith(FIELD_IDS.salesMeasure, 'Measure');
  });

  it('点 disabled (usage>=2) → 不调 onFieldToggle', () => {
    const onToggle = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        fieldUsage={new Map([[FIELD_IDS.salesMeasure, 3]])}
        onFieldToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('checkbox 双击不触发字段双击(stopPropagation)', () => {
    const onDoubleClick = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldDoubleClick={onDoubleClick}
        fieldUsage={new Map()}
        onFieldToggle={vi.fn()}
      />,
    );
    fireEvent.doubleClick(screen.getByTestId(`field-checkbox-${FIELD_IDS.salesMeasure}`));
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});

// ============================================================
// P5+ folder 展开/折叠
// ============================================================
describe('FieldTree — folder 展开/折叠', () => {
  const DIMENSION_FOLDER_ID = orderModelMetadata.nodes.find(
    (n) => n.type === 'DIMENSION_FOLDER',
  )!.id;

  it('默认全展开 — folder 内字段可见', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    // 维度 folder 下的字段(如省份)应可见
    expect(screen.getByText('省份')).toBeInTheDocument();
  });

  it('点 folder label → 折叠;再点 → 展开', async () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const folderLabel = screen.getByTestId(`field-tree-folder-${DIMENSION_FOLDER_ID}`);
    expect(folderLabel).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('省份')).toBeInTheDocument();

    // 折叠
    await userEvent.setup().click(folderLabel);
    expect(folderLabel).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('省份')).not.toBeInTheDocument();

    // 再点展开
    await userEvent.setup().click(folderLabel);
    expect(folderLabel).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('省份')).toBeInTheDocument();
  });

  it('chevron ▶/▼ 反映状态', async () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const folderLabel = screen.getByTestId(`field-tree-folder-${DIMENSION_FOLDER_ID}`);
    expect(folderLabel.textContent).toContain('▼');
    await userEvent.setup().click(folderLabel);
    expect(folderLabel.textContent).toContain('▶');
  });

  it('搜索 query 非空 → 强制展开(否则用户看不到匹配结果)', async () => {
    const { rerender } = render(
      <FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />,
    );
    const folderLabel = screen.getByTestId(`field-tree-folder-${DIMENSION_FOLDER_ID}`);
    // 先手动折叠
    await userEvent.setup().click(folderLabel);
    expect(screen.queryByText('省份')).not.toBeInTheDocument();

    // 触发搜索 → 应自动展开
    rerender(
      <FieldTree metadata={orderModelMetadata} searchQuery="省" onFieldDragStart={vi.fn()} />,
    );
    expect(screen.getByText('省份')).toBeInTheDocument();
    expect(
      screen.getByTestId(`field-tree-folder-${DIMENSION_FOLDER_ID}`),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('Enter / Space 键也能 toggle(可访问性)', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const folderLabel = screen.getByTestId(`field-tree-folder-${DIMENSION_FOLDER_ID}`);
    fireEvent.keyDown(folderLabel, { key: 'Enter' });
    expect(folderLabel).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(folderLabel, { key: ' ' });
    expect(folderLabel).toHaveAttribute('aria-expanded', 'true');
  });

  it('表视图(mode=table)的 view-folder 也支持 toggle', async () => {
    render(
      <FieldTree
        metadata={orderModelMetadata}
        mode="table"
        onFieldDragStart={vi.fn()}
      />,
    );
    // 表视图下 viewId 作为 folder id 前缀;orderModel fixture 至少有 1 个 view
    const viewFolderLabels = screen.getAllByText(/.+/, { selector: '.field-tree__folder-label' });
    expect(viewFolderLabels.length).toBeGreaterThan(0);
    const firstFolder = viewFolderLabels[0]!;
    expect(firstFolder).toHaveAttribute('aria-expanded', 'true');
    await userEvent.setup().click(firstFolder);
    expect(firstFolder).toHaveAttribute('aria-expanded', 'false');
  });
});

// ============================================================
// P5+ Hierarchy 节点 levels 折叠(chevron 才接 toggle,避开 drag/双击冲突)
// ============================================================
describe('FieldTree — Hierarchy 折叠 levels', () => {
  const HIERARCHY_ID = orderModelMetadata.nodes.find(
    (n) => n.type === 'HIERARCHY',
  )!.id;

  it('Hierarchy 默认展开 → levels 可见', () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    expect(screen.getByText('省份')).toBeInTheDocument();
  });

  it('点 chevron → 折叠 levels;再点 → 展开', async () => {
    render(<FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />);
    const chevron = screen.getByTestId(`field-tree-hierarchy-${HIERARCHY_ID}`);
    expect(chevron).toHaveAttribute('aria-expanded', 'true');

    await userEvent.setup().click(chevron);
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('省份')).not.toBeInTheDocument();

    await userEvent.setup().click(chevron);
    expect(screen.getByText('省份')).toBeInTheDocument();
  });

  it('chevron 点击 不触发 Hierarchy 自身的 onDoubleClick(stopPropagation)', () => {
    const onDoubleClick = vi.fn();
    render(
      <FieldTree
        metadata={orderModelMetadata}
        onFieldDragStart={vi.fn()}
        onFieldDoubleClick={onDoubleClick}
      />,
    );
    const chevron = screen.getByTestId(`field-tree-hierarchy-${HIERARCHY_ID}`);
    fireEvent.doubleClick(chevron);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('搜索 query 非空 → Hierarchy 也强制展开', async () => {
    const { rerender } = render(
      <FieldTree metadata={orderModelMetadata} onFieldDragStart={vi.fn()} />,
    );
    const chevron = screen.getByTestId(`field-tree-hierarchy-${HIERARCHY_ID}`);
    await userEvent.setup().click(chevron); // 折叠
    expect(screen.queryByText('省份')).not.toBeInTheDocument();

    rerender(
      <FieldTree
        metadata={orderModelMetadata}
        searchQuery="省"
        onFieldDragStart={vi.fn()}
      />,
    );
    expect(screen.getByText('省份')).toBeInTheDocument();
  });
});
