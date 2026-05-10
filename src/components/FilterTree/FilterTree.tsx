/**
 * FilterTree — 通用过滤条件树编辑器(P3 重构)
 *
 * 维度过滤 / 度量过滤共用同一组件,通过 leaf 渲染 prop 注入差异。
 *
 * 视觉:
 *   隐式根 AND group(顶层不显示标签)
 *   ├─ leaf row: [字段] [op ▼] [value]  [拆分→group] [×]   ← 整行 draggable,可拖出
 *   ├─ group row: [AND/OR ▼] (子节点缩进展示)        [+加子条件] [×] ← group 整块也可拖
 *   │  ├─ leaf row...
 *   │  └─ leaf row...
 *   └─ 拖字段进空白处 / 点 [+ 添加条件] 按钮 → 加 leaf 到根
 *
 * 拖拽两种语义:
 *   - 外部字段(PIVOT_FIELD_MIME) → 创建新 leaf
 *   - 内部节点(PIVOT_FILTER_NODE_MIME, 同 treeId)→ 移动现有节点(moveNode)
 *
 * 数据视角:tree 是 TreeNode<L>[](顶层数组语义=隐式 AND group)
 */
import {
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';

import {
  decodePivotField,
  decodePivotFilterNode,
  encodePivotFilterNode,
  PIVOT_FIELD_MIME,
  PIVOT_FILTER_NODE_MIME,
} from '../../core/dropRules/dragProtocol.js';
import {
  addLeaf,
  moveNode,
  removeAt,
  setGroupOp,
  updateNodeAt,
  wrapLeafInGroup,
  type TreeNode,
} from '../../core/filterTree/filterTree.js';
import type { FieldType } from '../../core/dropRules/dropRules.js';

export interface FilterTreeProps<L> {
  /** 树数据(顶层数组 = 隐式 AND group) */
  tree: TreeNode<L>[];
  onChange: (next: TreeNode<L>[]) => void;
  /**
   * 渲染 leaf 行的字段/op/value(组件不知道 leaf 内部字段名 — field 还是 measureName)。
   * 接受 path,host 内部用 updateNodeAt 改 leaf 实现 leaf 编辑。
   */
  renderLeaf: (
    leaf: L,
    path: number[],
    onLeafChange: (next: L) => void,
  ) => ReactNode;
  /**
   * 拖字段进树 → 创建一个 leaf;onChange 自动 append 到目标 group
   *   - droppedAt=[] → 根
   *   - droppedAt=[i,...] → 该 group children
   *   返回 null 表示该 fieldType 不允许放 (host filter dropRules 控制)
   */
  fieldDropToLeaf: (fieldName: string, fieldType: FieldType) => L | null;
  /** "+ 添加条件" 按钮的默认 leaf 模板;不传 → 不显示按钮 */
  newLeafTemplate?: () => L;
  /** 空状态文字 */
  emptyHint?: string;
  /** data-testid 前缀,默认 'filter-tree';同 host 内多棵树时用来区分 */
  testidPrefix?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 解析 drop 事件的 payload(优先内部节点移动,再回退到字段拖入)。
 *
 *   - 同 tree 内部节点 payload → { kind: 'move', from }
 *   - 跨 tree 的内部节点 payload(treeId 不匹配)→ null(拒绝跨 dim/measure 拖)
 *   - 外部字段 payload → { kind: 'field', ... }
 *   - 都没有 → null
 */
function parseDropPayload(
  e: DragEvent<HTMLDivElement>,
  treeId: string,
):
  | { kind: 'move'; from: number[] }
  | { kind: 'field'; fieldName: string; fieldType: FieldType }
  | null {
  const rawNode = e.dataTransfer.getData(PIVOT_FILTER_NODE_MIME);
  const nodePayload = decodePivotFilterNode(rawNode);
  if (nodePayload) {
    if (nodePayload.treeId !== treeId) return null; // 跨 tree 拒绝
    return { kind: 'move', from: nodePayload.path };
  }
  const rawField = e.dataTransfer.getData(PIVOT_FIELD_MIME);
  const fieldPayload = decodePivotField(rawField);
  if (fieldPayload) {
    return {
      kind: 'field',
      fieldName: fieldPayload.fieldName,
      fieldType: fieldPayload.fieldType,
    };
  }
  return null;
}

/**
 * 单节点渲染器(递归)
 */
function NodeRenderer<L>({
  node,
  path,
  tree,
  onChange,
  renderLeaf,
  fieldDropToLeaf,
  newLeafTemplate,
  isRoot,
  testidPrefix,
}: {
  node: TreeNode<L>;
  path: number[];
  tree: TreeNode<L>[];
  onChange: (next: TreeNode<L>[]) => void;
  renderLeaf: FilterTreeProps<L>['renderLeaf'];
  fieldDropToLeaf: FilterTreeProps<L>['fieldDropToLeaf'];
  newLeafTemplate?: FilterTreeProps<L>['newLeafTemplate'];
  isRoot?: boolean;
  testidPrefix: string;
}): ReactNode {
  // 注意:hooks 必须无条件调用 — leaf 节点也会持有这个 state(不用而已)
  const [isGroupDragOver, setIsGroupDragOver] = useState(false);
  const isGroup =
    typeof node === 'object' &&
    node !== null &&
    (node as { kind?: string }).kind === 'group';
  const pathKey = path.join('-') || 'root';

  /** 节点 dragstart:发出 node payload,stopPropagation 防止外层 group 也起 drag */
  const handleNodeDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      PIVOT_FILTER_NODE_MIME,
      encodePivotFilterNode({ treeId: testidPrefix, path }),
    );
  };

  if (isGroup) {
    const group = node as { op: 'And' | 'Or'; children: TreeNode<L>[] };
    const handleGroupDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (!isGroupDragOver) setIsGroupDragOver(true);
    };
    const handleGroupDragLeave = (e: DragEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setIsGroupDragOver(false);
    };
    const handleGroupDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsGroupDragOver(false);
      const payload = parseDropPayload(e, testidPrefix);
      if (!payload) return;
      if (payload.kind === 'move') {
        onChange(moveNode(tree, payload.from, path));
        return;
      }
      const newLeaf = fieldDropToLeaf(payload.fieldName, payload.fieldType);
      if (newLeaf === null) return;
      onChange(addLeaf(tree, path, newLeaf));
    };
    return (
      <div
        className="filter-tree__group"
        data-testid={`${testidPrefix}-group-${pathKey}`}
        data-op={group.op}
        data-drag-over={isGroupDragOver ? 'true' : 'false'}
        draggable={!isRoot}
        onDragStart={handleNodeDragStart}
        onDragOver={handleGroupDragOver}
        onDragLeave={handleGroupDragLeave}
        onDrop={handleGroupDrop}
      >
        <div className="filter-tree__group-header">
          <select
            className="filter-tree__op"
            data-testid={`${testidPrefix}-op-${pathKey}`}
            value={group.op}
            onChange={(e) =>
              onChange(setGroupOp(tree, path, e.target.value as 'And' | 'Or'))
            }
            title={group.op === 'And' ? '所有条件都满足(AND)' : '任一条件满足(OR)'}
          >
            <option value="And">且 (AND)</option>
            <option value="Or">或 (OR)</option>
          </select>
          {newLeafTemplate && (
            <button
              type="button"
              className="filter-tree__add-btn"
              data-testid={`${testidPrefix}-add-${pathKey}`}
              onClick={() => onChange(addLeaf(tree, path, newLeafTemplate()))}
            >
              + 加子条件
            </button>
          )}
          {!isRoot && (
            <button
              type="button"
              className="filter-tree__remove-btn"
              data-testid={`${testidPrefix}-remove-${pathKey}`}
              aria-label="删除该 group"
              onClick={() => onChange(removeAt(tree, path))}
            >
              ×
            </button>
          )}
        </div>
        <div className="filter-tree__group-body">
          {group.children.map((child, i) => (
            <NodeRenderer
              key={i}
              node={child}
              path={[...path, i]}
              tree={tree}
              onChange={onChange}
              renderLeaf={renderLeaf}
              fieldDropToLeaf={fieldDropToLeaf}
              newLeafTemplate={newLeafTemplate}
              testidPrefix={testidPrefix}
            />
          ))}
        </div>
      </div>
    );
  }

  // leaf
  const leaf = node as L;
  return (
    <div
      className="filter-tree__leaf"
      data-testid={`${testidPrefix}-leaf-${pathKey}`}
      draggable
      onDragStart={handleNodeDragStart}
    >
      {renderLeaf(leaf, path, (next) =>
        onChange(updateNodeAt(tree, path, () => next as TreeNode<L>)),
      )}
      <button
        type="button"
        className="filter-tree__action-btn"
        data-testid={`${testidPrefix}-wrap-${pathKey}`}
        title="拆分为 group(加 OR/AND 兄弟条件)"
        onClick={() => onChange(wrapLeafInGroup(tree, path, 'Or'))}
      >
        拆分
      </button>
      <button
        type="button"
        className="filter-tree__remove-btn"
        data-testid={`${testidPrefix}-remove-${pathKey}`}
        aria-label="删除该条件"
        onClick={() => onChange(removeAt(tree, path))}
      >
        ×
      </button>
    </div>
  );
}

export function FilterTree<L>({
  tree,
  onChange,
  renderLeaf,
  fieldDropToLeaf,
  newLeafTemplate,
  emptyHint = '拖字段到这里 或 + 添加条件',
  testidPrefix = 'filter-tree',
  className,
  style,
}: FilterTreeProps<L>): ReactNode {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const payload = parseDropPayload(e, testidPrefix);
    if (!payload) return;
    if (payload.kind === 'move') {
      // 内部节点拖到根容器 → 移到根末尾
      onChange(moveNode(tree, payload.from, []));
      return;
    }
    const newLeaf = fieldDropToLeaf(payload.fieldName, payload.fieldType);
    if (newLeaf === null) return;
    onChange(addLeaf(tree, [], newLeaf));
  };

  return (
    <div
      className={className ? `filter-tree ${className}` : 'filter-tree'}
      data-testid={testidPrefix}
      data-drag-over={isDragOver ? 'true' : 'false'}
      style={style}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {tree.length === 0 ? (
        <div className="filter-tree__empty" data-testid={`${testidPrefix}-empty`}>
          {emptyHint}
        </div>
      ) : (
        <div className="filter-tree__root-body">
          {tree.map((node, i) => (
            <NodeRenderer
              key={i}
              node={node}
              path={[i]}
              tree={tree}
              onChange={onChange}
              renderLeaf={renderLeaf}
              fieldDropToLeaf={fieldDropToLeaf}
              newLeafTemplate={newLeafTemplate}
              testidPrefix={testidPrefix}
            />
          ))}
        </div>
      )}
      {newLeafTemplate && (
        <button
          type="button"
          className="filter-tree__add-btn filter-tree__add-btn--root"
          data-testid={`${testidPrefix}-add-root`}
          onClick={() => onChange(addLeaf(tree, [], newLeafTemplate()))}
        >
          + 添加条件
        </button>
      )}
    </div>
  );
}
