/**
 * FieldTree — 左侧字段树(2026-05-06 重写,对齐新 AugmentedDataSet 结构)
 *
 * 数据来源:`metadata.nodes[]` 里 root nodes(parentId=null)— 通常是
 * DIMENSION_FOLDER / MEASURE_FOLDER / NAMEDSET_FOLDER 三个 group folder。
 *
 * 显示名 / desc / visible 都通过 helper(getAlias / getDesc / isVisible)取,
 * 屏蔽 useFromDb / aliasFromDb / alias 三段命名差异。
 *
 * 双视图(P3+):
 *   - **多维视图(默认)** mode='multi':按 nodes[] 树渲染(当前)— 维度/度量/层次/命名集分组
 *   - **表视图** mode='table':按 metadata.views[](数据库表)分组,每张表展示挂在该 view 下的
 *     leaf 字段(通过 levels/measures/fields/calcMeasures 反查 viewId,把同 viewId 的 leaf 聚到一起)。
 *     缺 viewId 的 leaf(如 calcMeasures viewId=null,namedSets 等)归到 "其他" 桶。
 */
import { useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

import { encodePivotField, PIVOT_FIELD_MIME } from '../../core/dropRules/dragProtocol.js';
import type { FieldType } from '../../core/dropRules/dropRules.js';
import { deriveFieldDisplayType } from '../../core/metadata/fieldDisplayType.js';
import {
  getAlias,
  getDesc,
  isVisible,
  type FieldNode,
  type Metadata,
} from '../../types/metadata.js';

/**
 * 右键事件参数。x/y 用 viewport 坐标(clientX/clientY),方便宿主直接定位浮层。
 */
export interface FieldContextMenuEvent {
  fieldName: string;
  fieldType: FieldType;
  x: number;
  y: number;
}

export type FieldTreeMode = 'multi' | 'table';

export interface FieldTreeProps {
  metadata: Metadata;
  searchQuery?: string;
  /** P3+ 视图模式 — 'multi'(多维,默认) / 'table'(按 views[] 分组) */
  mode?: FieldTreeMode;
  onFieldDragStart: (fieldName: string, fieldType: FieldType) => void;
  /**
   * 右键字段(仅 draggable 节点会触发;NamedSet/folder/不可拖节点不触发)。
   * FieldTree 自身不渲染菜单,只把事件转出去;宿主决定渲染什么。
   */
  onFieldContextMenu?: (event: FieldContextMenuEvent) => void;
  /**
   * 双击字段 — 宿主用规则路由到默认 zone(P2 UX:度量→数值,维度类→行)
   */
  onFieldDoubleClick?: (fieldName: string, fieldType: FieldType) => void;
  /**
   * P5+ 字段使用情况映射(fieldName → 该字段在 viewConfig 各 zone 累计出现次数):
   *   - 0 / undefined:未使用 → checkbox 不勾
   *   - 1:正好在 1 个 zone 用 → checkbox 勾上,可点取消(等同删除)
   *   - 2+:在多个 zone 用 → checkbox 勾上,**不可点**(避免一键删歧义),tooltip 提示走 chip × 单删
   * 不传则不渲染 checkbox(向后兼容)。
   */
  fieldUsage?: ReadonlyMap<string, number>;
  /**
   * P5+ 用户点击 checkbox 切换状态时回调;不传则不渲染 checkbox。
   * 宿主自己根据当前 usage 决定:
   *   - usage=0 → 走双击规则添加(DROP_FIELD)
   *   - usage=1 → 删除(REMOVE_FIELD,从那个 zone)
   *   - usage>=2 → FieldTree 自己拦了,不会调本回调
   */
  onFieldToggle?: (fieldName: string, fieldType: FieldType) => void;
  className?: string;
  style?: CSSProperties;
}

type NodeKind = FieldType | 'folder';

function nodeKind(node: FieldNode): NodeKind {
  switch (node.type) {
    case 'DIMENSION_FOLDER':
    case 'MEASURE_FOLDER':
    case 'NAMEDSET_FOLDER':
    case 'FOLDER':
      return 'folder';
    case 'HIERARCHY':
    case 'HIERARCHY_TIME':
      return 'Hierarchy';
    case 'CALC_GROUP':
    case 'CALC':
      return 'CalcGroup';
    case 'MEASURE':
      return 'Measure';
    case 'CALC_MEASURE':
      return 'CalcMeasure';
    case 'NAMEDSET':
      return 'NamedSet';
    // 普通维度叶子(LEVEL / FIELD / 时间 LEVEL)
    case 'LEVEL':
    case 'LEVEL_TIME_YEAR':
    case 'LEVEL_TIME_QUARTER':
    case 'LEVEL_TIME_MONTH':
    case 'LEVEL_TIME_DAY':
    case 'FIELD':
    case 'MEASURE_GROUP_NAME':
    case 'MEASURE_GROUP_VALUE':
      return 'Dimension';
  }
}

// P0 可拖类型集合(NamedSet 故意排除 — 显示但不可拖)
const DRAGGABLE_TYPES = new Set<NodeKind>([
  'Hierarchy',
  'Dimension',
  'CalcGroup',
  'Measure',
  'CalcMeasure',
]);

function aliasMatches(node: FieldNode, query: string): boolean {
  if (!query) return true;
  return getAlias(node).toLowerCase().includes(query);
}

/**
 * 节点是否应在搜索结果中保留:
 *   - 叶子:自己 alias 命中
 *   - 文件夹 / Hierarchy:子树有任一可见叶子命中
 */
function subtreeMatches(node: FieldNode, query: string): boolean {
  if (!isVisible(node)) return false;
  if (!query) return true;
  if (aliasMatches(node, query)) return true;
  const kind = nodeKind(node);
  if (kind === 'folder' || kind === 'Hierarchy') {
    return node.children.some((c) => subtreeMatches(c, query));
  }
  return false;
}

/**
 * 字段树不应暴露的内部字段类型:
 *   - MEASURE_GROUP_NAME / MEASURE_GROUP_VALUE: 后端"度量轴控制"虚拟字段,
 *     P3 起由 DropZones 的"Σ 度量名称"chip 自动管理,不需要用户从字段树拖。
 */
const HIDDEN_FIELD_TYPES = new Set<FieldNode['type']>([
  'MEASURE_GROUP_NAME',
  'MEASURE_GROUP_VALUE',
]);

function isRenderableFolderChild(n: FieldNode): boolean {
  return isVisible(n) && !HIDDEN_FIELD_TYPES.has(n.type);
}

/**
 * 折叠 single-child folder 链:避免"度量 / 指标"两层标题贴一起。
 * 保留外层 alias,提升中间层 children。
 */
function flattenSingleChildFolder(node: FieldNode): {
  alias: string;
  children: FieldNode[];
} {
  let children = node.children;
  while (true) {
    const visible = children.filter(isRenderableFolderChild);
    if (visible.length !== 1) break;
    const only = visible[0]!;
    if (nodeKind(only) !== 'folder') break;
    children = only.children;
  }
  return { alias: getAlias(node), children };
}

/**
 * renderNode 的渲染上下文 — 把多个 callback / state 打包,避免函数签名爆炸。
 * 加新 prop 时改这里 + renderNode 内部用法,不用动每处递归调用。
 */
interface RenderCtx {
  query: string;
  onFieldDragStart: (name: string, t: FieldType) => void;
  onFieldContextMenu: ((e: FieldContextMenuEvent) => void) | undefined;
  onFieldDoubleClick: ((name: string, t: FieldType) => void) | undefined;
  fieldUsage: ReadonlyMap<string, number> | undefined;
  onFieldToggle: ((name: string, t: FieldType) => void) | undefined;
  /** P5+ folder 折叠状态 — Set 里的 folder id 表示已折叠;不在表示展开(默认全展开) */
  collapsedFolders: ReadonlySet<string>;
  toggleFolder: (id: string) => void;
}

function renderNode(node: FieldNode, ctx: RenderCtx): ReactNode {
  if (!isVisible(node)) return null;
  if (HIDDEN_FIELD_TYPES.has(node.type)) return null;
  if (ctx.query && !subtreeMatches(node, ctx.query)) return null;

  const kind = nodeKind(node);

  if (kind === 'folder') {
    const { alias, children } = flattenSingleChildFolder(node);
    // 搜索状态下:强制展开(否则看不到匹配结果);非搜索时按用户折叠状态
    const isSearching = ctx.query !== '';
    const collapsed = !isSearching && ctx.collapsedFolders.has(node.id);
    return (
      <div
        key={node.id}
        className="field-tree__folder"
        data-folder
        data-collapsed={collapsed ? 'true' : undefined}
      >
        <div
          className="field-tree__folder-label"
          data-testid={`field-tree-folder-${node.id}`}
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onClick={() => ctx.toggleFolder(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              ctx.toggleFolder(node.id);
            }
          }}
        >
          <span className="field-tree__folder-chevron" aria-hidden>
            {collapsed ? '▶' : '▼'}
          </span>
          {alias}
        </div>
        {!collapsed && (
          <div className="field-tree__folder-children">
            {children.map((c) => renderNode(c, ctx))}
          </div>
        )}
      </div>
    );
  }

  const draggable = DRAGGABLE_TYPES.has(kind);
  const fieldType = kind as FieldType;
  const renderChildren = kind === 'Hierarchy' && node.children.length > 0;
  const alias = getAlias(node);
  const desc = getDesc(node);
  // P5+ 数据类型 — 用于 Dimension 字段 icon 细分(time level 用日期 icon 而非默认 Aa)
  const displayType = deriveFieldDisplayType(node);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    try {
      e.dataTransfer.setData(
        PIVOT_FIELD_MIME,
        encodePivotField({ fieldName: node.name, fieldType }),
      );
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      // jsdom 等环境无 dataTransfer,忽略;callback 仍触发
    }
    ctx.onFieldDragStart(node.name, fieldType);
  };

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!draggable) return;
    if (!ctx.onFieldContextMenu) return;
    e.stopPropagation();
    e.preventDefault();
    ctx.onFieldContextMenu({ fieldName: node.name, fieldType, x: e.clientX, y: e.clientY });
  };

  const handleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!draggable) return;
    if (!ctx.onFieldDoubleClick) return;
    e.stopPropagation();
    e.preventDefault();
    ctx.onFieldDoubleClick(node.name, fieldType);
  };

  // P5+ 字段使用状态 checkbox(opt-in:fieldUsage + onFieldToggle 都传了才渲染)
  // 渲染规则:
  //   - 仅 draggable 节点(维度/度量/Hierarchy/CalcGroup/CalcMeasure 等可拖类型)显示
  //   - Hierarchy 子 level(LEVEL_TIME_*) 不显示(下面 renderChildren 子节点继承的是 Hierarchy 父的逻辑)
  //   - usage>=2 → checkbox 灰显不可点(避免一键删歧义)
  const showCheckbox =
    draggable &&
    ctx.fieldUsage !== undefined &&
    ctx.onFieldToggle !== undefined;
  const usage = ctx.fieldUsage?.get(node.name) ?? 0;
  const checked = usage > 0;
  const ambiguous = usage >= 2;
  const handleCheckboxChange = (e: ReactMouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (ambiguous) return; // 多 zone 下不处理(input 自身已 disabled,这里防御)
    ctx.onFieldToggle?.(node.name, fieldType);
  };
  const checkboxNode = showCheckbox ? (
    <input
      type="checkbox"
      className="field-tree__checkbox"
      data-testid={`field-checkbox-${node.name}`}
      checked={checked}
      disabled={ambiguous}
      title={
        ambiguous
          ? '该字段在多个区域使用 — 请通过 chip 上的 × 单独删除'
          : checked
            ? '取消勾选 → 从当前区域移除'
            : '勾选 → 添加到默认区域(维度→行,度量→数值)'
      }
      onClick={handleCheckboxChange}
      // 防止 checkbox 点击冒泡触发整个 row 的 onDoubleClick / dragStart
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      // checked 是受控,React 抑制 onChange 警告需要 stub(实际逻辑在 onClick)
      onChange={() => {}}
      readOnly={ambiguous}
    />
  ) : null;

  if (renderChildren) {
    // Hierarchy 也支持折叠 levels(跟 folder 同语义,搜索时强展开)。
    // 只让 chevron 接 toggle click — label 其余部分保留 drag / 双击 / 右键语义。
    const isSearching = ctx.query !== '';
    const collapsed = !isSearching && ctx.collapsedFolders.has(node.id);
    return (
      <div
        key={node.id}
        className="field-tree__hierarchy"
        data-field-type={fieldType}
        data-display-type={displayType ?? undefined}
        data-draggable={draggable}
        data-collapsed={collapsed ? 'true' : undefined}
        draggable={draggable}
        title={desc}
        onDragStart={handleDragStart}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        <div className="field-tree__field-label">
          <span
            className="field-tree__hierarchy-chevron"
            data-testid={`field-tree-hierarchy-${node.id}`}
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展开层次' : '折叠层次'}
            onClick={(e) => {
              e.stopPropagation();
              ctx.toggleFolder(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                ctx.toggleFolder(node.id);
              }
            }}
            // 阻断 mousedown / dblclick 冒泡到 wrapper(防触发 drag / 加到行)
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {collapsed ? '▶' : '▼'}
          </span>
          {checkboxNode}
          {alias}
        </div>
        {!collapsed && (
          <div className="field-tree__hierarchy-children">
            {node.children.map((c) => renderNode(c, ctx))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      key={node.id}
      className="field-tree__field"
      data-field-type={fieldType}
      data-display-type={displayType ?? undefined}
      data-draggable={draggable}
      title={desc}
      draggable={draggable}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {checkboxNode}
      {alias}
    </div>
  );
}

/**
 * 把 nodes[] 按物理表(views[].id)分组 — 用于"表视图"。
 *
 * 算法:
 *   1. 收集所有 leaf 节点(没 children 或 type=FIELD / LEVEL_xxx / CALC / MEASURE / CALC_MEASURE)
 *   2. 通过 levels/measures/fields/calcMeasures 反查每个 leaf 的 viewId
 *   3. 按 viewId 分桶,viewId=null/找不到 view 的归到 "_other_" 桶
 *   4. 每个桶按 view.alias / aliasFromDb 渲染为一个 folder
 *
 * 跟 buildMetadataIndex 类似但更简单(只关心 leaf → viewId,不关心树形展开)。
 * 不抽到 core 是因为只一处用,Unix"先不抽"。
 */
function groupLeavesByView(metadata: Metadata): Array<{
  viewId: string | null;
  viewLabel: string;
  leaves: FieldNode[];
}> {
  // 1. id → viewId 索引(平展数组)
  const viewIdById = new Map<string, string | null>();
  for (const lv of metadata.levels) viewIdById.set(lv.id, lv.viewId);
  for (const m of metadata.measures) viewIdById.set(m.id, m.viewId);
  for (const f of metadata.fields) viewIdById.set(f.id, f.viewId);
  // calcMeasures 没 viewId,但加进来标记"已知非分组桶";后续找不到 viewId 自然落 "_other_"
  for (const cm of metadata.calcMeasures) viewIdById.set(cm.id, null);

  // 2. view.id → label
  const viewLabelById = new Map<string, string>();
  for (const v of metadata.views) {
    viewLabelById.set(
      v.id,
      v.useFromDb ? (v.aliasFromDb || v.name) : (v.alias || v.aliasFromDb || v.name),
    );
  }

  // 3. 扁平化 nodes[] 树,挑 leaf
  const buckets = new Map<string, FieldNode[]>();
  function walk(node: FieldNode): void {
    if (!isVisible(node) || HIDDEN_FIELD_TYPES.has(node.type)) {
      // folder 仍要进入 children
      for (const c of node.children) walk(c);
      return;
    }
    const kind = nodeKind(node);
    if (kind === 'folder') {
      for (const c of node.children) walk(c);
      return;
    }
    // leaf 节点(含 Hierarchy / Dimension / Measure / CalcMeasure / CalcGroup / NamedSet)
    const viewId = viewIdById.get(node.id) ?? null;
    const bucketKey = viewId ?? '_other_';
    let arr = buckets.get(bucketKey);
    if (!arr) {
      arr = [];
      buckets.set(bucketKey, arr);
    }
    arr.push(node);
    // hierarchy 的 children(levels)在 multi 视图里展开,在表视图里我们也按它们的 viewId 分桶
    // (一个 hierarchy 的多个 level 通常都属同一 view,但保险起见独立处理)
    for (const c of node.children) walk(c);
  }
  for (const root of metadata.nodes.filter((n) => n.parentId === null)) walk(root);

  // 4. 按 metadata.views 顺序输出,最后追加 "_other_"
  const out: Array<{ viewId: string | null; viewLabel: string; leaves: FieldNode[] }> = [];
  for (const v of metadata.views) {
    const arr = buckets.get(v.id);
    if (!arr || arr.length === 0) continue;
    out.push({
      viewId: v.id,
      viewLabel: viewLabelById.get(v.id) ?? v.name,
      leaves: arr,
    });
  }
  const other = buckets.get('_other_');
  if (other && other.length > 0) {
    out.push({ viewId: null, viewLabel: '其他', leaves: other });
  }
  return out;
}

/**
 * 表视图里把 leaf 渲染成跟多维视图同样的拖拽 chip。
 *
 * 复用 renderNode(类型 = leaf 时不会递归 children — Hierarchy 例外,
 * 我们让 Hierarchy 在表视图里也能展开 levels)。
 */
function renderTableView(
  groups: ReturnType<typeof groupLeavesByView>,
  ctx: RenderCtx,
): ReactNode {
  return groups.map((g) => {
    const visibleLeaves = g.leaves.filter((n) => subtreeMatches(n, ctx.query));
    if (visibleLeaves.length === 0) return null;
    // 表视图 view 当 folder id 用(viewId 不为空时);_other_ bucket 用固定字符串
    const folderId = `view::${g.viewId ?? '_other_'}`;
    const isSearching = ctx.query !== '';
    const collapsed = !isSearching && ctx.collapsedFolders.has(folderId);
    return (
      <div
        key={g.viewId ?? '_other_'}
        className="field-tree__folder"
        data-folder
        data-view-id={g.viewId ?? ''}
        data-collapsed={collapsed ? 'true' : undefined}
      >
        <div
          className="field-tree__folder-label"
          data-testid={`field-tree-folder-${folderId}`}
          title={`数据表:${g.viewLabel}`}
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onClick={() => ctx.toggleFolder(folderId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              ctx.toggleFolder(folderId);
            }
          }}
        >
          <span className="field-tree__folder-chevron" aria-hidden>
            {collapsed ? '▶' : '▼'}
          </span>
          {g.viewLabel}
        </div>
        {!collapsed && (
          <div className="field-tree__folder-children">
            {visibleLeaves.map((leaf) => renderNode(leaf, ctx))}
          </div>
        )}
      </div>
    );
  });
}

export function FieldTree({
  metadata,
  searchQuery = '',
  mode = 'multi',
  onFieldDragStart,
  onFieldContextMenu,
  onFieldDoubleClick,
  fieldUsage,
  onFieldToggle,
  className,
  style,
}: FieldTreeProps) {
  // P5+ folder 折叠状态(本地 UI state,不入 viewConfig)— 默认全展开,Set 里是已折叠的 folder id
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ctx: RenderCtx = {
    query: searchQuery.trim().toLowerCase(),
    onFieldDragStart,
    onFieldContextMenu,
    onFieldDoubleClick,
    fieldUsage,
    onFieldToggle,
    collapsedFolders,
    toggleFolder,
  };
  return (
    <div
      className={className ? `field-tree ${className}` : 'field-tree'}
      data-mode={mode}
      style={style}
    >
      {mode === 'table'
        ? renderTableView(groupLeavesByView(metadata), ctx)
        : metadata.nodes
            .filter((n) => n.parentId === null)
            .map((root) => renderNode(root, ctx))}
    </div>
  );
}
