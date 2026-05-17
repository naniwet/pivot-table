/**
 * DetailRenderer — 即席查询(明细)模式 UI(P5+)
 *
 * 跟 PivotRenderer 的差异:
 *   - 列头一级(无多级合并)
 *   - 行头无 drill / rowSpan / 缩进
 *   - 无总计行 / 小计行
 *   - 列宽 resize 复用
 *   - 列头点击切排序(只 ASC/DESC,Shift+点击 多列)
 *   - emptyValueText 仍生效
 *
 * cellSet 解析复用 parseCellSet 给的 RenderModel — adhoc query 返回的 cellSet 也走同一个 schema,
 * RenderModel.rowHeader[].fullPath 长度 = row 字段数,matrix[r][c] 是数据。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { clampColumnWidth } from '../../core/columnResize/clampColumnWidth.js';
import { computeAdhocStats } from '../../core/conditionalFormat/computeAdhocStats.js';
import {
  computeRowScopeStyles,
  evaluateDataBar,
  evaluateThreshold,
  evaluateTopBottom,
  getRuleScope,
  hasRulesFor,
} from '../../core/conditionalFormat/evaluateRule.js';
import { formatErrorForDisplay } from '../../types/error.js';
import type { RenderModel } from '../../types/renderModel.js';
import {
  filterConditionalFormatsByMode,
  type Sort,
  type ViewConfig,
} from '../../types/viewConfig.js';

export interface DetailRendererProps {
  renderModel: RenderModel | null;
  viewConfig: ViewConfig;
  loading?: boolean;
  error?: Error | null;
  /** 列头点击排序 — adhoc 模式只走 ByDimension + ASC/DESC */
  onSortClick: (
    fieldName: string,
    options?: { multi?: boolean },
  ) => void;
  onRetry?: () => void;
  /** 行表头各列对应字段 alias(用做列头标签);跟 viewConfig.rows 对应 */
  rowFieldLabels?: string[];
  freezeHeader?: boolean;
  /**
   * P5+ 列头右键菜单回调 — 不传则走浏览器原生右键菜单。
   * 传了 → 列头 onContextMenu 触发,宿主负责弹 ContextMenu(常含:排序、按值过滤、复制列名)
   */
  onColumnContextMenu?: (info: { fieldName: string; x: number; y: number }) => void;
  /**
   * P5+ 条件格式化 — 哪些列是数值列(白名单 fieldName 集合)。
   * 仅这些列会跑 evaluator 着色 / 画 dataBar。父组件按 metadata.valueType 计算后传入。
   * 不传 → 所有列都不参与条件格式化(等同空 Set)。
   */
  numericFieldNames?: ReadonlySet<string>;
  className?: string;
  style?: CSSProperties;
}

const EMPTY_PROMPT = '把字段拖到行区,即席查询会把这些字段直接落 SQL 查询';
const NO_DATA_TEXT = '无数据';
const EMPTY_ROW_HEADERS: RenderModel['rowHeader'] = [];

function findActiveSort(rowSorts: Sort[], fieldName: string): Sort | undefined {
  return rowSorts.find((s) => s.type === 'ByDimension' && s.fieldName === fieldName);
}

export function DetailRenderer({
  renderModel,
  viewConfig,
  loading = false,
  error = null,
  onSortClick,
  onRetry,
  rowFieldLabels,
  freezeHeader = true,
  onColumnContextMenu,
  numericFieldNames,
  className,
  style,
}: DetailRendererProps): ReactNode {
  // 列宽 state(复用 PivotRenderer 经验)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = clampColumnWidth(r.startWidth + (e.clientX - r.startX));
      setColumnWidths((prev) => (prev[r.key] === next ? prev : { ...prev, [r.key]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);
  const startResize = (key: string, startX: number, startWidth: number) => {
    resizeRef.current = { key, startX, startWidth };
  };

  const wrapperClass = className ? `pivot-renderer ${className}` : 'pivot-renderer';

  const rowHeaders = renderModel?.rowHeader ?? EMPTY_ROW_HEADERS;
  const emptyText = viewConfig.pageState.emptyValueText;

  // adhoc 行结构:每行 fullPath.length 个 row header cell + 数据 cells(一般无 — adhoc cellSet
  // 把所有字段都扁平在 rowHeader 里,matrix 通常是空 / 只含 columnMetadata 信息)
  // 这里把 rowHeader.fullPath 做"所有列",matrix 不渲染(保留给将来扩展)
  const rowHeaderLevels = Math.max(1, rowHeaders[0]?.fullPath.length ?? 1);

  // P5+ 条件格式化:adhoc mode 的规则在 DetailRenderer 内消费
  // 仅当传入 numericFieldNames(白名单)+ 有 adhoc 规则时才跑 evaluator,否则零开销
  const condFormats = filterConditionalFormatsByMode(
    viewConfig.pageState.conditionalFormats ?? [],
    'adhoc',
  );
  const numericCols = numericFieldNames ?? new Set<string>();
  const columnFieldNames = useMemo(
    () =>
      Array.from(
        { length: rowHeaderLevels },
        (_, i) => viewConfig.rows[i]?.fieldName ?? '',
      ),
    [viewConfig.rows, rowHeaderLevels],
  );
  const adhocStats = useMemo(() => {
    if (condFormats.length === 0 || numericCols.size === 0) return null;
    return computeAdhocStats({
      rows: rowHeaders,
      columnFieldNames,
      numericFieldNames: numericCols,
      rules: condFormats,
    });
  }, [rowHeaders, columnFieldNames, numericCols, condFormats]);

  // P5+ row-scope styles:命中 → 整行所有 cell 套样式(包括非数值列 / 字符串列)
  const rowScopeStyles = useMemo(() => {
    if (condFormats.length === 0 || numericCols.size === 0 || !adhocStats) return null;
    const cellValueAt = (r: number, measure: string): number | null => {
      if (!numericCols.has(measure)) return null;
      const c = columnFieldNames.indexOf(measure);
      if (c < 0) return null;
      const raw = rowHeaders[r]?.fullPath[c];
      if (raw === '' || raw == null) return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    return computeRowScopeStyles(
      condFormats,
      rowHeaders.length,
      cellValueAt,
      adhocStats.cutoffsByRuleId,
    );
  }, [rowHeaders, columnFieldNames, numericCols, condFormats, adhocStats]);

  if (error) {
    const displayed = formatErrorForDisplay(error);
    return (
      <div className={wrapperClass} style={style} data-state="error" data-mode="adhoc">
        <div data-testid="pivot-error-banner" className="pivot-error">
          <span>
            {displayed.message}
            {displayed.hint && (
              <span className="pivot-error__hint"> — {displayed.hint}</span>
            )}
          </span>
          {onRetry && (
            <button type="button" data-testid="pivot-retry" onClick={onRetry}>
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  if (viewConfig.rows.length === 0) {
    return (
      <div className={wrapperClass} style={style} data-state="empty-prompt" data-mode="adhoc">
        <div data-testid="pivot-empty-prompt" className="pivot-empty-prompt">
          {EMPTY_PROMPT}
        </div>
      </div>
    );
  }

  const isEmptyResult =
    renderModel === null ||
    (rowHeaders.length === 0 && renderModel.matrix.length === 0);
  if (isEmptyResult) {
    return (
      <div
        className={wrapperClass}
        style={style}
        data-loading={loading ? 'true' : undefined}
        data-state={loading ? 'loading' : 'no-data'}
        data-mode="adhoc"
      >
        {!loading && (
          <div data-testid="pivot-no-data" className="pivot-no-data">
            {NO_DATA_TEXT}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={wrapperClass}
      style={style}
      data-loading={loading ? 'true' : undefined}
      data-state="ready"
      data-mode="adhoc"
    >
      <table className="pivot-grid pivot-grid--adhoc">
        <thead data-frozen-header={freezeHeader ? 'true' : 'false'}>
          <tr>
            {Array.from({ length: rowHeaderLevels }).map((_, i) => {
              const label = rowFieldLabels?.[i] ?? `字段 ${i + 1}`;
              // adhoc fieldName 用 viewConfig.rows[i].fieldName(展开 hierarchy 时不一定一一对应,
              // 但 sort 用 fieldName 即可 — backend 同名匹配)
              const fieldName = viewConfig.rows[i]?.fieldName ?? label;
              const sort = findActiveSort(viewConfig.rowSorts, fieldName);
              const sortIdx = viewConfig.rowSorts.findIndex(
                (s) => s.type === 'ByDimension' && s.fieldName === fieldName,
              );
              const showSortRank =
                sort && viewConfig.rowSorts.filter((s) => s.type === 'ByDimension').length > 1;
              const customWidth = columnWidths[fieldName];
              const thStyle: CSSProperties = { cursor: 'pointer' };
              if (customWidth !== undefined) thStyle.width = `${customWidth}px`;
              return (
                <th
                  key={`adhoc-hdr-${i}-${fieldName}`}
                  className="pivot-column-header"
                  data-testid={`column-header-${fieldName}`}
                  data-sortable="true"
                  data-sort={sort?.direction}
                  style={thStyle}
                  title={
                    onColumnContextMenu
                      ? '点击切换排序;Shift+点击 多列排序;右键菜单更多操作'
                      : '点击切换排序方向(ASC↔DESC);Shift+点击 多列排序'
                  }
                  onClick={(e) =>
                    onSortClick(fieldName, { multi: e.shiftKey })
                  }
                  onContextMenu={(e) => {
                    if (!onColumnContextMenu) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onColumnContextMenu({ fieldName, x: e.clientX, y: e.clientY });
                  }}
                >
                  {label}
                  {sort?.direction === 'ASC' && <span aria-hidden="true"> ↑</span>}
                  {sort?.direction === 'DESC' && <span aria-hidden="true"> ↓</span>}
                  {showSortRank && (
                    <sup className="pivot-sort-rank" aria-hidden="true">
                      {sortIdx + 1}
                    </sup>
                  )}
                  <span
                    className="pivot-col-resize"
                    aria-label="拖拽调整列宽"
                    role="separator"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const th = (e.currentTarget as HTMLElement).parentElement;
                      const startWidth =
                        customWidth ??
                        (th instanceof HTMLElement ? th.getBoundingClientRect().width : 100);
                      startResize(fieldName, e.clientX, startWidth);
                    }}
                    /* BUG fix:浏览器在 mousedown→mouseup 在同元素时 dispatch click 事件,
                       即使 mousedown 已 stopPropagation,click 仍单独 bubble 到 <th> 触发排序。
                       这里独立 stop 一下 click。 */
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rowHeaders.map((rn, r) => (
            <tr key={`adhoc-row-${r}`} data-testid={`adhoc-row-${r}`}>
              {Array.from({ length: rowHeaderLevels }).map((_, c) => {
                const value = rn.fullPath[c] ?? '';
                const isEmpty = value === '' || value == null;
                const display = isEmpty && emptyText ? emptyText : value;

                // P5+ 条件格式化
                let cellInlineStyle: CSSProperties | undefined;
                let dataBarNode: ReactNode = null;
                const fieldName = columnFieldNames[c];

                // 1. row-scope:整行命中 → 所有 cell 默认套样式(连非数值列也套)
                const rowScopeStyle = rowScopeStyles?.get(r);
                if (rowScopeStyle) {
                  cellInlineStyle = {
                    ...(rowScopeStyle.bg ? { backgroundColor: rowScopeStyle.bg } : {}),
                    ...(rowScopeStyle.fg ? { color: rowScopeStyle.fg } : {}),
                    ...(rowScopeStyle.bold ? { fontWeight: 600 } : {}),
                  };
                }

                // 2. cell-scope:数值列 + 命中 → 覆盖 row-scope(更具体优先)
                if (
                  fieldName &&
                  !isEmpty &&
                  adhocStats &&
                  numericCols.has(fieldName) &&
                  condFormats.length > 0 &&
                  hasRulesFor(condFormats, fieldName)
                ) {
                  const num = typeof value === 'number' ? value : Number(value);
                  if (Number.isFinite(num)) {
                    // 只跑 scope='cell' 的规则(否则 row-scope 会被错当 cell-scope 重复套样式)
                    const cellRules = condFormats.filter((rl) => getRuleScope(rl) === 'cell');
                    let resolvedStyle = evaluateThreshold(cellRules, fieldName, num);
                    if (
                      !resolvedStyle.bg &&
                      !resolvedStyle.fg &&
                      !resolvedStyle.bold
                    ) {
                      resolvedStyle = evaluateTopBottom(
                        cellRules,
                        fieldName,
                        num,
                        adhocStats.cutoffsByRuleId,
                      );
                    }
                    if (resolvedStyle.bg || resolvedStyle.fg || resolvedStyle.bold) {
                      cellInlineStyle = {
                        ...(resolvedStyle.bg
                          ? { backgroundColor: resolvedStyle.bg }
                          : {}),
                        ...(resolvedStyle.fg ? { color: resolvedStyle.fg } : {}),
                        ...(resolvedStyle.bold ? { fontWeight: 600 } : {}),
                      };
                    }
                    // dataBar 跟 scope 无关,任何时候独立画(对数值列)
                    const bar = evaluateDataBar(
                      condFormats,
                      fieldName,
                      num,
                      adhocStats.colRanges.get(fieldName) ?? null,
                    );
                    if (bar) {
                      dataBarNode = (
                        <span
                          className="pivot-cell-data-bar"
                          aria-hidden
                          data-testid={`databar-r${r}-c${c}`}
                          style={{
                            width: `${bar.percent * 100}%`,
                            backgroundColor: bar.color,
                          }}
                        />
                      );
                    }
                  }
                }

                return (
                  <td
                    key={c}
                    data-testid={`adhoc-cell-r${r}-c${c}`}
                    className={
                      dataBarNode ? 'pivot-cell pivot-cell--has-databar' : 'pivot-cell'
                    }
                    data-empty={isEmpty ? 'true' : undefined}
                    style={cellInlineStyle}
                  >
                    {dataBarNode}
                    <span className="pivot-cell-text">{display}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
