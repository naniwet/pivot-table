/**
 * Toolbar — 顶部工具栏
 *
 * P0：刷新 / 导出当前页 CSV
 *
 * **导出范围说明**：当前 onExportCsv 只导出**当前已加载的页**(默认 ≤50 行 × 50 列 = 2500 cells)。
 * 大数据量"全量导出"需要后端专门 endpoint(backend stream),P0 范围外。
 *
 * 设计：
 *   - 不持有数据状态;纯回调驱动
 *   - 文件下载逻辑由父组件实现,Toolbar 只暴露 onExportCsv 回调
 *   - Top-N 入口已移除(2026-05-06):原实现是"按 measure DESC 排序 + 改 pageSize" hack,
 *     不是真过滤,翻页就破功;真 Top-N 应作为 Filter.Top 加到维度过滤,等后端能力确认后重做。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface ToolbarProps {
  /**
   * 工具栏最左侧动态插槽 — 宿主可放任意 React 节点(面包屑 / 视图标题 / 等)。
   * 不传则左侧空,中间按钮自然居中。
   */
  leadingSlot?: ReactNode;
  /**
   * 工具栏最右侧动态插槽 — 宿主可放任意 React 节点(数据源切换器 / 上下文 picker)。
   * 不传则右侧空,中间按钮自然居中。
   */
  trailingSlot?: ReactNode;
  onRefresh: () => void;
  onExportCsv: () => void;
  /**
   * P5+ 全量 Excel 导出回调 — 不传则不渲染按钮(向后兼容)。
   * 跟 onExportCsv 区别:CSV 导当前页(快、不重 fetch);Excel 导全量(重 fetch + xlsx blob)。
   */
  onExportExcel?: () => void;
  /** P5+ 导出 Excel 进行中 → 按钮 disabled + 文字显"导出中…" */
  exportingExcel?: boolean;
  /**
   * P5+ 全量导出最大行数 — 2026-05-16 从 SettingsModal 移到导出按钮 popover 内联
   * (导出场景下就近改参数,不必去设置面板找);CSV 模式忽略(仅当前页)。
   */
  exportMaxRows?: number;
  /** 改 exportMaxRows 的回调;不传则 popover 里行数 input 灰显 */
  onChangeExportMaxRows?: (n: number) => void;
  /**
   * P5+ 进入浏览模式 — 不传则不渲染按钮。
   * 浏览模式 = 沉浸视图(隐藏所有 chrome,只看表格 + 滚动加载),用户用快速过表的场景。
   */
  onEnterBrowseMode?: () => void;
  /** 当 renderModel 为空时禁用导出按钮 */
  exportDisabled?: boolean;
  /** P3 设置面板:点击设置按钮回调;不传则不渲染设置按钮 */
  onOpenSettings?: () => void;
  /** P3+ 图表模式:当前显示模式 */
  displayMode?: 'table' | 'chart';
  /** P3+ 切换显示模式回调;不传则不渲染切换按钮 */
  onToggleDisplayMode?: () => void;
  /**
   * P3+ 图表类型 — toolbar 不再渲染此控件(2026-05-16 移到 ChartRenderer 右上角)。
   * Props 保留为 optional + 文档标记 deprecated,避免 break 现有调用方;内部完全忽略。
   * @deprecated use ChartRenderer.chartTypePicker instead
   */
  chartType?: 'bar' | 'line' | 'pie';
  /** @deprecated 同 chartType */
  onChangeChartType?: (type: 'bar' | 'line' | 'pie') => void;
  /**
   * P5+ 即席查询(明细)模式开关
   *   - queryMode='adhoc' 时按钮高亮 + 标签变"透视"
   *   - 点击切换 pivot ↔ adhoc(改 viewConfig.queryMode)
   *   - 没传 → 隐藏按钮(不开放 adhoc 模式)
   */
  queryMode?: 'pivot' | 'adhoc';
  onToggleQueryMode?: () => void;
  /**
   * P5+ 撤销 / 重做(传 onUndo/onRedo 才渲染按钮;canUndo/canRedo 决定 disabled)
   * 跟 useViewConfig 第 3 返回值 ViewConfigHistory 对接
   */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * 内联 SVG icon — 不引图标库,简单 stroke icon 自包含。
 * 16×16,使用 currentColor 跟随按钮文字色。
 */
const ICON_REFRESH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 8a6 6 0 1 1-1.76-4.24" />
    <path d="M14 2v4h-4" />
  </svg>
);
const ICON_DOWNLOAD = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 2v9" />
    <path d="M4 7l4 4 4-4" />
    <path d="M2.5 13h11" />
  </svg>
);
// ICON_CHART / ICON_TABLE / ICON_LIST 已删除(2026-05-10):
//   原"图表/表格"和"明细/透视"切换按钮改成 segmented control(纯文字),不再用单按钮+icon

const ICON_SETTINGS = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="8" r="2" />
    <path d="M13.5 9.4 14.7 10l-1.5 2.6-1.4-.5-1.2.7-.2 1.4H7.6l-.2-1.4-1.2-.7-1.4.5L3.3 10 4.5 9.4a4.7 4.7 0 0 1 0-1.6L3.3 7l1.5-2.6 1.4.5 1.2-.7.2-1.4h2.8l.2 1.4 1.2.7 1.4-.5 1.5 2.6-1.2.6.1.8-.1.8z" />
  </svg>
);
/** 眼睛图标 — 浏览模式入口 */
const ICON_EYE = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);
/** ↶ 撤销 — 圆弧加左尾(回退视觉)*/
const ICON_UNDO = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 7h7a3 3 0 0 1 0 6H6" />
    <path d="M6 4 3 7l3 3" />
  </svg>
);
/** ↷ 重做 — 镜像 undo */
const ICON_REDO = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M13 7H6a3 3 0 0 0 0 6h4" />
    <path d="M10 4l3 3-3 3" />
  </svg>
);

export function Toolbar({
  leadingSlot,
  trailingSlot,
  onRefresh,
  onExportCsv,
  onExportExcel,
  exportMaxRows = 10000,
  onChangeExportMaxRows,
  exportingExcel = false,
  onEnterBrowseMode,
  exportDisabled = false,
  onOpenSettings,
  displayMode = 'table',
  onToggleDisplayMode,
  // chartType / onChangeChartType 已废弃(picker 移到 ChartRenderer),声明但不解构,
  // 避免 ESLint 报 unused 又不影响 TS optional-prop 兼容
  queryMode = 'pivot',
  onToggleQueryMode,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  className,
  style,
}: ToolbarProps): ReactNode {
  // 三栏 grid layout(1fr auto 1fr):
  //   - leading(左):宿主插槽,可空
  //   - center(中):所有功能按钮 — 刷新 / 导出 / 模式切换 / 设置 — 自然居中
  //   - trailing(右):宿主插槽 — demo 放 SmartbiConfigManager(数据源切换)
  // 刷新不用主蓝;设置 icon-only,跟其他按钮并列在中间组。
  return (
    <div className={className ? `toolbar ${className}` : 'toolbar'} style={style}>
      <div className="toolbar__leading" data-testid="toolbar-leading">
        {leadingSlot}
      </div>

      <div className="toolbar__center">
        {/* 顺序按"操作频率"由左到右排:常用 → 偶尔 → 终结性
         *   高频:刷新 / 模式切换(明细↔透视、表格↔图表)
         *   中频:设置(显示选项、面板可见性等)
         *   低频:导出 CSV / 导出 Excel(终结性动作,放最右)
         */}
        <button
          type="button"
          data-testid="toolbar-refresh"
          className="toolbar-btn"
          onClick={onRefresh}
          title="刷新当前查询"
        >
          {ICON_REFRESH}
          <span>刷新</span>
        </button>
        {/* P5+ 撤销 / 重做 — 仅当宿主传了 onUndo/onRedo 才渲染(default-off)
         *   icon-only(节省横向空间);disabled 状态由 canUndo/canRedo 控制
         *   快捷键 Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z 在 PivotTable 文档级监听 */}
        {onUndo && (
          <button
            type="button"
            data-testid="toolbar-undo"
            className="toolbar-btn toolbar-btn--icon-only"
            disabled={!canUndo}
            title={canUndo ? '撤销 (Cmd/Ctrl+Z)' : '没有可撤销的操作'}
            aria-label="撤销"
            onClick={() => {
              if (canUndo) onUndo();
            }}
          >
            {ICON_UNDO}
          </button>
        )}
        {onRedo && (
          <button
            type="button"
            data-testid="toolbar-redo"
            className="toolbar-btn toolbar-btn--icon-only"
            disabled={!canRedo}
            title={canRedo ? '重做 (Cmd/Ctrl+Shift+Z)' : '没有可重做的操作'}
            aria-label="重做"
            onClick={() => {
              if (canRedo) onRedo();
            }}
          >
            {ICON_REDO}
          </button>
        )}
        {/* P5+ 查询模式切换 — segmented control:同时显示两个选项,激活态高亮
         *   原单按钮"明细/透视"label = 目的地,容易误读"我在明细模式";segmented 直接看出"我在哪"
         */}
        {onToggleQueryMode && (
          <div
            className="toolbar__segmented"
            role="radiogroup"
            aria-label="查询模式"
            data-testid="toolbar-toggle-query-mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={queryMode === 'pivot'}
              data-testid="query-mode-pivot"
              data-active={queryMode === 'pivot' ? 'true' : 'false'}
              className="toolbar__segmented-btn"
              title="透视模式(支持度量/聚合/计算)"
              onClick={() => {
                if (queryMode !== 'pivot') onToggleQueryMode();
              }}
            >
              透视
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={queryMode === 'adhoc'}
              data-testid="query-mode-adhoc"
              data-active={queryMode === 'adhoc' ? 'true' : 'false'}
              className="toolbar__segmented-btn"
              title="即席查询模式(明细 SQL 直连;不支持度量/聚合/计算度量)"
              onClick={() => {
                if (queryMode !== 'adhoc') onToggleQueryMode();
              }}
            >
              明细
            </button>
          </div>
        )}
        {/* P3+ 显示模式切换 — segmented control(表格|图表);adhoc 下整组 disabled */}
        {onToggleDisplayMode && (
          <div
            className="toolbar__segmented"
            role="radiogroup"
            aria-label="显示模式"
            data-testid="toolbar-toggle-display-mode"
            data-disabled={queryMode === 'adhoc' ? 'true' : 'false'}
            title={
              queryMode === 'adhoc'
                ? '即席查询(明细)模式不支持图表 — 切回透视模式后可用'
                : undefined
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={displayMode === 'table'}
              data-testid="display-mode-table"
              data-active={displayMode === 'table' ? 'true' : 'false'}
              className="toolbar__segmented-btn"
              disabled={queryMode === 'adhoc'}
              onClick={() => {
                if (displayMode !== 'table') onToggleDisplayMode();
              }}
            >
              表格
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={displayMode === 'chart'}
              data-testid="display-mode-chart"
              data-active={displayMode === 'chart' ? 'true' : 'false'}
              className="toolbar__segmented-btn"
              disabled={queryMode === 'adhoc'}
              onClick={() => {
                if (displayMode !== 'chart') onToggleDisplayMode();
              }}
            >
              图表
            </button>
          </div>
        )}
        {/* P5+ 浏览模式入口 — 进入沉浸视图(隐藏所有 chrome + 滚动加载) */}
        {onEnterBrowseMode && (
          <button
            type="button"
            data-testid="toolbar-browse"
            className="toolbar-btn"
            title="浏览模式 — 隐藏所有面板,只看数据(右上角可退出)"
            onClick={onEnterBrowseMode}
          >
            {ICON_EYE}
            <span>浏览</span>
          </button>
        )}
        {/* 设置按钮 — 跟其他按钮一致,带文字 */}
        {onOpenSettings && (
          <button
            type="button"
            data-testid="toolbar-settings"
            className="toolbar-btn"
            title="显示选项(冻结/压缩/总行数 等)"
            onClick={onOpenSettings}
          >
            {ICON_SETTINGS}
            <span>设置</span>
          </button>
        )}
        {/* 导出 — 合并 CSV/Excel 两个按钮 + 行数 input 为单一 popover
            (2026-05-16 减少 toolbar 拥挤 + 行数 setting 内联到导出场景,无需翻设置) */}
        <ExportButton
          disabled={!!exportDisabled}
          exportingExcel={!!exportingExcel}
          exportMaxRows={exportMaxRows}
          onChangeExportMaxRows={onChangeExportMaxRows}
          onExportCsv={onExportCsv}
          onExportExcel={onExportExcel}
        />
      </div>

      <div className="toolbar__trailing" data-testid="toolbar-trailing">
        {trailingSlot}
      </div>
    </div>
  );
}

/**
 * ExportButton — 合并"导出 CSV / 导出 Excel"两个按钮 + 内联 exportMaxRows 输入框
 *
 * UX:
 *   - 主按钮 "导出 ▾" 点击弹 popover
 *   - popover:类型 radio(CSV/Excel)+ 行数 input(仅 Excel 有效)+ 导出按钮
 *   - CSV 选项 - 仅当前页(快,不重 fetch);Excel 选项 - 全量 + 行数限制
 *
 * 替代旧版"toolbar 上两个独立 download 按钮"+ "exportMaxRows 在 settings modal" 的分散 UX
 */
function ExportButton({
  disabled,
  exportingExcel,
  exportMaxRows,
  onChangeExportMaxRows,
  onExportCsv,
  onExportExcel,
}: {
  disabled: boolean;
  exportingExcel: boolean;
  exportMaxRows: number;
  onChangeExportMaxRows?: (n: number) => void;
  onExportCsv: () => void;
  onExportExcel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 草稿行数 — popover 内编辑,点导出时才 commit 给 callback(避免边输入边触发 dispatch)
  const [draftRows, setDraftRows] = useState<string>(String(exportMaxRows));
  useEffect(() => {
    setDraftRows(String(exportMaxRows));
  }, [exportMaxRows]);
  // 默认选 Excel(全量,更常用);若宿主没传 onExportExcel,自动落到 CSV
  const [type, setType] = useState<'csv' | 'excel'>(onExportExcel ? 'excel' : 'csv');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleExport = () => {
    if (disabled) return;
    if (type === 'excel' && onExportExcel) {
      // commit 行数(若改了)
      const n = parseInt(draftRows, 10);
      if (Number.isFinite(n) && n >= 100 && n !== exportMaxRows && onChangeExportMaxRows) {
        onChangeExportMaxRows(Math.min(n, 100000));
      }
      if (!exportingExcel) onExportExcel();
    } else {
      onExportCsv();
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="toolbar__export">
      <button
        type="button"
        className="toolbar-btn"
        data-testid="toolbar-export"
        disabled={disabled || exportingExcel}
        aria-haspopup="menu"
        aria-expanded={open}
        title="导出 — CSV(当前页)或 Excel(全量,可调行数)"
        onClick={() => setOpen((v) => !v)}
      >
        {ICON_DOWNLOAD}
        <span>{exportingExcel ? '导出中…' : '导出'}</span>
        <svg
          className="toolbar__export-caret"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
        >
          <path
            d="M1.5 3.5L5 7L8.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
      {open && (
        <div className="toolbar__export-popover" role="menu" data-testid="toolbar-export-popover">
          <div className="toolbar__export-row" role="radiogroup" aria-label="导出类型">
            <button
              type="button"
              role="radio"
              aria-checked={type === 'csv'}
              data-active={type === 'csv' ? 'true' : 'false'}
              data-testid="toolbar-export-type-csv"
              className="toolbar__export-type-btn"
              onClick={() => setType('csv')}
            >
              CSV(当前页)
            </button>
            {onExportExcel && (
              <button
                type="button"
                role="radio"
                aria-checked={type === 'excel'}
                data-active={type === 'excel' ? 'true' : 'false'}
                data-testid="toolbar-export-type-excel"
                className="toolbar__export-type-btn"
                onClick={() => setType('excel')}
              >
                Excel(全量)
              </button>
            )}
          </div>
          {type === 'excel' && (
            <div className="toolbar__export-row toolbar__export-rows">
              <label htmlFor="toolbar-export-rows-input">最大行数</label>
              <input
                id="toolbar-export-rows-input"
                type="number"
                min={100}
                max={100000}
                step={100}
                value={draftRows}
                onChange={(e) => setDraftRows(e.target.value)}
                data-testid="toolbar-export-rows-input"
                disabled={!onChangeExportMaxRows}
                title={
                  onChangeExportMaxRows
                    ? '导出 Excel 单次拉取的最大行数(100 - 100000)'
                    : '宿主未提供修改回调,只读'
                }
              />
            </div>
          )}
          <div className="toolbar__export-footer">
            <button
              type="button"
              className="toolbar__export-confirm"
              data-testid="toolbar-export-confirm"
              disabled={disabled || (type === 'excel' && exportingExcel)}
              onClick={handleExport}
            >
              {ICON_DOWNLOAD}
              <span>导出</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

