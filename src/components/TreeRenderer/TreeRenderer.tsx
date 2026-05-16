/**
 * TreeRenderer — 树状模式 UI(P5 Phase 2)
 *
 * 行方向:lazy load,每展开一个 parent path 起独立 query,缓存秒折叠
 * 列方向:多级列头客户端 expand/collapse(全量拉取列后客户端 hide)
 *   - 用 buildTreeColumnLevels 算 hidden / placeholder body cols
 *   - row tree 列 = column tree 列(每行渲染时按 hidden/placeholder 过滤)
 * 排序:列头点击 = onSortClick(fieldName, kind);触发 viewConfig.rowSorts 更新 →
 *      useTreeQueries 检测到 vcKey 变 → 清 cache + 重发 root + expanded → 服务端排序生效
 *
 * 不做(MVP):
 *   - 列宽 resize / 选区复制 / CSV — defer
 *   - subtotal:父 row 的数据用上层 branch 的对应 row 自然给出
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import {
  buildTreeColumnLevels,
  type TreeColumnLevelCell,
} from '../../core/cellSetParser/treeColumnItems.js';
import { buildTreeRows } from '../../core/tree/buildTreeRows.js';
import { formatErrorForDisplay } from '../../types/error.js';
import type { BranchEntry, TreePathKey } from '../../types/tree.js';
import type { Sort, ViewConfig } from '../../types/viewConfig.js';

export interface TreeRendererProps {
  branches: ReadonlyMap<TreePathKey, BranchEntry>;
  expanded: ReadonlySet<TreePathKey>;
  onToggle: (key: TreePathKey) => void;
  onRetry: (key: TreePathKey) => void;
  /** viewConfig.rows.length — 行树深度上限 */
  maxDepth: number;
  viewConfig: ViewConfig;
  /** 列头排序点击回调(同 PivotRenderer 接口) */
  onSortClick?: (
    fieldName: string,
    kind: 'ByMeasure' | 'ByDimension',
    options?: { multi?: boolean; mode?: 'global' | 'group' },
  ) => void;
  /** 行表头 corner alias 数组(每行 level 一个);仅取 [0] 给 corner 用 */
  rowFieldLabels?: string[];
  className?: string;
  style?: CSSProperties;
}

const NO_DATA_TEXT = '无数据';

function findActiveSort(rowSorts: Sort[], fieldName: string): Sort | undefined {
  return rowSorts.find((s) =>
    s.type === 'ByMeasure' ? s.measureName === fieldName : s.fieldName === fieldName,
  );
}

export function TreeRenderer({
  branches,
  expanded,
  onToggle,
  onRetry,
  maxDepth,
  viewConfig,
  onSortClick,
  rowFieldLabels,
  className,
  style,
}: TreeRendererProps): ReactNode {
  // P5 列方向 tree state — 折叠的列 cell key 集合(只在 TreeRenderer 本地)
  const [collapsedColKeys, setCollapsedColKeys] = useState<Set<string>>(() => new Set());
  const toggleColKey = (k: string) => {
    setCollapsedColKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const root = branches.get('root');
  const wrapperClass = className ? `pivot-renderer ${className}` : 'pivot-renderer';

  // 列头 + 树状列计算(必须 hooks 在条件返回前调用)
  const columnHeader = root?.status === 'success' ? root.columnHeader : [];
  const columnHeaderLevels = root?.status === 'success' ? root.columnHeaderLevels : undefined;
  const treeColResult = useMemo(() => {
    if (!columnHeaderLevels || columnHeaderLevels.length === 0) return null;
    return buildTreeColumnLevels(columnHeaderLevels, collapsedColKeys);
  }, [columnHeaderLevels, collapsedColKeys]);
  const hiddenBodyCols = treeColResult?.hiddenBodyCols ?? new Set<number>();

  // 早返回:加载中 / 错误 / root 未到
  if (!root) {
    return <div className={wrapperClass} style={style} data-state="loading" data-tree="true" />;
  }
  if (root.status === 'loading') {
    return (
      <div
        className={wrapperClass}
        style={style}
        data-state="loading"
        data-loading="true"
        data-tree="true"
      />
    );
  }
  if (root.status === 'error') {
    const displayed = formatErrorForDisplay(root.error);
    return (
      <div className={wrapperClass} style={style} data-state="error" data-tree="true">
        <div data-testid="pivot-error-banner" className="pivot-error">
          <span>
            {displayed.message}
            {displayed.hint && (
              <span className="pivot-error__hint"> — {displayed.hint}</span>
            )}
          </span>
          <button type="button" data-testid="pivot-retry" onClick={() => onRetry('root')}>
            重试
          </button>
        </div>
      </div>
    );
  }

  // success
  const items = buildTreeRows({ branches, expanded, maxDepth });
  if (root.rows.length === 0) {
    return (
      <div className={wrapperClass} style={style} data-state="no-data" data-tree="true">
        <div data-testid="pivot-no-data" className="pivot-no-data">
          {NO_DATA_TEXT}
        </div>
      </div>
    );
  }

  // 渲染用的多级列头序列:
  //   - 有 columnHeaderLevels(cross-table)→ 用 treeColResult.filteredLevels(支持折叠 + sort)
  //   - 没有 → fallback 单级,每个 columnHeader 一个 cell colSpan=1
  const renderedLevels: ReadonlyArray<ReadonlyArray<TreeColumnLevelCell>> =
    treeColResult?.filteredLevels ??
    [
      columnHeader.map((c, i) => ({
        fieldName: c.fieldName,
        label: c.alias,
        colSpan: 1,
        isMeasure: c.isMeasure,
        startCol: i,
        key: `c0:${i}`,
        isLeaf: true,
        collapsed: false,
        hasChildren: false,
      })),
    ];

  const indentPx = 16;
  const emptyText = viewConfig.pageState.emptyValueText;

  return (
    <div className={wrapperClass} style={style} data-state="ready" data-tree="true">
      <table className="pivot-grid pivot-grid--tree">
        <thead>
          {renderedLevels.map((levelCells, lvlIdx) => {
            const isLast = lvlIdx === renderedLevels.length - 1;
            return (
              <tr key={`hdr-${lvlIdx}`}>
                {/* Corner cell:仅第一行 level,rowSpan 跨所有 level 行 */}
                {lvlIdx === 0 && (
                  <th
                    className="pivot-corner"
                    rowSpan={renderedLevels.length}
                    data-testid="pivot-corner-tree"
                  >
                    {rowFieldLabels?.[0] ?? ''}
                  </th>
                )}
                {levelCells.map((cell, cellIdx) => {
                  const isCollapsedParent = !!cell.collapsed;
                  const showColToggle = cell.hasChildren && !cell.isLeaf;
                  // collapsed parent 用 rowSpan 占位下层
                  const rowSpan = isCollapsedParent
                    ? Math.max(1, renderedLevels.length - lvlIdx)
                    : undefined;
                  // 仅最深层非折叠 cell 可点排序
                  const sortable = isLast && !isCollapsedParent && !!onSortClick;
                  const sort = sortable
                    ? findActiveSort(viewConfig.rowSorts, cell.fieldName)
                    : undefined;
                  const sortKind: 'ByMeasure' | 'ByDimension' = cell.isMeasure
                    ? 'ByMeasure'
                    : 'ByDimension';
                  const sortIdx = sortable
                    ? viewConfig.rowSorts.findIndex(
                        (s) =>
                          (s.type === 'ByMeasure' && s.measureName === cell.fieldName) ||
                          (s.type === 'ByDimension' && s.fieldName === cell.fieldName),
                      )
                    : -1;
                  const showSortRank = sortable && sort && viewConfig.rowSorts.length > 1;
                  return (
                    <th
                      key={`hdr-${lvlIdx}-${cellIdx}-${cell.key}`}
                      colSpan={cell.colSpan}
                      rowSpan={rowSpan}
                      className="pivot-column-header"
                      data-testid={isLast ? `column-header-${cell.fieldName}` : undefined}
                      data-sortable={sortable ? 'true' : 'false'}
                      data-sort={sort?.direction}
                      data-collapsed={isCollapsedParent ? 'true' : undefined}
                      style={sortable ? { cursor: 'pointer' } : undefined}
                      title={
                        sortable
                          ? '点击切换分组内排序;Shift+点击 多列;Alt+点击 全局排序(ASC/DESC)'
                          : undefined
                      }
                      onClick={
                        sortable
                          ? (e) => {
                              // 折叠 toggle 不应触发排序(toggle 自己 stopPropagation)
                              // 树状结构默认分组排序(BASC/BDESC)以保持层级结构;Alt+切全局排序
                              onSortClick!(cell.fieldName, sortKind, {
                                multi: e.shiftKey,
                                mode: e.altKey ? 'global' : 'group',
                              });
                            }
                          : undefined
                      }
                    >
                      {showColToggle && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="pivot-tree-toggle pivot-tree-toggle--col"
                          data-testid={`col-tree-toggle-${cell.key}`}
                          aria-expanded={!isCollapsedParent}
                          title={isCollapsedParent ? '展开' : '折叠'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColKey(cell.key);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleColKey(cell.key);
                            }
                          }}
                        >
                          {isCollapsedParent ? '▶' : '▼'}
                        </span>
                      )}
                      {cell.label}
                      {sortable && sort?.direction === 'ASC' && (
                        <span aria-hidden="true"> ↑</span>
                      )}
                      {sortable && sort?.direction === 'DESC' && (
                        <span aria-hidden="true"> ↓</span>
                      )}
                      {sortable && sort?.direction === 'BASC' && (
                        <span aria-hidden="true" title="分组内升序">
                          {' ↑'}
                          <sub style={{ fontSize: 9 }}>组</sub>
                        </span>
                      )}
                      {sortable && sort?.direction === 'BDESC' && (
                        <span aria-hidden="true" title="分组内降序">
                          {' ↓'}
                          <sub style={{ fontSize: 9 }}>组</sub>
                        </span>
                      )}
                      {showSortRank && (
                        <sup className="pivot-sort-rank" aria-hidden="true">
                          {sortIdx + 1}
                        </sup>
                      )}
                    </th>
                  );
                })}
              </tr>
            );
          })}
        </thead>
        <tbody>
          {items.map((item, idx) => {
            if (item.kind === 'placeholder') {
              const indent = item.depth * indentPx + 8;
              const visibleColCount =
                columnHeader.length - hiddenBodyCols.size;
              return (
                <tr
                  key={`ph-${idx}-${item.pathKey}`}
                  className={`pivot-tree-row pivot-tree-row--placeholder pivot-tree-row--${item.state}`}
                  data-testid={`tree-placeholder-${item.pathKey}`}
                  data-state={item.state}
                >
                  <th
                    scope="row"
                    className="pivot-row-header pivot-row-header--placeholder"
                    style={{ paddingLeft: indent + 14 }}
                  >
                    {item.state === 'loading' ? (
                      <span className="pivot-tree-loading">加载中…</span>
                    ) : (
                      <span className="pivot-tree-error">
                        加载失败:{item.error?.message ?? '未知错误'}
                        <button
                          type="button"
                          className="pivot-tree-retry"
                          data-testid={`tree-retry-${item.pathKey}`}
                          onClick={() => onRetry(item.pathKey)}
                        >
                          重试
                        </button>
                      </span>
                    )}
                  </th>
                  {Array.from({ length: visibleColCount }).map((_, c) => (
                    <td
                      key={c}
                      className="pivot-cell pivot-cell--placeholder"
                      data-empty="true"
                    />
                  ))}
                </tr>
              );
            }
            const { row, hasChildren, expanded: isExpanded, pathKey: k, depth } = item;
            const indent = depth * indentPx + 8;
            return (
              <tr
                key={`tr-${idx}-${k}`}
                className="pivot-tree-row pivot-tree-row--leaf"
                data-tree-depth={depth}
                data-testid={`tree-row-${k}`}
              >
                <th
                  scope="row"
                  className="pivot-row-header"
                  style={{ paddingLeft: hasChildren ? indent : indent + 14 }}
                  data-testid={`tree-row-header-${k}`}
                >
                  {hasChildren && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="pivot-tree-toggle"
                      data-testid={`tree-toggle-${k}`}
                      aria-expanded={isExpanded}
                      title={isExpanded ? '折叠' : '展开'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(k);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggle(k);
                        }
                      }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                  <span className="pivot-row-label">{row.member.name}</span>
                </th>
                {row.cells.map((cell, c) => {
                  // 列树折叠 → 隐藏 body cell
                  if (hiddenBodyCols.has(c)) return null;
                  // placeholder col(collapsed parent 占位列)→ 渲染空 cell
                  if (treeColResult?.placeholderBodyCols.has(c)) {
                    return (
                      <td
                        key={c}
                        className="pivot-cell pivot-cell--col-placeholder"
                        data-empty="true"
                        data-col-placeholder="true"
                      />
                    );
                  }
                  const display = cell.isMasked
                    ? '***'
                    : cell.isEmpty && emptyText
                      ? emptyText
                      : cell.formattedValue;
                  return (
                    <td
                      key={c}
                      data-testid={`tree-cell-${k}-c${c}`}
                      className="pivot-cell"
                      data-empty={cell.isEmpty ? 'true' : undefined}
                      data-masked={cell.isMasked ? 'true' : undefined}
                    >
                      {display}
                    </td>
                  );
                })}
                {/* cells 长度短于 columnHeader → 补空(剔除 hidden) */}
                {row.cells.length < columnHeader.length &&
                  Array.from({ length: columnHeader.length - row.cells.length }).map(
                    (_, c) => {
                      const realIdx = row.cells.length + c;
                      if (hiddenBodyCols.has(realIdx)) return null;
                      return (
                        <td
                          key={`empty-${c}`}
                          className="pivot-cell"
                          data-empty="true"
                        />
                      );
                    },
                  )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
