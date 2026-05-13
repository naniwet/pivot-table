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
import type { CSSProperties, ReactNode } from 'react';

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
  /** P3+ 图表类型 — 仅 displayMode='chart' 时显示选择器 */
  chartType?: 'bar' | 'line' | 'pie';
  /** P3+ 切换图表类型回调 */
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
  exportingExcel = false,
  onEnterBrowseMode,
  exportDisabled = false,
  onOpenSettings,
  displayMode = 'table',
  onToggleDisplayMode,
  chartType = 'bar',
  onChangeChartType,
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
        {/* 图表类型选择器:仅在 chart 模式 + pivot mode + 提供 onChangeChartType 时显示 */}
        {displayMode === 'chart' && queryMode !== 'adhoc' && onChangeChartType && (
          <select
            data-testid="toolbar-chart-type"
            className="toolbar-chart-type"
            value={chartType}
            onChange={(e) =>
              onChangeChartType(e.target.value as 'bar' | 'line' | 'pie')
            }
          >
            <option value="bar">柱状图</option>
            <option value="line">折线图</option>
            <option value="pie">饼图</option>
          </select>
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
        {/* 导出动作 — 终结性、低频,放设置之后(最右) */}
        <button
          type="button"
          data-testid="toolbar-export-csv"
          className="toolbar-btn"
          disabled={exportDisabled}
          title="仅导出当前页（CSV 文本格式;大数据走 Excel 全量）"
          onClick={() => {
            if (!exportDisabled) onExportCsv();
          }}
        >
          {ICON_DOWNLOAD}
          <span>导出 CSV</span>
        </button>
        {onExportExcel && (
          <button
            type="button"
            data-testid="toolbar-export-excel"
            className="toolbar-btn"
            disabled={exportDisabled || exportingExcel}
            title="导出 Excel(xlsx 全量,最大行数在设置里改;数值列保留为可计算的 Number)"
            onClick={() => {
              if (!exportDisabled && !exportingExcel) onExportExcel();
            }}
          >
            {ICON_DOWNLOAD}
            <span>{exportingExcel ? '导出中…' : '导出 Excel'}</span>
          </button>
        )}
      </div>

      <div className="toolbar__trailing" data-testid="toolbar-trailing">
        {trailingSlot}
      </div>
    </div>
  );
}
