/**
 * ModelPicker — 弹出 modal,树形浏览 Smartbi 资源目录,选数据模型
 *
 * 用法:
 *   <ModelPicker
 *     client={activeClient}  // 必须用 proxy URL 构造的 client,否则浏览器跨域 401
 *     initialModelId={activeConfig.modelId}
 *     onPick={({id, name, aliasPath}) => updateConfigModel(id, aliasPath)}
 *     onClose={() => setPickerOpen(false)}
 *   />
 *
 * 设计(Unix):
 *   - 只做"展现 + 选择",不管 baseUrl/token 来源 — 父组件传 SmartbiClient 实例
 *     (这样 picker 也不关心是不是走 proxy / 用哪个 baseUrl,跨域问题在父级解决)
 *   - 用 SmartbiClient.fetchCatalogChildren lazy 拉子节点(展开一层才 fetch 一层)
 *   - 节点分类:isCatalogLeaf=可选(数据模型);isCatalogFolder=可展开(文件夹)
 *
 * 状态(本地):
 *   - rootNodes:第一次 mount 时拉的根 children;null=loading
 *   - expanded:已展开文件夹的 id → 子节点数组(同时充当缓存)
 *   - loading:正在拉的文件夹 id 集合(展开图标用 ⏳)
 *   - selectedId / selectedNode:用户当前点中的叶子
 *   - error:fetch 失败的最后一条 message
 */
import { useEffect, useState, type CSSProperties } from 'react';

import {
  PUBLIC_DATASET_ROOT_ID,
  type SmartbiClient,
  isCatalogFolder,
  isCatalogLeaf,
  type CatalogNode,
} from '../src/api/smartbi/SmartbiClient.js';

export interface PickedModel {
  id: string;
  name: string;
  aliasPath: string;
}

export interface ModelPickerProps {
  /** 已构造好的 client(由父级传入,保证 baseUrl 走 proxy 同源,避免 CORS 401) */
  client: SmartbiClient;
  /** 当前已选 modelId(打开时高亮)*/
  initialModelId?: string;
  onPick: (model: PickedModel) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ModelPicker({
  client,
  initialModelId,
  onPick,
  onClose,
  className,
  style,
}: ModelPickerProps) {

  const [rootNodes, setRootNodes] = useState<CatalogNode[] | null>(null);
  const [expanded, setExpanded] = useState<Map<string, CatalogNode[]>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialModelId ?? null);
  const [selectedNode, setSelectedNode] = useState<CatalogNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRootNodes(null);
    setError(null);
    client
      .fetchCatalogChildren(PUBLIC_DATASET_ROOT_ID)
      .then((nodes) => {
        if (!cancelled) setRootNodes(nodes);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const toggleFolder = async (node: CatalogNode) => {
    // 已展开 → 折叠(从缓存里删)
    if (expanded.has(node.id)) {
      setExpanded((prev) => {
        const next = new Map(prev);
        next.delete(node.id);
        return next;
      });
      return;
    }
    // 未展开 → 拉子节点
    setLoading((prev) => new Set(prev).add(node.id));
    try {
      const children = await client.fetchCatalogChildren(node.id);
      setExpanded((prev) => new Map(prev).set(node.id, children));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
    }
  };

  const selectLeaf = (node: CatalogNode) => {
    setSelectedId(node.id);
    setSelectedNode(node);
  };

  const confirm = () => {
    if (!selectedNode) return;
    onPick({
      id: selectedNode.id,
      name: selectedNode.alias || selectedNode.name,
      aliasPath: selectedNode.aliasPath,
    });
    onClose();
  };

  const renderNode = (node: CatalogNode, depth: number): React.ReactNode => {
    const leaf = isCatalogLeaf(node);
    const folder = isCatalogFolder(node);
    const isExpanded = expanded.has(node.id);
    const isLoading = loading.has(node.id);
    const isSelected = leaf && selectedId === node.id;
    const indicator = folder ? (isExpanded ? '▼' : '▶') : '　';
    const icon = leaf ? '📊' : '📁';
    return (
      <div key={node.id}>
        <div
          className={
            'model-picker__node' + (isSelected ? ' model-picker__node--selected' : '')
          }
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (folder) {
              void toggleFolder(node);
            } else if (leaf) {
              selectLeaf(node);
            }
          }}
          onDoubleClick={() => {
            if (leaf) {
              selectLeaf(node);
              // 双击叶子直接确认 — 用户体感
              setTimeout(confirm, 0);
            }
          }}
          data-testid={`model-picker-node-${node.id}`}
          data-leaf={leaf ? 'true' : 'false'}
        >
          <span className="model-picker__indicator">{indicator}</span>
          <span className="model-picker__icon">{isLoading ? '⏳' : icon}</span>
          <span className="model-picker__label">{node.alias || node.name}</span>
          {leaf && (
            <span className="model-picker__id" title={node.id}>
              {node.id.slice(0, 12)}…
            </span>
          )}
        </div>
        {folder && isExpanded && (
          <div className="model-picker__children">
            {(expanded.get(node.id) ?? []).length === 0 ? (
              <div
                className="model-picker__empty"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                (空)
              </div>
            ) : (
              (expanded.get(node.id) ?? []).map((c) => renderNode(c, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={'model-picker__overlay' + (className ? ` ${className}` : '')}
      style={style}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="model-picker-overlay"
    >
      <div
        className="model-picker__dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-testid="model-picker-dialog"
      >
        <h3 className="model-picker__title">选择数据模型</h3>
        {error && (
          <div className="model-picker__error" data-testid="model-picker-error">
            加载失败:{error}
          </div>
        )}
        <div className="model-picker__tree" data-testid="model-picker-tree">
          {rootNodes === null ? (
            <div className="model-picker__loading">加载中…</div>
          ) : rootNodes.length === 0 ? (
            <div className="model-picker__empty">目录为空</div>
          ) : (
            rootNodes.map((n) => renderNode(n, 0))
          )}
        </div>
        {selectedNode && (
          <div className="model-picker__selected" data-testid="model-picker-selected">
            已选:<strong>{selectedNode.alias || selectedNode.name}</strong>
            <span className="model-picker__selected-path">({selectedNode.aliasPath})</span>
          </div>
        )}
        <div className="model-picker__footer">
          <button
            type="button"
            className="model-picker__btn"
            onClick={onClose}
            data-testid="model-picker-cancel"
          >
            取消
          </button>
          <button
            type="button"
            className="model-picker__btn model-picker__btn--primary"
            onClick={confirm}
            disabled={!selectedNode}
            data-testid="model-picker-confirm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
