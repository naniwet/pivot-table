/**
 * PivotRenderer — RenderModel → 表格 DOM
 *
 * P0 范围：
 *   - 三态：空（未拖字段）/ 无数据（query 返回空）/ 错误（带 retry）
 *   - 列头：alias 显示 + 当前排序方向（data-sort 属性）+ 点击切换
 *   - 行头：depth 缩进（data-depth）+ drill ▶/▼（仅 expandable 行）
 *   - 数据区：formattedValue + EMPTY_CELL 与 masked 的特殊渲染
 *   - 总计：tfoot 单独一行
 *   - hover：title 属性带"完整路径 — 度量: 值"
 *
 * P0 不做（注释里说明，便于将来加）：
 *   - 单元格高亮交互（仅靠 data-row-highlighted CSS 覆盖即可）
 *   - i18n（"总计" / "无数据" 等中文 P0 写死）
 *   - CellWrapper 抽象（条件格式 P4+ 再加）
 *   - 虚拟滚动（默认 50×50 = 2500 cells，原生 DOM 够用）
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

import { clampColumnWidth } from '../../core/columnResize/clampColumnWidth.js';
import { buildRowHeaderSpans } from '../../core/cellSetParser/rowHeaderSpans.js';
import { computeColRanges } from '../../core/conditionalFormat/computeColRanges.js';
import { computeTopBottomCutoffs } from '../../core/conditionalFormat/computeTopBottomCutoffs.js';
import {
  evaluateDataBar,
  evaluateThreshold,
  evaluateTopBottom,
  getRuleScope,
  hasRulesFor,
  type CellFormatStyle,
} from '../../core/conditionalFormat/evaluateRule.js';
import {
  buildTreeColumnLevels,
  type TreeColumnLevelCell,
} from '../../core/cellSetParser/treeColumnItems.js';
import {
  buildTreeRowItems,
  type TreeRowItem,
} from '../../core/cellSetParser/treeRowItems.js';
import {
  extractSelectionTsv,
  type CellSelection,
} from '../../core/export/extractSelectionTsv.js';
import { formatErrorForDisplay } from '../../types/error.js';
import type { RenderModel, RowHeaderNode } from '../../types/renderModel.js';
import {
  filterConditionalFormatsByMode,
  type Sort,
  type ViewConfig,
} from '../../types/viewConfig.js';

export interface PivotRendererProps {
  renderModel: RenderModel | null;
  viewConfig: ViewConfig;
  loading?: boolean;
  error?: Error | null;
  onSortClick: (
    fieldName: string,
    kind: 'ByMeasure' | 'ByDimension',
    options?: { multi?: boolean; mode?: 'global' | 'group' },
  ) => void;
  /**
   * Drill down on a hierarchy axis (drillDepth + 1)。每个 row 的 ▶ 都触发同一 hierarchy 的 drill down
   * （drill 是"轴深度"概念，不是"per-row 展开"——见 [docs/adr-004-hierarchy-drill.md](../../../docs/adr-004-hierarchy-drill.md) C2）
   */
  onDrillDown: (hierarchyFieldName: string) => void;
  /** Drill up on a hierarchy axis (drillDepth - 1) */
  onDrillUp: (hierarchyFieldName: string) => void;
  onRetry?: () => void;
  /** P1.0: 单元格点击回调（宿主联动） */
  onCellClick?: (info: { rowIndex: number; colIndex: number; rowPath: string[]; columnFieldName: string; value: unknown }) => void;
  /**
   * P1.5: 单元格右键回调（宿主自定义菜单 / 复制 / 钻取等）
   * - 传了：组件 preventDefault 后调宿主，**不再自动 TSV copy**
   * - 不传：保留默认 — 右键自动复制 TSV 到剪贴板
   */
  onCellRightClick?: (info: {
    rowIndex: number;
    colIndex: number;
    rowPath: string[];
    columnFieldName: string;
    value: unknown;
    formattedValue: string;
    x: number;
    y: number;
  }) => void;
  /**
   * 行表头 corner 显示的字段 alias 数组(每 level 一个,顺序 = rowHeader.fullPath)。
   * 不传或 length=0 → corner 留空(老行为)。由宿主(PivotTable)用 viewConfig.rows + metadata 计算后传入。
   */
  rowFieldLabels?: string[];
  /**
   * P1.5 列头冻结（thead sticky-top）— 默认 true。
   * 关掉时滚动会让表头滚走（极少场景，例如想打印纸面）
   */
  freezeHeader?: boolean;
  /**
   * P1.5 行头列冻结（tbody th 行头列 sticky-left）— 默认 true
   * 关掉时横向滚动会让行头滚走
   */
  freezeRowHeader?: boolean;
  /**
   * P5+ 表头右键菜单回调(union event)— 不传则用浏览器原生右键菜单。
   * 4 种触发位置:
   *   - 'corner'      左上角 row-dim 字段名 cell(对 dim 排序)
   *   - 'col-member'  列头维度成员 cell(对值 In/NotIn 过滤)
   *   - 'col-measure' 列头度量 cell(对该度量列排序)
   *   - 'row-member'  行头成员 cell(对值 In/NotIn 过滤)
   */
  onHeaderContextMenu?: (
    ev:
      | { type: 'corner'; fieldName: string; x: number; y: number }
      | { type: 'col-member'; fieldName: string; memberName: string; x: number; y: number }
      | { type: 'col-measure'; measureName: string; x: number; y: number }
      | { type: 'row-member'; fieldName: string; memberName: string; x: number; y: number },
  ) => void;
  /**
   * P5+ 滚动加载触发回调 — 不传 = 不启用(纯页码模式或无累积概念)。
   * 传了 → 表格底部渲染 sentinel,IntersectionObserver 监听到 sentinel 进入视口时调本回调。
   * hook 自身负责防抖 / 不重复触发。
   */
  onLoadMore?: () => void;
  /** P5+ 是否还有更多数据可加载;false 时底部渲染"已全部加载"提示 */
  hasMore?: boolean;
  /** P5+ 累积加载中(已有数据,正在 fetch 下一页);true 时 sentinel 显示"加载中…" */
  loadingMore?: boolean;
  className?: string;
  style?: CSSProperties;
}

const EMPTY_PROMPT = '从左侧字段树拖拽字段到行/值开始';
const NO_DATA_TEXT = '无数据';
const GRAND_TOTAL_LABEL = '总计';

function findActiveSort(rowSorts: Sort[], fieldName: string): Sort | undefined {
  return rowSorts.find((s) =>
    s.type === 'ByMeasure'
      ? s.measureName === fieldName
      : s.fieldName === fieldName,
  );
}

function tooltipFor(rowNode: RowHeaderNode, measureAlias: string, value: string): string {
  return `${rowNode.fullPath.join(' / ')} — ${measureAlias}: ${value}`;
}

/**
 * P3+ 树状行表头渲染 — buildTreeRowItems 给出 parent/leaf 序列,渲染:
 *   - parent 行:行头单 cell colSpan=rowHeaderLevels,带 ▶/▼ 切换;数据 cells 留空
 *   - leaf 行:正常数据 cells;行头单 cell colSpan=rowHeaderLevels,padding-left = depth*16
 *
 * 跟 merge 模式同 tbody,但渲染逻辑彻底不同 — 隔离成独立 helper(Unix 哲学)。
 */
function renderTreeRows(opts: {
  rowHeader: RenderModel['rowHeader'];
  matrix: RenderModel['matrix'];
  columnHeader: RenderModel['columnHeader'];
  rowHeaderLevels: number;
  collapsedRowPrefixes: ReadonlySet<string>;
  toggleRowPrefix: (key: string) => void;
  emptyValueText: string | undefined;
  freezeRowHeader: boolean;
  hiddenBodyCols: ReadonlySet<number>;
  placeholderBodyCols: ReadonlyMap<number, string>;
  onCellClick:
    | ((info: {
        rowIndex: number;
        colIndex: number;
        rowPath: string[];
        columnFieldName: string;
        value: unknown;
      }) => void)
    | undefined;
  onCellRightClick:
    | ((info: {
        rowIndex: number;
        colIndex: number;
        rowPath: string[];
        columnFieldName: string;
        value: unknown;
        formattedValue: string;
        x: number;
        y: number;
      }) => void)
    | undefined;
}): ReactNode {
  const {
    rowHeader,
    matrix,
    columnHeader,
    rowHeaderLevels,
    collapsedRowPrefixes,
    toggleRowPrefix,
    emptyValueText,
    freezeRowHeader,
    hiddenBodyCols,
    placeholderBodyCols,
    onCellClick,
    onCellRightClick,
  } = opts;
  const items: TreeRowItem[] = buildTreeRowItems(rowHeader, collapsedRowPrefixes);
  const dataColCount = columnHeader.length;

  return items.map((item, idx) => {
    if (item.kind === 'parent') {
      const indent = item.depth * 16;
      return (
        <tr
          key={`tree-parent-${idx}-${item.key}`}
          className="pivot-tree-row pivot-tree-row--parent"
          data-tree-depth={item.depth}
        >
          <th
            scope="row"
            colSpan={rowHeaderLevels}
            className="pivot-row-header pivot-row-header--parent"
            data-frozen-row-header={freezeRowHeader ? 'true' : 'false'}
            data-collapsed={item.collapsed ? 'true' : 'false'}
            style={{ paddingLeft: 8 + indent }}
            data-testid={`tree-row-parent-${item.key}`}
          >
            <span
              role="button"
              tabIndex={0}
              className="pivot-tree-toggle"
              data-testid={`tree-toggle-${item.key}`}
              aria-expanded={!item.collapsed}
              title={item.collapsed ? '展开' : '折叠'}
              onClick={(e) => {
                e.stopPropagation();
                toggleRowPrefix(item.key);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleRowPrefix(item.key);
                }
              }}
            >
              {item.collapsed ? '▶' : '▼'}
            </span>
            <span className="pivot-row-label">{item.label}</span>
          </th>
          {Array.from({ length: dataColCount }).map((_, c) => {
            if (hiddenBodyCols.has(c)) return null;
            return (
              <td
                key={c}
                className="pivot-cell pivot-cell--parent"
                data-empty="true"
                data-col-placeholder={placeholderBodyCols.has(c) ? 'true' : undefined}
              />
            );
          })}
        </tr>
      );
    }
    // leaf
    const r = item.rowIndex;
    const rowNode = rowHeader[r]!;
    const indent = item.depth * 16;
    return (
      <tr
        key={`tree-leaf-${r}-${item.key}`}
        className="pivot-tree-row pivot-tree-row--leaf"
        data-tree-depth={item.depth}
        data-testid={`row-${r}`}
      >
        <th
          scope="row"
          colSpan={rowHeaderLevels}
          className="pivot-row-header pivot-row-header--leaf"
          data-frozen-row-header={freezeRowHeader ? 'true' : 'false'}
          style={{ paddingLeft: 8 + indent + 14 /* 让 leaf 跟 parent 的 toggle 对齐 */ }}
          data-testid={`row-header-${rowNode.member.name}`}
        >
          <span className="pivot-row-label">{item.label}</span>
        </th>
        {matrix[r]!.map((cell, c) => {
          if (hiddenBodyCols.has(c)) return null;
          if (placeholderBodyCols.has(c)) {
            return (
              <td
                key={c}
                className="pivot-cell pivot-cell--col-placeholder"
                data-empty="true"
              />
            );
          }
          const colHeader = columnHeader[c];
          const display = cell.isMasked
            ? '***'
            : cell.isEmpty && emptyValueText
              ? emptyValueText
              : cell.formattedValue;
          const dataAttrs: Record<string, string> = {};
          if (cell.isMasked) dataAttrs['data-masked'] = 'true';
          if (cell.isEmpty) dataAttrs['data-empty'] = 'true';
          return (
            <td
              key={c}
              data-testid={`cell-r${r}-c${c}`}
              className="pivot-cell"
              {...dataAttrs}
              onClick={
                onCellClick
                  ? () =>
                      onCellClick({
                        rowIndex: r,
                        colIndex: c,
                        rowPath: rowNode.fullPath,
                        columnFieldName: colHeader?.fieldName ?? '',
                        value: cell.value,
                      })
                  : undefined
              }
              onContextMenu={(e) => {
                e.preventDefault();
                if (onCellRightClick) {
                  onCellRightClick({
                    rowIndex: r,
                    colIndex: c,
                    rowPath: rowNode.fullPath,
                    columnFieldName: colHeader?.fieldName ?? '',
                    value: cell.value,
                    formattedValue: cell.formattedValue,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }
              }}
            >
              {display}
            </td>
          );
        })}
      </tr>
    );
  });
}

export function PivotRenderer({
  renderModel,
  viewConfig,
  loading = false,
  error = null,
  onSortClick,
  onDrillDown,
  onDrillUp,
  onRetry,
  onCellClick,
  onCellRightClick,
  rowFieldLabels,
  freezeHeader = true,
  freezeRowHeader = true,
  onHeaderContextMenu,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  className,
  style,
}: PivotRendererProps): ReactNode {
  // 选区 state：null 表示无选区
  const [selection, setSelection] = useState<CellSelection | null>(null);
  // 拖动中标记：mousedown 后 true，mouseup 后 false
  const draggingRef = useRef(false);
  const renderModelRef = useRef<RenderModel | null>(null);

  // 列宽 state（P1.5）：按 fieldName 索引；不在则用 CSS 默认（auto）
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  // P5+ 条件格式化:rules + 列实际 min/max(给 dataBar range='auto' 用)
  // PivotRenderer 只消费 mode='pivot' 的规则(包括旧序列化 undefined,视为 pivot)
  const condFormats = filterConditionalFormatsByMode(
    viewConfig.pageState.conditionalFormats ?? [],
    'pivot',
  );
  const colRanges = useMemo(
    () => (renderModel && condFormats.length > 0 ? computeColRanges(renderModel) : null),
    [renderModel, condFormats.length],
  );
  // P5+ topN/bottomN cutoffs(per-rule),按当前页排名;无 topN/bottomN 规则时早退为 null
  const topBottomCutoffs = useMemo(
    () =>
      renderModel && condFormats.length > 0
        ? computeTopBottomCutoffs(renderModel, condFormats)
        : null,
    [renderModel, condFormats],
  );
  // P5+ row-scope hits — 透视模式"十字飘色"语义:
  //   命中 cell 的 (r,c) 本身 + 该 cell 的行表头(r) + 列表头路径(c 所在的每层 th)
  //   而不是"整行所有 cell" — 后者在多 measure 列场景下会让无关 measure 也飘色,不直观
  //   adhoc 模式仍走"整行所有 cell"(DetailRenderer 单独路径,无列头树),不动
  //
  // 数据结构:
  //   cells: Map<"r,c", style> — 哪些具体 cell 命中
  //   rows:  Map<r,    style> — 行头(任一 cell 命中即整行 row header 飘色)
  //   cols:  Map<c,    style> — 列头(任一 cell 命中即整列 column header 路径飘色)
  //
  // first-wins(同 cell 多 row-scope rule 命中,数组顺序第一条赢)
  const rowScopeHits = useMemo(() => {
    if (!renderModel || condFormats.length === 0) return null;
    const rowScopeRules = condFormats.filter((r) => getRuleScope(r) === 'row');
    if (rowScopeRules.length === 0) return null;
    const cells = new Map<string, CellFormatStyle>();
    const rows = new Map<number, CellFormatStyle>();
    const cols = new Map<number, CellFormatStyle>();
    const cutoffs = topBottomCutoffs ?? new Map();
    for (let r = 0; r < renderModel.matrix.length; r++) {
      const row = renderModel.matrix[r]!;
      for (let c = 0; c < renderModel.columnHeader.length; c++) {
        const cell = row[c];
        if (!cell || cell.isEmpty || cell.isMasked) continue;
        const v = cell.value;
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const cellMeasure = renderModel.columnHeader[c]?.fieldName;
        if (!cellMeasure) continue;
        for (const rule of rowScopeRules) {
          if (rule.measure !== cellMeasure) continue;
          // 复用 evaluateThreshold / evaluateTopBottom(传单 rule 数组即可)
          const single = [rule];
          let style: CellFormatStyle = {};
          if (rule.kind === 'threshold') {
            style = evaluateThreshold(single, cellMeasure, v);
          } else if (rule.kind === 'topN' || rule.kind === 'bottomN') {
            style = evaluateTopBottom(single, cellMeasure, v, cutoffs);
          }
          if (style.bg || style.fg || style.bold) {
            cells.set(`${r},${c}`, style);
            if (!rows.has(r)) rows.set(r, style);
            if (!cols.has(c)) cols.set(c, style);
            break; // 该 cell first-wins
          }
        }
      }
    }
    return { cells, rows, cols };
  }, [renderModel, condFormats, topBottomCutoffs]);

  // 给列头渲染算 (level, cellIdx) → 数据列覆盖范围 [start, end),
  // 用来判定该 th 是否覆盖任一 rowScopeHits.cols 命中的列 → 飘色
  const headerCellRanges = useMemo(() => {
    if (!renderModel) return null;
    const levels =
      renderModel.columnHeaderLevels ??
      [
        renderModel.columnHeader.map((c) => ({
          fieldName: c.fieldName,
          label: c.alias,
          colSpan: 1,
          isMeasure: c.isMeasure,
        })),
      ];
    return levels.map((levelCells) => {
      let start = 0;
      return levelCells.map((cell) => {
        const range = { start, end: start + cell.colSpan };
        start += cell.colSpan;
        return range;
      });
    });
  }, [renderModel]);
  // P3+ 多列行头冻结(P5+ 修复:之前只有 col 0 sticky,多 dim 时其他列滚走)
  // 测量每个 row header 列的 offsetWidth → 算累积 left → 内联到 th style
  const tableRef = useRef<HTMLTableElement>(null);
  const [rowHeaderLefts, setRowHeaderLefts] = useState<number[]>([]);
  // P3+ 树状行表头折叠状态(prefix key 集合,见 buildTreeRowItems)
  const [collapsedRowPrefixes, setCollapsedRowPrefixes] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleRowPrefix = (key: string) => {
    setCollapsedRowPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // P3+ 树状列表头折叠状态(cell key = c<level>:<startCol>)
  const [collapsedColPrefixes, setCollapsedColPrefixes] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleColPrefix = (key: string) => {
    setCollapsedColPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // 列宽拖动中状态（null 表示未拖动）
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // 列宽拖动 mousemove / mouseup 全局监听
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

  // P5+ 测量行表头列宽 → 算累积 left,给多列 row header 提供 sticky-left offset
  // 触发:tableRef 就位 + renderModel/columnWidths/freezeRowHeader 变 → measure 一次
  // ResizeObserver 兜底 window resize 等情况
  useEffect(() => {
    if (!freezeRowHeader) {
      if (rowHeaderLefts.length > 0) setRowHeaderLefts([]);
      return;
    }
    const tbl = tableRef.current;
    if (!tbl) return;
    const measure = () => {
      // 找第一个含完整 row header 列的 tr(merge mode 是任一 leaf tr;tree mode parent 单 cell 不算)
      const rows = Array.from(tbl.querySelectorAll('tbody > tr'));
      let widths: number[] | null = null;
      for (const tr of rows) {
        const ths = Array.from(
          (tr as HTMLElement).querySelectorAll('th.pivot-row-header[data-row-header-col]'),
        ) as HTMLElement[];
        if (ths.length === 0) continue;
        // 收集 lvlIdx → width(rowSpan 合并的 col 取实际宽度,空缺位置按之前一行的)
        const w: number[] = [];
        for (const th of ths) {
          const idx = Number(th.dataset.rowHeaderCol);
          if (Number.isFinite(idx)) w[idx] = th.offsetWidth;
        }
        // 第一行就拿到所有列宽 → 用它
        if (w.length > 0 && w.every((x) => Number.isFinite(x) && x > 0)) {
          widths = w;
          break;
        }
      }
      if (!widths) return;
      const lefts: number[] = [0];
      for (let i = 0; i < widths.length - 1; i++) {
        lefts.push((lefts[i] ?? 0) + (widths[i] ?? 0));
      }
      setRowHeaderLefts((prev) => {
        if (prev.length === lefts.length && prev.every((v, i) => v === lefts[i])) return prev;
        return lefts;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tbl);
    return () => ro.disconnect();
    // 依赖 renderModel + columnWidths + freezeRowHeader 触发重测
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderModel, columnWidths, freezeRowHeader]);

  const startColumnResize = (key: string, startX: number, startWidth: number) => {
    resizeRef.current = { key, startX, startWidth };
  };

  // selection / renderModel 写到 ref 供 keydown 监听器读最新值（避免依赖反复重新绑定）
  const selectionRef = useRef<CellSelection | null>(selection);
  selectionRef.current = selection;
  renderModelRef.current = renderModel;

  const startSelection = (r: number, c: number) => {
    draggingRef.current = true;
    setSelection({ rStart: r, cStart: c, rEnd: r, cEnd: c });
  };
  const extendSelection = (r: number, c: number) => {
    if (!draggingRef.current) return;
    setSelection((prev) => (prev ? { ...prev, rEnd: r, cEnd: c } : null));
  };
  const endSelection = () => {
    draggingRef.current = false;
  };

  // document-level mouseup：松开鼠标时结束拖选（即使在表外松开也要关）
  useEffect(() => {
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // P5+ 滚动加载:IntersectionObserver 监听底部 sentinel,进入视口 → 调 onLoadMore
  // 不传 onLoadMore 则不启用(paged 模式下 PivotTable 不传)
  // observer 在 jsdom 不可用时静默退出 → 测试里直接调 loadMore 验证累积逻辑,不依赖 IO
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onLoadMore) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const root = containerRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { root, rootMargin: '100px', threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [onLoadMore]);

  // Ctrl/Cmd+C：复制选区 TSV 到剪贴板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'c' && e.key !== 'C') return;
      const sel = selectionRef.current;
      const model = renderModelRef.current;
      if (!sel || !model) return;
      // 只在文档没有原生文本选择时才接管（避免覆盖用户选中文字的复制）
      const winSel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (winSel && winSel.toString().length > 0) return;
      const tsv = extractSelectionTsv(model, sel);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(tsv).catch(() => {});
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 错误优先（带 retry）
  if (error) {
    const displayed = formatErrorForDisplay(error);
    return (
      <div
        className={className ? `pivot-renderer ${className}` : 'pivot-renderer'}
        style={style}
        data-state="error"
      >
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

  // values 为空 → 引导提示
  if (viewConfig.values.length === 0) {
    return (
      <div
        className={className ? `pivot-renderer ${className}` : 'pivot-renderer'}
        style={style}
        data-state="empty-prompt"
      >
        <div data-testid="pivot-empty-prompt" className="pivot-empty-prompt">
          {EMPTY_PROMPT}
        </div>
      </div>
    );
  }

  // 加载中或空数据
  const isEmptyResult =
    renderModel === null ||
    (renderModel.rowHeader.length === 0 && renderModel.grandTotalRow === null);

  if (isEmptyResult) {
    return (
      <div
        className={className ? `pivot-renderer ${className}` : 'pivot-renderer'}
        style={style}
        data-loading={loading ? 'true' : undefined}
        data-state={loading ? 'loading' : 'no-data'}
      >
        {!loading && <div data-testid="pivot-no-data" className="pivot-no-data">{NO_DATA_TEXT}</div>}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ? `pivot-renderer ${className}` : 'pivot-renderer'}
      style={style}
      data-loading={loading ? 'true' : undefined}
      data-state="ready"
    >
      {(() => {
        // 行标签列数：用第一行的 fullPath 长度（drill 全局，所有行同长）
        const rowHeaderLevels = Math.max(
          1,
          renderModel.rowHeader[0]?.fullPath.length ?? 1,
        );
        // P3+ 列树模式 — 计算 filtered levels + hidden/placeholder body cols
        const colTreeMode = viewConfig.pageState.columnHeaderMode === 'tree';
        const treeColResult =
          colTreeMode && renderModel.columnHeaderLevels
            ? buildTreeColumnLevels(renderModel.columnHeaderLevels, collapsedColPrefixes)
            : null;
        const hiddenBodyCols: ReadonlySet<number> =
          treeColResult?.hiddenBodyCols ?? new Set<number>();
        const placeholderBodyCols: ReadonlyMap<number, string> =
          treeColResult?.placeholderBodyCols ?? new Map<number, string>();
        const numColLevels =
          treeColResult?.filteredLevels.length ?? renderModel.columnHeaderLevels?.length ?? 1;
        return (
      <table
        ref={tableRef}
        className="pivot-grid"
        data-row-header-levels={rowHeaderLevels}
        data-freeze-header={freezeHeader ? 'true' : 'false'}
        data-freeze-row-header={freezeRowHeader ? 'true' : 'false'}
      >
        <thead data-frozen-header={freezeHeader ? 'true' : 'false'} data-column-header-mode={colTreeMode ? 'tree' : 'merge'}>
          {(
            // 列树模式优先用过滤后的 levels;否则用原 columnHeaderLevels;再 fallback 到单级
            treeColResult?.filteredLevels ??
            renderModel.columnHeaderLevels ??
            [
              renderModel.columnHeader.map((c) => ({
                fieldName: c.fieldName,
                label: c.alias,
                colSpan: 1,
                isMeasure: c.isMeasure,
              })),
            ]
          ).map((levelCells, lvlIdx, allLevels) => {
            const isLast = lvlIdx === allLevels.length - 1;
            return (
              <tr key={`hdr-lvl-${lvlIdx}`}>
                {/* 左上角 corner：每个行 level 一个 th 显示对应字段 alias。
                    - rowFieldLabels 传了 → 渲染 N 个 th(每个 colSpan=1, rowSpan 跨所有 level 行)
                    - 没传 → 退化为单个空 corner(老行为) */}
                {lvlIdx === 0 &&
                  (rowFieldLabels && rowFieldLabels.length > 0
                    ? Array.from({ length: rowHeaderLevels }).map((_, ci) => {
                        // 该 corner cell 对应的 row dim fieldName(从 viewConfig.rows[ci])
                        const cornerFieldName = viewConfig.rows[ci]?.fieldName;
                        return (
                        <th
                          key={`corner-${ci}`}
                          className="pivot-corner"
                          rowSpan={allLevels.length}
                          data-frozen-corner={
                            freezeHeader && freezeRowHeader ? 'true' : 'false'
                          }
                          data-testid={`pivot-corner-${ci}`}
                          onContextMenu={
                            onHeaderContextMenu && cornerFieldName
                              ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onHeaderContextMenu({
                                    type: 'corner',
                                    fieldName: cornerFieldName,
                                    x: e.clientX,
                                    y: e.clientY,
                                  });
                                }
                              : undefined
                          }
                        >
                          {rowFieldLabels[ci] ?? ''}
                        </th>
                        );
                      })
                    : (
                        <th
                          className="pivot-corner"
                          rowSpan={allLevels.length}
                          colSpan={rowHeaderLevels}
                          data-frozen-corner={
                            freezeHeader && freezeRowHeader ? 'true' : 'false'
                          }
                        />
                      ))}
                {levelCells.map((cell, cellIdx) => {
                  // P3+ 列树模式 — cell 是 TreeColumnLevelCell 时带 collapsed/key/hasChildren
                  const treeCell = colTreeMode ? (cell as TreeColumnLevelCell) : null;
                  const isCollapsedParent = !!treeCell?.collapsed;
                  const treeKey = treeCell?.key;
                  // collapsed parent 用 rowSpan 把下面的 level 行覆盖
                  const rowSpan =
                    isCollapsedParent
                      ? Math.max(1, numColLevels - lvlIdx)
                      : undefined;
                  // 最深层的 cell 才可排序（measure 或 dim 都可，P1.0）。
                  // collapsed parent 不可排序(它代表整组,排序无意义)
                  const sort = isLast && !isCollapsedParent
                    ? findActiveSort(viewConfig.rowSorts, cell.fieldName)
                    : undefined;
                  const sortable = isLast && !isCollapsedParent;
                  const sortKind: 'ByMeasure' | 'ByDimension' = cell.isMeasure
                    ? 'ByMeasure'
                    : 'ByDimension';
                  const dataAttrs: Record<string, string> = {};
                  if (sort) dataAttrs['data-sort'] = sort.direction;
                  // P1.5：多列排序优先级（1, 2, 3...）
                  const sortIdx = isLast
                    ? viewConfig.rowSorts.findIndex(
                        (s) =>
                          (s.type === 'ByMeasure' && s.measureName === cell.fieldName) ||
                          (s.type === 'ByDimension' && s.fieldName === cell.fieldName),
                      )
                    : -1;
                  const showSortRank = sortable && sort && viewConfig.rowSorts.length > 1;
                  // 列宽（仅最深层 = 数据列才允许 resize）
                  const customWidth = isLast ? columnWidths[cell.fieldName] : undefined;
                  const thStyle: CSSProperties = sortable ? { cursor: 'pointer' } : {};
                  if (customWidth !== undefined) thStyle.width = `${customWidth}px`;
                  // P5+ row-scope 列头飘色:该 th 覆盖的数据列范围 [start, end) 内,
                  // 任一列被 row-scope 命中 → 列头跟着飘色(跟行头飘色对称,组成"十字")
                  if (rowScopeHits && rowScopeHits.cols.size > 0) {
                    const range = headerCellRanges?.[lvlIdx]?.[cellIdx];
                    if (range) {
                      for (let dc = range.start; dc < range.end; dc++) {
                        const colStyle = rowScopeHits.cols.get(dc);
                        if (colStyle) {
                          if (colStyle.bg) thStyle.backgroundColor = colStyle.bg;
                          if (colStyle.fg) thStyle.color = colStyle.fg;
                          if (colStyle.bold) thStyle.fontWeight = 600;
                          break;
                        }
                      }
                    }
                  }
                  // P3+ 列树模式 — 非叶 cell 加 toggle(▶ collapsed / ▼ expanded)
                  const showColToggle = colTreeMode && treeCell?.hasChildren && !isLast;
                  const showCollapsedBadge = isCollapsedParent;
                  // P5+ 列头右键菜单触发:
                  //   - isLast + isMeasure → col-measure(对该度量列排序)
                  //   - 否则 → col-member(对该维度成员 In/NotIn 过滤)
                  // collapsed parent 暂不出菜单(它代表整组,语义模糊)
                  const handleHeaderContext = onHeaderContextMenu && !isCollapsedParent
                    ? (e: ReactMouseEvent<HTMLElement>) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (cell.isMeasure && isLast) {
                          onHeaderContextMenu({
                            type: 'col-measure',
                            measureName: cell.fieldName,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        } else {
                          onHeaderContextMenu({
                            type: 'col-member',
                            fieldName: cell.fieldName,
                            memberName: cell.label,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }
                    : undefined;
                  return (
                    <th
                      key={`hdr-${lvlIdx}-${cellIdx}`}
                      data-testid={isLast ? `column-header-${cell.fieldName}` : undefined}
                      colSpan={cell.colSpan}
                      rowSpan={rowSpan}
                      className="pivot-column-header"
                      data-sortable={sortable ? 'true' : 'false'}
                      data-collapsed={isCollapsedParent ? 'true' : undefined}
                      {...dataAttrs}
                      style={Object.keys(thStyle).length > 0 ? thStyle : undefined}
                      title={
                        sortable
                          ? '点击切换排序方向；Shift+点击 多列；Alt+点击 分组内排序 (BASC/BDESC);右键更多操作'
                          : undefined
                      }
                      onClick={
                        sortable
                          ? (e) =>
                              onSortClick(cell.fieldName, sortKind, {
                                multi: e.shiftKey,
                                mode: e.altKey ? 'group' : 'global',
                              })
                          : undefined
                      }
                      onContextMenu={handleHeaderContext}
                    >
                      {(showColToggle || showCollapsedBadge) && treeKey && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="pivot-tree-toggle pivot-tree-toggle--col"
                          data-testid={`col-tree-toggle-${treeKey}`}
                          aria-expanded={!isCollapsedParent}
                          title={isCollapsedParent ? '展开' : '折叠'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColPrefix(treeKey);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleColPrefix(treeKey);
                            }
                          }}
                        >
                          {isCollapsedParent ? '▶' : '▼'}
                        </span>
                      )}
                      {cell.label}
                      {sortable && sort?.direction === 'DESC' && (
                        <span aria-hidden="true"> ↓</span>
                      )}
                      {sortable && sort?.direction === 'ASC' && (
                        <span aria-hidden="true"> ↑</span>
                      )}
                      {/* P2 分组内排序：箭头加角标提示 */}
                      {sortable && sort?.direction === 'BDESC' && (
                        <span
                          aria-hidden="true"
                          title="分组内降序"
                        > ↓<sub style={{ fontSize: 9 }}>组</sub></span>
                      )}
                      {sortable && sort?.direction === 'BASC' && (
                        <span
                          aria-hidden="true"
                          title="分组内升序"
                        > ↑<sub style={{ fontSize: 9 }}>组</sub></span>
                      )}
                      {showSortRank && (
                        <sup className="pivot-sort-rank" aria-hidden="true">
                          {sortIdx + 1}
                        </sup>
                      )}
                      {/* 列宽拖拽 handle —— 只在最深层显示 */}
                      {isLast && (
                        <span
                          className="pivot-col-resize"
                          data-testid={`col-resize-${cell.fieldName}`}
                          aria-label="拖拽调整列宽"
                          role="separator"
                          onMouseDown={(e) => {
                            // 阻止冒泡到 th 的 onClick (排序)
                            e.stopPropagation();
                            e.preventDefault();
                            const th = (e.currentTarget as HTMLElement).parentElement;
                            const startWidth =
                              customWidth ??
                              (th instanceof HTMLElement ? th.getBoundingClientRect().width : 100);
                            startColumnResize(cell.fieldName, e.clientX, startWidth);
                          }}
                          /* BUG fix:click 是 mousedown→mouseup 合成,即使 mousedown stop 了,
                             click 仍单独 bubble 到 <th> 触发排序。独立拦 click。 */
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            );
          })}
        </thead>
        <tbody data-row-header-mode={viewConfig.pageState.rowHeaderMode ?? 'merge'}>
          {viewConfig.pageState.rowHeaderMode === 'tree'
            ? renderTreeRows({
                rowHeader: renderModel.rowHeader,
                matrix: renderModel.matrix,
                columnHeader: renderModel.columnHeader,
                rowHeaderLevels,
                collapsedRowPrefixes,
                toggleRowPrefix,
                emptyValueText: viewConfig.pageState.emptyValueText,
                freezeRowHeader,
                hiddenBodyCols,
                placeholderBodyCols,
                onCellClick,
                onCellRightClick,
              })
            : (() => {
            // 行头多级 rowSpan 合并：相邻同 prefix 行合并（与列头合并镜像）
            const paddedPaths = renderModel.rowHeader.map((rn) => {
              const labels = rn.fullPath.length > 0 ? rn.fullPath : [rn.member.name];
              return labels.length < rowHeaderLevels
                ? [...labels, ...Array(rowHeaderLevels - labels.length).fill('')]
                : labels;
            });
            const rowSpansMap = buildRowHeaderSpans(paddedPaths);
            return renderModel.rowHeader.map((rowNode, r) => {
              const padded = paddedPaths[r]!;
              const spans = rowSpansMap[r] ?? [];
              return (
            <tr key={`row-${r}-${rowNode.member.name}`}>
              {padded.map((label, lvlIdx) => {
                const isLastLabel = lvlIdx === padded.length - 1;
                const span = spans[lvlIdx] ?? 1;
                // span === 0：被前面行的 rowSpan 覆盖，跳过渲染
                if (span === 0) return null;
                const stickyLeft = freezeRowHeader ? rowHeaderLefts[lvlIdx] : undefined;
                // P5+ 行头成员右键 — 触发 row-member 菜单(In/NotIn 过滤)
                // fieldName 推断:
                //   - hierarchy 行:用 hierarchyFieldName(目前一个 hierarchy 共享同 fieldName,
                //     精确按 level 过滤的边界 case 留待后端能力确认再细化)
                //   - 普通 dim 行:用 viewConfig.rows[lvlIdx]?.fieldName
                const rowMemberFieldName =
                  rowNode.hierarchyFieldName ?? viewConfig.rows[lvlIdx]?.fieldName;
                const handleRowMemberContext =
                  onHeaderContextMenu && rowMemberFieldName && label
                    ? (e: ReactMouseEvent<HTMLElement>) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onHeaderContextMenu({
                          type: 'row-member',
                          fieldName: rowMemberFieldName,
                          memberName: label,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }
                    : undefined;
                // P5+ row-scope 行头飘色 — 任一 cell 命中该 row 的 row-scope rule,行头跟着飘色
                const rowScopeForTh = rowScopeHits?.rows.get(r);
                const thInlineStyle: CSSProperties = {};
                if (stickyLeft !== undefined) thInlineStyle.left = `${stickyLeft}px`;
                if (rowScopeForTh) {
                  if (rowScopeForTh.bg) thInlineStyle.backgroundColor = rowScopeForTh.bg;
                  if (rowScopeForTh.fg) thInlineStyle.color = rowScopeForTh.fg;
                  if (rowScopeForTh.bold) thInlineStyle.fontWeight = 600;
                }
                return (
                  <th
                    key={`r-${r}-l-${lvlIdx}`}
                    scope="row"
                    data-testid={isLastLabel ? `row-header-${rowNode.member.name}` : undefined}
                    data-depth={rowNode.depth}
                    data-frozen-row-header={freezeRowHeader ? 'true' : 'false'}
                    data-row-header-col={lvlIdx}
                    className="pivot-row-header"
                    rowSpan={span > 1 ? span : undefined}
                    style={Object.keys(thInlineStyle).length > 0 ? thInlineStyle : undefined}
                    onContextMenu={handleRowMemberContext}
                  >
                    {/* drill ▼ ▶ chevrons 仅在最后一个 row label cell 显示 */}
                    {isLastLabel && rowNode.canDrillUp && rowNode.hierarchyFieldName && (
                      <span
                        role="button"
                        tabIndex={0}
                        data-testid="drill-up"
                        className="pivot-drill-toggle pivot-drill-up"
                        title="向上钻"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDrillUp(rowNode.hierarchyFieldName!);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onDrillUp(rowNode.hierarchyFieldName!);
                          }
                        }}
                      >
                        ▼
                      </span>
                    )}
                    {isLastLabel && rowNode.canDrillDown && rowNode.hierarchyFieldName && (
                      <span
                        role="button"
                        tabIndex={0}
                        data-testid="drill-down"
                        className="pivot-drill-toggle pivot-drill-down"
                        title="向下钻"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDrillDown(rowNode.hierarchyFieldName!);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onDrillDown(rowNode.hierarchyFieldName!);
                          }
                        }}
                      >
                        ▶
                      </span>
                    )}
                    <span className="pivot-row-label">{label}</span>
                  </th>
                );
              })}
              {renderModel.matrix[r]!.map((cell, c) => {
                // P3+ 列树模式 — 跳过被 collapsed parent 覆盖的列;placeholder 列渲染空 td
                if (hiddenBodyCols.has(c)) return null;
                if (placeholderBodyCols.has(c)) {
                  return (
                    <td
                      key={c}
                      className="pivot-cell pivot-cell--col-placeholder"
                      data-empty="true"
                      data-col-placeholder="true"
                    />
                  );
                }
                const colHeader = renderModel.columnHeader[c];
                const dataAttrs: Record<string, string> = {};
                if (cell.isMasked) dataAttrs['data-masked'] = 'true';
                if (cell.isEmpty) dataAttrs['data-empty'] = 'true';
                // P5+ 条件格式化:有规则 + 非空 cell + 数值才评估
                let cellInlineStyle: CSSProperties | undefined;
                let dataBarNode: ReactNode = null;
                const cellMeasure = colHeader?.fieldName;
                // P5+ row-scope:仅"该 cell 自己"命中才飘色(行头列头跟着飘),
                // 不会"同行其他 measure cell"也飘 — 跟用户视觉直觉一致
                const rowScopeCellStyle = rowScopeHits?.cells.get(`${r},${c}`);
                if (rowScopeCellStyle) {
                  cellInlineStyle = {
                    ...(rowScopeCellStyle.bg ? { backgroundColor: rowScopeCellStyle.bg } : {}),
                    ...(rowScopeCellStyle.fg ? { color: rowScopeCellStyle.fg } : {}),
                    ...(rowScopeCellStyle.bold ? { fontWeight: 600 } : {}),
                  };
                }
                if (
                  cellMeasure &&
                  !cell.isEmpty &&
                  !cell.isMasked &&
                  typeof cell.value === 'number' &&
                  condFormats.length > 0 &&
                  hasRulesFor(condFormats, cellMeasure)
                ) {
                  // 优先级:cell-scope > row-scope;cell 内 threshold > topN/bottomN
                  // (cell-scope 规则更"具体" — 用户点的某 cell 的具体条件 wins)
                  // 注意:evaluateThreshold / evaluateTopBottom 不过滤 scope,需要先切片
                  const cellRules = condFormats.filter((r) => getRuleScope(r) === 'cell');
                  let resolvedStyle = evaluateThreshold(cellRules, cellMeasure, cell.value);
                  if (
                    !resolvedStyle.bg &&
                    !resolvedStyle.fg &&
                    !resolvedStyle.bold &&
                    topBottomCutoffs
                  ) {
                    resolvedStyle = evaluateTopBottom(
                      cellRules,
                      cellMeasure,
                      cell.value,
                      topBottomCutoffs,
                    );
                  }
                  if (resolvedStyle.bg || resolvedStyle.fg || resolvedStyle.bold) {
                    cellInlineStyle = {
                      ...(resolvedStyle.bg ? { backgroundColor: resolvedStyle.bg } : {}),
                      ...(resolvedStyle.fg ? { color: resolvedStyle.fg } : {}),
                      ...(resolvedStyle.bold ? { fontWeight: 600 } : {}),
                    };
                  }
                  const bar = evaluateDataBar(
                    condFormats,
                    cellMeasure,
                    cell.value,
                    colRanges?.get(cellMeasure) ?? null,
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
                // P3+ 空值显示:cell.isEmpty 时优先用 viewConfig.pageState.emptyValueText
                const display = cell.isMasked
                  ? '***'
                  : cell.isEmpty && viewConfig.pageState.emptyValueText
                    ? viewConfig.pageState.emptyValueText
                    : cell.formattedValue;
                const tooltip =
                  !cell.isEmpty && colHeader
                    ? tooltipFor(rowNode, colHeader.alias, display)
                    : undefined;
                // P1.0：单元格右键复制 TSV（行路径 + 列名 + 值）+ onCellClick 联动
                const handleCopy = () => {
                  if (cell.isMasked || cell.isEmpty) return;
                  const tsv = `${rowNode.fullPath.join('\t')}\t${colHeader?.alias ?? ''}\t${cell.formattedValue}`;
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(tsv).catch(() => {});
                  }
                };
                // 选区命中？
                const isSelected =
                  selection !== null &&
                  r >= Math.min(selection.rStart, selection.rEnd) &&
                  r <= Math.max(selection.rStart, selection.rEnd) &&
                  c >= Math.min(selection.cStart, selection.cEnd) &&
                  c <= Math.max(selection.cStart, selection.cEnd);
                if (isSelected) dataAttrs['data-selected'] = 'true';
                return (
                  <td
                    key={c}
                    data-testid={`cell-r${r}-c${c}`}
                    className={
                      dataBarNode ? 'pivot-cell pivot-cell--has-databar' : 'pivot-cell'
                    }
                    {...dataAttrs}
                    style={cellInlineStyle}
                    title={tooltip}
                    onMouseDown={(e) => {
                      // 仅左键开始选区；shift+click 扩展选区
                      if (e.button !== 0) return;
                      if (e.shiftKey && selection) {
                        setSelection({ ...selection, rEnd: r, cEnd: c });
                        // shift+click 不进入拖动模式（避免连带 mouseenter）
                        draggingRef.current = false;
                        return;
                      }
                      startSelection(r, c);
                    }}
                    onMouseEnter={() => extendSelection(r, c)}
                    onMouseUp={endSelection}
                    onClick={
                      onCellClick
                        ? () =>
                            onCellClick({
                              rowIndex: r,
                              colIndex: c,
                              rowPath: rowNode.fullPath,
                              columnFieldName: colHeader?.fieldName ?? '',
                              value: cell.value,
                            })
                        : undefined
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      // P1.5: host 提供 onCellRightClick → 让 host 决定（不自动 TSV copy）
                      if (onCellRightClick) {
                        onCellRightClick({
                          rowIndex: r,
                          colIndex: c,
                          rowPath: rowNode.fullPath,
                          columnFieldName: colHeader?.fieldName ?? '',
                          value: cell.value,
                          formattedValue: cell.formattedValue,
                          x: e.clientX,
                          y: e.clientY,
                        });
                        return;
                      }
                      handleCopy();
                    }}
                  >
                    {dataBarNode}
                    <span className="pivot-cell-content">{display}</span>
                  </td>
                );
              })}
            </tr>
            );
            });
          })()
          }
        </tbody>
        {renderModel.grandTotalRow && (
          <tfoot>
            <tr data-testid="grand-total-row" className="pivot-grand-total">
              <th
                scope="row"
                colSpan={rowHeaderLevels}
                className="pivot-row-header pivot-row-header--total"
                data-frozen-row-header={freezeRowHeader ? 'true' : 'false'}
              >
                {GRAND_TOTAL_LABEL}
              </th>
              {renderModel.grandTotalRow.map((cell, c) => {
                // 列树模式过滤
                if (hiddenBodyCols.has(c)) return null;
                if (placeholderBodyCols.has(c)) {
                  return (
                    <td
                      key={c}
                      className="pivot-cell pivot-cell--total pivot-cell--col-placeholder"
                      data-empty="true"
                    />
                  );
                }
                return (
                  <td
                    key={c}
                    data-testid={`grand-total-c${c}`}
                    data-masked={cell.isMasked ? 'true' : undefined}
                    data-empty={cell.isEmpty ? 'true' : undefined}
                    className="pivot-cell pivot-cell--total"
                  >
                    {cell.isMasked
                      ? '***'
                      : cell.isEmpty && viewConfig.pageState.emptyValueText
                        ? viewConfig.pageState.emptyValueText
                        : cell.formattedValue}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
        );
      })()}
      {/* P5+ 滚动加载 sentinel — 仅在传 onLoadMore 时渲染。IntersectionObserver 监听其进入视口
          触发 onLoadMore;hook 内部已防抖(loading / !hasMore 时 noop),不会重复触发 */}
      {onLoadMore && (
        <div
          ref={sentinelRef}
          className="pivot-scroll-sentinel"
          data-testid="pivot-scroll-sentinel"
          data-state={loadingMore ? 'loading' : hasMore ? 'idle' : 'done'}
        >
          {loadingMore ? '加载中…' : hasMore ? '' : '已全部加载'}
        </div>
      )}
    </div>
  );
}
