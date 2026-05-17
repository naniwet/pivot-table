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
import {
  FolderIcon,
  FolderOpenIcon,
  ModelIcon,
  SpinnerIcon,
} from './ModelIcons.js';

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

  // 搜索 state — query 非空时 picker 切到 flat 结果列表(替代 tree 浏览)
  const [query, setQuery] = useState('');
  const [searchPaths, setSearchPaths] = useState<CatalogNode[][] | null>(null);
  const [searching, setSearching] = useState(false);

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

  // 搜索 — debounce 300ms 后调 API,query 空 / cleared 时回到 tree
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchPaths(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      let cancelled = false;
      client
        .searchCatalog(trimmed)
        .then((paths) => {
          if (!cancelled) {
            setSearchPaths(paths);
            setSearching(false);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setSearching(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => clearTimeout(handle);
  }, [client, query]);

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
    return (
      <div key={node.id} className="model-picker__row" data-depth={depth}>
        <div
          className={
            'model-picker__node' +
            (leaf ? ' model-picker__node--leaf' : ' model-picker__node--folder') +
            (isSelected ? ' model-picker__node--selected' : '')
          }
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
          title={leaf ? node.aliasPath : undefined}
        >
          <span
            className={
              'model-picker__chevron' +
              (folder ? ' model-picker__chevron--folder' : ' model-picker__chevron--leaf')
            }
            aria-hidden
          >
            {folder && (isExpanded ? '▼' : '▶')}
          </span>
          <span
            className={
              'model-picker__icon' +
              (leaf ? ' model-picker__icon--leaf' : ' model-picker__icon--folder')
            }
            aria-hidden
          >
            {isLoading ? (
              <SpinnerIcon />
            ) : leaf ? (
              <ModelIcon />
            ) : isExpanded ? (
              <FolderOpenIcon />
            ) : (
              <FolderIcon />
            )}
          </span>
          <span className="model-picker__label">{node.alias || node.name}</span>
        </div>
        {folder && isExpanded && (
          <div className="model-picker__children">
            {(expanded.get(node.id) ?? []).length === 0 ? (
              <div className="model-picker__empty model-picker__empty--inline">(空)</div>
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
        <div className="model-picker__search">
          <input
            type="search"
            className="model-picker__search-input"
            data-testid="model-picker-search"
            placeholder="搜索模型名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <span className="model-picker__search-spinner" aria-hidden>…</span>}
        </div>
        {error && (
          <div className="model-picker__error" data-testid="model-picker-error">
            加载失败:{error}
          </div>
        )}
        <div className="model-picker__tree" data-testid="model-picker-tree">
          {searchPaths !== null ? (
            // 搜索结果模式 — flat 列表(每条 path 取末尾 = hit;leaf 才可点)
            searchPaths.length === 0 ? (
              <div className="model-picker__empty">
                {searching ? '搜索中…' : `无匹配:"${query.trim()}"`}
              </div>
            ) : (
              searchPaths.map((path, i) => {
                const hit = path[path.length - 1];
                if (!hit) return null;
                return (
                  <SearchResultRow
                    key={`${hit.id}-${i}`}
                    node={hit}
                    selectedId={selectedId}
                    onPick={() => {
                      if (isCatalogLeaf(hit)) {
                        selectLeaf(hit);
                      }
                    }}
                    onDoubleClickPick={() => {
                      if (isCatalogLeaf(hit)) {
                        selectLeaf(hit);
                        setTimeout(confirm, 0);
                      }
                    }}
                  />
                );
              })
            )
          ) : rootNodes === null ? (
            <div className="model-picker__loading">加载中…</div>
          ) : rootNodes.length === 0 ? (
            <div className="model-picker__empty">目录为空</div>
          ) : (
            rootNodes.map((n) => renderNode(n, 0))
          )}
        </div>
        {selectedNode && (
          <div className="model-picker__selected" data-testid="model-picker-selected">
            <span>已选:</span>
            <strong>{selectedNode.alias || selectedNode.name}</strong>
            {selectedNode.aliasPath && selectedNode.aliasPath !==
              (selectedNode.alias || selectedNode.name) && (
              <span className="model-picker__selected-path">{selectedNode.aliasPath}</span>
            )}
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

/**
 * 搜索结果单行 — flat 显示 hit 节点(icon + 别名 + aliasPath secondary)
 *   - leaf 可选中 / 双击直接确认
 *   - folder 显示但不可点(指引用户去 tree 浏览)
 */
function SearchResultRow({
  node,
  selectedId,
  onPick,
  onDoubleClickPick,
}: {
  node: CatalogNode;
  selectedId: string | null;
  onPick: () => void;
  onDoubleClickPick: () => void;
}): React.ReactNode {
  const leaf = isCatalogLeaf(node);
  const isSelected = leaf && selectedId === node.id;
  return (
    <div
      className={
        'model-picker__node' +
        (leaf ? ' model-picker__node--leaf' : ' model-picker__node--folder') +
        (isSelected ? ' model-picker__node--selected' : '') +
        (!leaf ? ' model-picker__node--disabled' : '')
      }
      onClick={leaf ? onPick : undefined}
      onDoubleClick={leaf ? onDoubleClickPick : undefined}
      data-testid={`model-picker-search-row-${node.id}`}
      data-leaf={leaf ? 'true' : 'false'}
      title={node.aliasPath || node.alias || node.name}
    >
      <span className="model-picker__chevron model-picker__chevron--leaf" aria-hidden />
      <span
        className={
          'model-picker__icon' +
          (leaf ? ' model-picker__icon--leaf' : ' model-picker__icon--folder')
        }
        aria-hidden
      >
        {leaf ? <ModelIcon /> : <FolderIcon />}
      </span>
      <span className="model-picker__search-row-text">
        <span className="model-picker__label">{node.alias || node.name}</span>
        {node.aliasPath && (
          <span className="model-picker__search-row-path">{node.aliasPath}</span>
        )}
      </span>
    </div>
  );
}

