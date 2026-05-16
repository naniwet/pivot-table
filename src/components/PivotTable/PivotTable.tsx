/**
 * PivotTable — 顶层粘合组件
 *
 * 把所有零件按 PRD 场景 B 的数据流粘合：
 *   FieldTree (drag start)
 *      │
 *   DropZones (drop / remove)
 *      │
 *   useViewConfig dispatch ──→ viewConfig
 *      │                           │
 *      │                       buildQuery → query
 *      │                           │
 *      │                       usePivotQuery → cellSet/loading/error
 *      │                           │
 *      │                       parseCellSet → renderModel
 *      │                           │
 *   PivotRenderer ←──────────────┘ (drill / sort)
 *   Pagination ←────────────────── (page change)
 *   Toolbar ←─────────────────────  (refresh / export CSV)
 *
 * 设计要点：
 *   - 保持 PivotTable 是"接线层"：只 wire 子组件，不放业务逻辑
 *   - draggingFieldType 由本组件维护（FieldTree 只 fire onFieldDragStart 通知），
 *     document-level dragend 监听用于"拖出 zone 后清状态"
 *   - CSV 下载在浏览器侧（Blob + URL.createObjectURL + 隐式 <a download>）
 *   - 嵌入宿主只需传 metadata + onQuery + 可选 defaultValue/value/onChange
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { renderModelToCsv } from '../../core/export/csvExport.js';
import { renderModelToXlsxBlob } from '../../core/export/xlsxExport.js';
import type { DropZone, FieldType } from '../../core/dropRules/dropRules.js';
import { buildQueryFor } from '../../core/queryBuilder/buildQueryFor.js';
import { canViewDetail } from '../../core/drillThrough/buildDetailQuery.js';
import { parseCellSet } from '../../core/cellSetParser/parseCellSet.js';
import { isNumericValueType } from '../../core/metadata/fieldDisplayType.js';
import { computeViewMode } from '../../core/viewMode/viewMode.js';
import { useAvailableFields } from '../../hooks/useAvailableFields.js';
import { useCellMenu } from '../../hooks/useCellMenu.js';
import { useColumnHeaderMenu } from '../../hooks/useColumnHeaderMenu.js';
import { useFieldMenu } from '../../hooks/useFieldMenu.js';
import { useMemberContextMenu } from '../../hooks/useMemberContextMenu.js';
import { usePivotQuery } from '../../hooks/usePivotQuery.js';
import { useScrollPivotQuery } from '../../hooks/useScrollPivotQuery.js';
import { useRowFieldLabels } from '../../hooks/useRowFieldLabels.js';
import { useTagMenu } from '../../hooks/useTagMenu.js';
import { useTreeQueries } from '../../hooks/useTreeQueries.js';
import { useViewConfig } from '../../hooks/useViewConfig.js';
import type { CellSet } from '../../types/cellSet.js';
import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';
import type { ViewConfig } from '../../types/viewConfig.js';

import { ContextMenu } from '../ContextMenu/ContextMenu.js';
import { SettingsModal } from '../SettingsModal/SettingsModal.js';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary.js';
import { DropZones } from '../DropZones/DropZones.js';
import { ConditionalFormatModal } from '../ConditionalFormatModal/ConditionalFormatModal.js';
import { EnumGroupEditor } from '../EnumGroupEditor/EnumGroupEditor.js';
import { FieldExpressionEditor } from '../FieldExpressionEditor/FieldExpressionEditor.js';
import { FieldTree } from '../FieldTree/FieldTree.js';
import type { FieldContextMenuEvent, FieldTreeMode } from '../FieldTree/FieldTree.js';
import { FilterPanel } from '../FilterPanel/FilterPanel.js';
import { Pagination } from '../Pagination/Pagination.js';
import { DetailRenderer } from '../DetailRenderer/DetailRenderer.js';
import { PivotRenderer } from '../PivotRenderer/PivotRenderer.js';
import { TreeRenderer } from '../TreeRenderer/TreeRenderer.js';
import { ChartRenderer } from '../ChartRenderer/ChartRenderer.js';
import { buildChartSeries } from '../../core/chart/buildChartSeries.js';
import { DetailModal } from '../DetailModal/DetailModal.js';
import { RangeGroupEditor } from '../RangeGroupEditor/RangeGroupEditor.js';
import { Toolbar } from '../Toolbar/Toolbar.js';

import { canDrop } from '../../core/dropRules/dropRules.js';
import {
  encodePivotField,
  PIVOT_FIELD_MIME,
} from '../../core/dropRules/dragProtocol.js';
import { buildMetadataIndex } from '../../core/metadata/fieldIndex.js';
// quickCalcs / aggregators 现在仅在 hook 内部使用(useTagMenu / useFieldMenu)
import { detectAllTimeAxes, detectTimeAxis } from '../../core/timeAxis/detectTimeAxis.js';
import { computeFieldUsage } from '../../core/viewConfig/fieldUsage.js';
import type {
  ClientFilter,
  ClientMeasureFilter,
  CustomField,
} from '../../types/viewConfig.js';

export interface PivotTableProps {
  metadata: Metadata;
  /** 后端查询入口；签名带 ctx 支持 ADR-011 取消 */
  onQuery: (query: Query, ctx: { signal: AbortSignal }) => Promise<CellSet>;
  /** 受控模式：完全由宿主管理 viewConfig */
  value?: ViewConfig;
  /** 非受控模式初值；默认空 viewConfig */
  defaultValue?: ViewConfig;
  /** 任何 viewConfig 变化都会调用 */
  onChange?: (next: ViewConfig) => void;
  /**
   * 可选：异步加载某字段的全部 distinct 成员（用于 In/NotIn 成员选择器，P1.5）
   * 不传则成员选择按钮隐藏；用户回退到逗号分隔手输入。
   * 宿主可用 SmartbiClient.executeQuery 实现：把 field 单独作为 row 跑一次查询取 distinct。
   */
  loadMembers?: (field: string) => Promise<string[]>;
  /** P1.0: 单元格点击事件（宿主联动） */
  onCellClick?: (info: {
    rowIndex: number;
    colIndex: number;
    rowPath: string[];
    columnFieldName: string;
    value: unknown;
  }) => void;
  /** P1.5: 单元格右键事件（宿主自定义菜单等）；不传时组件保留默认 TSV 复制 */
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
  /** P1.5: 列头冻结 — 默认 true */
  freezeHeader?: boolean;
  /** P1.5: 行头列冻结 — 默认 true */
  freezeRowHeader?: boolean;
  /**
   * P3: DrillThrough 钻取明细 — 用户单元格右键 → "查看明细" → 组件构造 DetailQuery → 此回调
   *   宿主收到 query 后通常用同一 onQuery 通道发请求,自己渲染明细列表(组件不内置明细 UI)
   *   不传 → 单元格右键菜单不显示"查看明细"项
   */
  onDrillThrough?: (query: Query) => void;
  /**
   * P3: 能力开关。drillThrough=false 显式关闭(即使传了 onDrillThrough);默认 true
   */
  features?: {
    drillThrough?: boolean;
  };
  /**
   * 工具栏右侧动态插槽 — 宿主可放任意 React 节点(数据源切换器 / 上下文 picker)。
   * 不传则右侧空,工具栏按钮自然居中。Demo 用此 slot 放 SmartbiConfigManager。
   */
  headerTrailing?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * P5+ 顶层 PivotTable 包了 ErrorBoundary,捕获子树渲染时的运行时错误
 *(parseCellSet schema 不匹配 / 代码 bug 等),fallback 默认显示 SmartbiError 友好消息。
 *
 * 业务错误流(usePivotQuery 设 state,显示 retry banner)不走 ErrorBoundary —
 * 那些是已 catch 的 promise rejection,不会 throw 到 React 树。
 */
export function PivotTable(props: PivotTableProps): ReactNode {
  return (
    <ErrorBoundary>
      <PivotTableInner {...props} />
    </ErrorBoundary>
  );
}

/** 触发浏览器下载 — Blob → object URL → 隐式 <a download> click */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PivotTableInner({
  metadata,
  onQuery,
  value,
  defaultValue,
  onChange,
  loadMembers,
  onCellClick,
  onCellRightClick,
  onDrillThrough,
  features,
  freezeHeader,
  freezeRowHeader,
  headerTrailing,
  className,
  style,
}: PivotTableProps): ReactNode {
  const [viewConfig, dispatch, history] = useViewConfig({ value, defaultValue, onChange, metadata });
  const metaIndex = useMemo(() => buildMetadataIndex(metadata), [metadata]);

  // 行表头 corner 显示的字段 alias(给 PivotRenderer / TreeRenderer 用)
  const rowFieldLabels = useRowFieldLabels(viewConfig, metaIndex);
  const timeAxis = useMemo(() => detectTimeAxis(viewConfig, metadata), [viewConfig, metadata]);
  // 多时间字段时,quickCalc 时间智能项要让用户选按哪个 axis 算 — 给菜单展开 submenu 用
  const allTimeAxes = useMemo(
    () => detectAllTimeAxes(viewConfig, metadata),
    [viewConfig, metadata],
  );
  const [draggingFieldType, setDraggingFieldType] = useState<FieldType | null>(null);
  // 字段树右键菜单状态：null 表示未弹出
  const [fieldMenu, setFieldMenu] = useState<FieldContextMenuEvent | null>(null);
  // P2: chip 右键菜单状态（zone 内字段操作：排序 / 移动 / 快计 / 删除）
  const [tagMenu, setTagMenu] = useState<{
    zone: DropZone;
    fieldName: string;
    fieldType: FieldType;
    x: number;
    y: number;
  } | null>(null);

  // P3: 单元格右键菜单状态(钻取明细等)— 仅在宿主未自定 onCellRightClick 时启用
  const [cellMenu, setCellMenu] = useState<{
    rowIndex: number;
    colIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // P5+ 字段级表头右键菜单(adhoc 列头 / pivot corner / pivot 度量列头 共用)
  // sortKind 区分:'ByDimension'(adhoc 列头 / pivot corner)/ 'ByMeasure'(pivot 度量列头)
  const [columnHeaderMenu, setColumnHeaderMenu] = useState<{
    fieldName: string;
    sortKind: 'ByDimension' | 'ByMeasure';
    x: number;
    y: number;
  } | null>(null);

  // P5+ pivot 行/列头**成员**级右键菜单(In/NotIn 过滤);跟字段级 columnHeaderMenu 互斥用
  const [memberContextMenu, setMemberContextMenu] = useState<{
    fieldName: string;
    memberName: string;
    x: number;
    y: number;
  } | null>(null);

  // P2 双击规则 / P5+ checkbox 勾选规则:
  //   - 度量类(Measure / CalcMeasure / UserCalcMeasure)→ value
  //   - 维度类(Dimension / Hierarchy / CalcGroup / NamedSet / EnumGroup / RangeGroup / CalcColumn)→ row
  //   - MeasureGroupName 不双击(虚拟字段,只手动拖)
  //   - adhoc 模式:任何可拖字段都落 row(adhoc 没 value 区)
  const handleFieldDoubleClick = (fieldName: string, fieldType: FieldType) => {
    const adhoc = viewConfig.queryMode === 'adhoc';
    let zone: DropZone;
    if (adhoc) {
      zone = 'row';
    } else if (
      fieldType === 'Measure' ||
      fieldType === 'CalcMeasure' ||
      fieldType === 'UserCalcMeasure'
    ) {
      zone = 'value';
    } else if (
      fieldType === 'Dimension' ||
      fieldType === 'Hierarchy' ||
      fieldType === 'CalcGroup' ||
      fieldType === 'NamedSet' ||
      fieldType === 'EnumGroup' ||
      fieldType === 'RangeGroup' ||
      fieldType === 'CalcColumn'
    ) {
      zone = 'row';
    } else {
      // MeasureGroupName 等虚拟字段不参与双击 / checkbox 路由
      return;
    }
    if (!canDrop(fieldType, zone, adhoc ? 'adhoc' : 'pivot')) return;
    dispatch({ type: 'DROP_FIELD', zone, fieldName, fieldType });
  };
  // 字段树搜索框：纯 UI state，FieldTree 已有 alias 子串过滤逻辑
  const [fieldSearch, setFieldSearch] = useState('');
  // P3+ 字段树视图模式 — 'multi'(多维,默认) / 'table'(按数据表分组)
  const [fieldTreeMode, setFieldTreeMode] = useState<FieldTreeMode>('multi');

  // P5 树状模式 — 展开的 path key 集合(只在组件本地持有,不入 viewConfig)
  // 切到树状模式 → 用 useTreeQueries 编排多 branch 查询
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(() => new Set());
  const toggleTreePath = (key: string) => {
    setExpandedTreePaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isTreeMode = viewConfig.pageState.displayMode === 'tree';
  // 树状模式仅在 row dim 有效 + 非 Hierarchy + pivot 模式 时可用;否则 fallback
  // adhoc 模式不支持树状(明细查询本身就是平铺,没有"展开/折叠"语义)
  const treeModeUsable =
    isTreeMode &&
    viewConfig.queryMode !== 'adhoc' &&
    viewConfig.rows.length > 0 &&
    viewConfig.rows.every((r) => r.type !== 'Hierarchy') &&
    viewConfig.values.length > 0;
  const treeQueriesResult = useTreeQueries({
    viewConfig,
    metadata,
    onQuery,
    expanded: expandedTreePaths,
    enabled: treeModeUsable,
  });

  // P2: "+ 新建字段" 编辑器开关 — null 表示未打开；'expr'/'enum'/'range' 三种类型
  const [editorOpen, setEditorOpen] = useState<null | {
    kind: 'expr' | 'enum' | 'range';
    initialField?: CustomField;
    baseField?: string;
    baseFieldAlias?: string;
  }>(null);

  // P3: 分组/范围 编辑器要先选 base field — picker 状态(null = 未打开)
  // 度量(formula 式)不需要选 base field,直接 setEditorOpen
  const [baseFieldPicker, setBaseFieldPicker] = useState<null | {
    kind: 'enum' | 'range';
  }>(null);
  // base field picker 内的搜索框 — 按 alias / name 子串过滤
  const [baseFieldSearch, setBaseFieldSearch] = useState('');

  // P3 设置面板:点 toolbar "⚙ 设置" 按钮打开
  const [settingsOpen, setSettingsOpen] = useState(false);

  // P5+ 三面板可见性 — 工具栏 / 字段面板(中间设置列) / 字段树(右侧数据列)
  // 默认全可见;用户在 panel header 点 × 或 settings 里切换 checkbox 可独立收起
  // localStorage 持久化(UI 偏好,不进 viewConfig)
  const [panelVisibility, setPanelVisibility] = useState<{
    toolbar: boolean;
    fieldPanel: boolean;
    fieldTree: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem('pivot-table-panel-visibility');
      if (!raw) return { toolbar: true, fieldPanel: true, fieldTree: true };
      const p = JSON.parse(raw) as Partial<{ toolbar: boolean; fieldPanel: boolean; fieldTree: boolean }>;
      return {
        toolbar: p.toolbar !== false,
        fieldPanel: p.fieldPanel !== false,
        fieldTree: p.fieldTree !== false,
      };
    } catch {
      return { toolbar: true, fieldPanel: true, fieldTree: true };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('pivot-table-panel-visibility', JSON.stringify(panelVisibility));
    } catch {
      // localStorage 不可用(SSR / 隐私模式)→ 静默忽略
    }
  }, [panelVisibility]);
  const togglePanel = (key: 'toolbar' | 'fieldPanel' | 'fieldTree', next?: boolean) =>
    setPanelVisibility((prev) => ({ ...prev, [key]: next ?? !prev[key] }));

  // P5+ 浏览模式 — 沉浸式只看表格 / 图表:
  //   - 工具栏 / 字段面板 / 字段树 / 过滤条件区 全隐藏
  //   - 边缘 handles 也不渲染(浏览态不留 expand 入口,保持视觉极简)
  //   - 分页器 强制走 scroll(触底自动加载)
  //   - 主区右上角浮一个"× 退出浏览"按钮 + Esc 快捷键
  // 状态故意不进 localStorage(刷新自然退出,避免用户被困;UI pref 太短期)
  const [browseMode, setBrowseMode] = useState(false);
  useEffect(() => {
    if (!browseMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBrowseMode(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [browseMode]);

  // P5+ 撤销 / 重做 快捷键 — Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z (或 Cmd/Ctrl+Y) = redo
  // input / textarea / contentEditable 聚焦时不拦截,让浏览器原生 undo 工作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'z' && e.key !== 'Z' && e.key !== 'y' && e.key !== 'Y') return;
      // 在编辑控件里 → 走浏览器原生(input/textarea undo stack)
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      // Cmd/Ctrl+Shift+Z 或 Cmd/Ctrl+Y → redo
      const isRedo =
        (e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        e.key === 'y' ||
        e.key === 'Y';
      e.preventDefault();
      if (isRedo) {
        if (history.canRedo) history.redo();
      } else {
        if (history.canUndo) history.undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [history]);

  // P3+ 明细 modal:点 toolbar "📋 明细" / 单元格右键"查看明细"(宿主未传 onDrillThrough 时)
  // null = 关闭;非 null = 打开,持有该次明细查询 + 上下文 chip(给用户看"我在看哪个切片")
  const [detailContext, setDetailContext] = useState<{
    query: Query;
    chips: string[];
  } | null>(null);

  // 全局 dragend：拖到任何位置（包括取消）后统一清状态
  useEffect(() => {
    const handler = () => setDraggingFieldType(null);
    document.addEventListener('dragend', handler);
    return () => document.removeEventListener('dragend', handler);
  }, []);

  // P5+ 派生 mode flag(单源 — computeViewMode);避免散乱 grep viewConfig.queryMode / displayMode
  // useTagMenu / DropZones 等都消费它;adapter 化思路,加新 mode 改 viewMode.ts 一处
  const viewMode = useMemo(() => computeViewMode(viewConfig), [viewConfig]);
  const isAdhoc = viewMode.isAdhoc;

  // 按 mode 分发到对应 builder(adhoc → DetailQuery,pivot → PivotQuery)
  const query = useMemo<Query | null>(
    () => buildQueryFor(viewConfig, metadata, viewConfig.pageState),
    [viewConfig, metadata],
  );

  // P5+ 翻页 UI 模式 — paged 走 usePivotQuery(L0 cache + 熔断);scroll 走 useScrollPivotQuery(累积)
  // 两个 hook 始终调用(React rules of hooks),仅给"激活"那个非 null query;另一个 query=null 自动 idle
  // 浏览模式下强制 scroll(沉浸视图就是要触底自动加载,没分页栏)
  const isScrollMode = browseMode || viewConfig.pageState.paginationMode === 'scroll';
  const pagedResult = usePivotQuery({ query: isScrollMode ? null : query, onQuery });
  const scrollResult = useScrollPivotQuery({ query: isScrollMode ? query : null, onQuery });
  const cellSet = isScrollMode ? scrollResult.data : pagedResult.data;
  const loading = isScrollMode ? scrollResult.loading : pagedResult.loading;
  const error = isScrollMode ? scrollResult.error : pagedResult.error;
  const refetch = isScrollMode ? scrollResult.refetch : pagedResult.refetch;
  const hasMore = isScrollMode ? scrollResult.hasMore : false;
  const onLoadMore = isScrollMode ? scrollResult.loadMore : undefined;
  // loadingMore = scroll 模式下 已经有累积数据 + 正在 fetch 下一页(区别于"首次加载"这种 loading)
  const loadingMore = isScrollMode && cellSet !== null && scrollResult.loading;

  const renderModel = useMemo(
    () => (cellSet ? parseCellSet(cellSet, viewConfig, metadata) : null),
    [cellSet, viewConfig, metadata],
  );

  const handleSortClick = (
    fieldName: string,
    kind: 'ByMeasure' | 'ByDimension' = 'ByMeasure',
    options?: { multi?: boolean; mode?: 'global' | 'group' },
  ) => {
    dispatch({
      type: 'CYCLE_ROW_SORT',
      fieldName,
      kind,
      multi: options?.multi === true,
      mode: options?.mode,
    });
  };

  const handleDrillDown = (hierarchyFieldName: string) => {
    dispatch({ type: 'DRILL_DOWN', fieldName: hierarchyFieldName });
  };

  const handleDrillUp = (hierarchyFieldName: string) => {
    dispatch({ type: 'DRILL_UP', fieldName: hierarchyFieldName });
  };

  const handlePageChange = (pageNo: number) => {
    dispatch({ type: 'SET_ROW_PAGE', pageNo });
  };

  const handleColumnPageChange = (pageNo: number) => {
    dispatch({
      type: 'SET',
      viewConfig: { ...viewConfig, pageState: { ...viewConfig.pageState, columnPageNo: pageNo } },
    });
  };

  const handleRowPageSizeChange = (size: number) => {
    dispatch({
      type: 'SET',
      viewConfig: {
        ...viewConfig,
        pageState: { ...viewConfig.pageState, rowPageSize: size, rowPageNo: 1 },
      },
    });
  };

  const handleColumnPageSizeChange = (size: number) => {
    dispatch({
      type: 'SET',
      viewConfig: {
        ...viewConfig,
        pageState: { ...viewConfig.pageState, columnPageSize: size, columnPageNo: 1 },
      },
    });
  };

  const handleDrop = (
    zone: DropZone,
    fieldName: string,
    fieldType: FieldType,
    insertIdx?: number,
    extra?: { sourceZone?: DropZone; chipKey?: string },
  ) => {
    dispatch({
      type: 'DROP_FIELD',
      zone,
      fieldName,
      fieldType,
      insertIdx,
      sourceZone: extra?.sourceZone,
      chipKey: extra?.chipKey,
    });
    setDraggingFieldType(null);
  };

  const handleRemove = (zone: DropZone, fieldName: string, chipIdx?: number) => {
    // P5+ chipIdx 给 value zone duplicate chip 精确定位用,reducer 优先按 idx 删;
    // row/column/filter zone 字段名唯一,chipIdx 在 reducer 内被忽略(走老逻辑)
    dispatch({ type: 'REMOVE_FIELD', zone, fieldName, chipIdx });
  };

  // P5+ FieldTree checkbox 切换逻辑(opt-in:fieldUsage + onFieldToggle 必须配对传给 FieldTree)
  // 状态机:
  //   - usage=0 → 走双击路由(智能加进 row/value)
  //   - usage=1 → 找到那个 zone,调 REMOVE_FIELD
  //   - usage>=2 → noop(FieldTree 已经 disable checkbox,这里防御)
  const fieldUsage = useMemo(() => computeFieldUsage(viewConfig), [viewConfig]);
  const handleFieldToggle = (fieldName: string, fieldType: FieldType) => {
    const count = fieldUsage.get(fieldName) ?? 0;
    if (count === 0) {
      handleFieldDoubleClick(fieldName, fieldType);
      return;
    }
    if (count >= 2) return; // 多 zone 防御
    // count === 1: 顺序找哪个 zone 命中
    if (viewConfig.rows.some((r) => r.fieldName === fieldName)) {
      handleRemove('row', fieldName);
    } else if (viewConfig.columns.some((c) => c.fieldName === fieldName)) {
      handleRemove('column', fieldName);
    } else if (viewConfig.values.some((v) => v.measureName === fieldName)) {
      handleRemove('value', fieldName);
    } else {
      // 在 filters 或 measureFilters 树里 — handleRemove('filter', name) 会同时裁两棵树
      handleRemove('filter', fieldName);
    }
  };

  // P2 重构：chip 操作（排序 / 移动 / quickCalc / 删除）统一走 chip 右键菜单
  // handleMove / handleSetQuickCalc 不再作为 DropZones prop 透传；菜单内 dispatch
  // 直接使用 MOVE_FIELD / SET_VALUE_QUICK_CALC action

  // P2 自建字段
  const handleAddCustomField = (field: CustomField) => {
    dispatch({ type: 'ADD_CUSTOM_FIELD', field });
  };
  const handleRemoveCustomField = (id: string) => {
    dispatch({ type: 'REMOVE_CUSTOM_FIELD', id });
  };

  // P2 自建字段:可用字段集合(度量 + 维度;给 editor / picker 用)
  // physicalColumns 是 metadata.fields[].name,calc_column 表达式校验用
  const { availableFields, dimensionFields, numericDimensionFields, physicalColumns } =
    useAvailableFields(metadata);

  const handleChangeFilters = (filters: ClientFilter[]) => {
    dispatch({ type: 'SET_FILTERS', filters });
  };

  const handleChangeMeasureFilters = (measureFilters: ClientMeasureFilter[]) => {
    dispatch({ type: 'SET_MEASURE_FILTERS', measureFilters });
  };

  // 字段树右键 → 弹菜单
  const handleFieldContextMenu = (e: FieldContextMenuEvent) => {
    setFieldMenu(e);
  };
  const closeFieldMenu = () => setFieldMenu(null);

  // 字段树右键菜单 items(挪到 useFieldMenu 里实现)
  const fieldMenuItems = useFieldMenu({ fieldMenu, isAdhoc, metaIndex, dispatch });

  // P2: chip 右键菜单（zone 内字段操作）— 多级菜单:排序 ▶ / 位置 ▶ / 快速计算 ▶ / 移除
  const closeTagMenu = () => setTagMenu(null);

  // P5+ 条件格式化 modal:null 关闭,object 含 measure 名 + 当前 mode(透视/明细 隔离规则)
  const [condFormatTarget, setCondFormatTarget] = useState<
    { measure: string; mode: 'pivot' | 'adhoc' } | null
  >(null);

  // chip 右键菜单 items(挪到 useTagMenu 里实现)
  const tagMenuItems = useTagMenu({
    tagMenu, viewConfig, metaIndex, timeAxis, allTimeAxes, viewMode, dispatch,
    onOpenConditionalFormat: (m) => {
      // mode 跟当前 viewMode 一致:
      //   pivot 模式 → 数值区 chip 触发,m 是 measureName
      //   adhoc 模式 → 行区数值 chip 触发,m 是 fieldName
      setCondFormatTarget({ measure: m, mode: isAdhoc ? 'adhoc' : 'pivot' });
      closeTagMenu();
    },
  });

  // P3: 单元格右键菜单项 — 目前唯一项是"查看明细",未来可加"复制 TSV" / "高亮所在行列" 等
  const closeCellMenu = () => setCellMenu(null);
  // drillThrough 启用条件:
  //   - features 没显式关
  //   - 没有自建字段(后端 DetailQuery 不支持 customElements)
  //   - 不在 adhoc 模式(adhoc 本身就是明细,再"查看明细"无意义)
  const drillThroughEnabled =
    features?.drillThrough !== false && !isAdhoc && canViewDetail(viewConfig);
  // 单元格右键菜单 items(挪到 useCellMenu 里实现 — chip 摘要逻辑也在 hook 内)
  const cellMenuItems = useCellMenu({
    cellMenu,
    drillThroughEnabled,
    cellSet,
    viewConfig,
    metadata,
    metaIndex,
    onDrillThrough,
    onSetDetailContext: setDetailContext,
  });

  // P5+ 字段级表头右键菜单 items — 抽到 useColumnHeaderMenu hook 实现
  // 适用:adhoc 列头 / pivot corner / pivot 度量列头(都是字段级,只做排序+复制)
  // adhoc 数值列额外渲染"条件格式化…" — hook 内部按 valueType 判断,这里只传 callback
  const columnHeaderMenuItems = useColumnHeaderMenu({
    columnHeaderMenu,
    viewConfig,
    metaIndex,
    dispatch,
    onOpenConditionalFormat: isAdhoc
      ? (fieldName) => {
          setCondFormatTarget({ measure: fieldName, mode: 'adhoc' });
          setColumnHeaderMenu(null);
        }
      : undefined,
  });

  // P5+ adhoc 条件格式化:viewConfig.rows 里哪些 fieldName 是数值类
  // 在 PivotTable 层算一次,DetailRenderer 内部不重复查 metaIndex
  const adhocNumericFieldNames = useMemo(() => {
    if (!isAdhoc) return undefined;
    const out = new Set<string>();
    for (const r of viewConfig.rows) {
      if (isNumericValueType(metaIndex.findByName(r.fieldName)?.valueType ?? null)) {
        out.add(r.fieldName);
      }
    }
    return out;
  }, [isAdhoc, viewConfig.rows, metaIndex]);

  // P5+ 行/列头成员级右键菜单 items(In/NotIn 过滤)
  const memberContextMenuItems = useMemberContextMenu({
    memberContextMenu,
    filters: viewConfig.filters,
    metaIndex,
    onChangeFilters: handleChangeFilters,
  });

  // P5+ PivotRenderer 表头右键菜单路由 — 根据 ev.type 分发到字段级 vs 成员级 menu state
  // 互斥:某个菜单打开时,另一个先清掉
  const handleHeaderContextMenu: React.ComponentProps<
    typeof PivotRenderer
  >['onHeaderContextMenu'] = (ev) => {
    if (ev.type === 'corner') {
      setMemberContextMenu(null);
      setColumnHeaderMenu({ fieldName: ev.fieldName, sortKind: 'ByDimension', x: ev.x, y: ev.y });
    } else if (ev.type === 'col-measure') {
      setMemberContextMenu(null);
      setColumnHeaderMenu({ fieldName: ev.measureName, sortKind: 'ByMeasure', x: ev.x, y: ev.y });
    } else {
      // col-member / row-member 都走成员级菜单
      setColumnHeaderMenu(null);
      setMemberContextMenu({ fieldName: ev.fieldName, memberName: ev.memberName, x: ev.x, y: ev.y });
    }
  };

  /**
   * 单元格右键路由:
   *   - 宿主提供 onCellRightClick → 完全交宿主(老行为,P1.5)
   *   - 否则若 drillThrough 启用 → 弹组件内置菜单(P3 "查看明细")
   *   - 否则 PivotRenderer 自己 fallback 到 TSV 复制
   */
  const handleCellRightClick: typeof onCellRightClick = onCellRightClick
    ? onCellRightClick
    : drillThroughEnabled
      ? (info) => setCellMenu({
          rowIndex: info.rowIndex,
          colIndex: info.colIndex,
          x: info.x,
          y: info.y,
        })
      : undefined;

  // P5+ "整体明细"功能已废弃 — 改用 viewConfig.queryMode='adhoc' 内联切换(见 Toolbar.onToggleQueryMode)。
  // 单元格右键"查看明细"仍走 buildDetailQuery 弹 DetailModal(在 cellMenuItems 里)

  const handleExportCsv = () => {
    if (!renderModel) return;
    const csv = renderModelToCsv(renderModel);
    // BOM for Excel UTF-8 compatibility
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, `pivot-${Date.now()}.csv`);
  };

  // P5+ 全量 Excel 导出(场景 4)— 重 fetch 一次"大页"再写 xlsx
  // 不修改 viewConfig.pageState(避免污染 UI 状态);构造一个临时 Query 直接调 onQuery
  const [exportingExcel, setExportingExcel] = useState(false);
  // 失败用内联 banner(顶部 toolbar 下方),非阻塞;5 秒后自动消失
  const [exportError, setExportError] = useState<string | null>(null);
  useEffect(() => {
    if (!exportError) return;
    const t = setTimeout(() => setExportError(null), 5000);
    return () => clearTimeout(t);
  }, [exportError]);
  const handleExportExcel = async () => {
    if (!query) return;
    const maxRows = viewConfig.pageState.exportMaxRows ?? 10000;
    setExportingExcel(true);
    try {
      const exportQuery: Query = {
        ...query,
        pageSettings: {
          ...query.pageSettings,
          rowPageNo: 1,
          rowPageSize: maxRows,
        },
      };
      // 临时 AbortController(导出动作目前不暴露取消入口;失败由 catch 兜住)
      const cellSet = await onQuery(exportQuery, { signal: new AbortController().signal });
      const fullModel = parseCellSet(cellSet, viewConfig, metadata);
      const blob = renderModelToXlsxBlob(fullModel);
      triggerDownload(blob, `pivot-${Date.now()}.xlsx`);
    } catch (e) {
      console.error('[PivotTable] export Excel failed:', e);
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div
      className={className ? `pivot-table ${className}` : 'pivot-table'}
      data-testid="pivot-table"
      data-toolbar-visible={panelVisibility.toolbar && !browseMode ? 'true' : 'false'}
      data-field-panel-visible={panelVisibility.fieldPanel && !browseMode ? 'true' : 'false'}
      data-field-tree-visible={panelVisibility.fieldTree && !browseMode ? 'true' : 'false'}
      data-browse-mode={browseMode ? 'true' : 'false'}
      style={style}
    >
      {/* 导出失败 banner — 顶部浮动,5 秒自动消失;点 × 立即关 */}
      {exportError && (
        <div className="pivot-table__export-error-banner" data-testid="export-error-banner" role="alert">
          <span className="pivot-table__export-error-icon" aria-hidden>⚠</span>
          <span className="pivot-table__export-error-text">导出 Excel 失败:{exportError}</span>
          <button
            type="button"
            className="pivot-table__export-error-close"
            aria-label="关闭"
            onClick={() => setExportError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* 浏览模式下右上角浮动"退出浏览" — 唯一可见的逃生口 */}
      {browseMode && (
        <button
          type="button"
          className="pivot-table__browse-exit"
          data-testid="browse-mode-exit"
          title="退出浏览模式 (Esc)"
          aria-label="退出浏览模式"
          onClick={() => setBrowseMode(false)}
        >
          ✕ 退出浏览
        </button>
      )}

      {/* 收起后的边缘 handle — 浮在主区表面,提供"重新展开"入口
          浏览模式下不渲染(沉浸视图保持极简,只能通过右上角退出按钮回到正常态) */}
      {!panelVisibility.toolbar && !browseMode && (
        <button
          type="button"
          className="pivot-table__edge-handle pivot-table__edge-handle--top"
          data-testid="edge-handle-toolbar"
          title="显示工具栏"
          aria-label="显示工具栏"
          onClick={() => togglePanel('toolbar', true)}
        >
          ▼
        </button>
      )}
      {!panelVisibility.fieldPanel && !browseMode && (
        <button
          type="button"
          className="pivot-table__edge-handle pivot-table__edge-handle--field-panel"
          data-testid="edge-handle-field-panel"
          title="显示字段面板"
          aria-label="显示字段面板"
          onClick={() => togglePanel('fieldPanel', true)}
        >
          <span className="pivot-table__edge-handle-arrow" aria-hidden>◀</span>
          <span className="pivot-table__edge-handle-label">字段面板</span>
        </button>
      )}
      {!panelVisibility.fieldTree && !browseMode && (
        <button
          type="button"
          className="pivot-table__edge-handle pivot-table__edge-handle--field-tree"
          data-testid="edge-handle-field-tree"
          title="显示字段树"
          aria-label="显示字段树"
          onClick={() => togglePanel('fieldTree', true)}
        >
          <span className="pivot-table__edge-handle-arrow" aria-hidden>◀</span>
          <span className="pivot-table__edge-handle-label">字段树</span>
        </button>
      )}

      {/* 顶部工具栏,跨 3 列 — panelVisibility.toolbar=false 时不渲染(grid 行高也归零)
          浏览模式下也不渲染 */}
      {panelVisibility.toolbar && !browseMode && (
      <div className="pivot-table__toolbar">
        <Toolbar
          trailingSlot={headerTrailing}
          onRefresh={refetch}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          exportingExcel={exportingExcel}
          onEnterBrowseMode={() => setBrowseMode(true)}
          exportDisabled={!renderModel}
          onOpenSettings={() => setSettingsOpen(true)}
          displayMode={
            // Toolbar 的 chart toggle 只识别 'table'/'chart';tree 模式当 'table' 显示
            // (用户在 tree 模式点 chart toggle → 切到 chart)
            viewConfig.pageState.displayMode === 'chart' ? 'chart' : 'table'
          }
          onToggleDisplayMode={() =>
            dispatch({
              type: 'SET_DISPLAY_MODE',
              displayMode:
                viewConfig.pageState.displayMode === 'chart' ? 'table' : 'chart',
            })
          }
          chartType={viewConfig.pageState.chartType ?? 'bar'}
          onChangeChartType={(type) =>
            dispatch({ type: 'SET_DISPLAY_MODE', chartType: type })
          }
          queryMode={viewConfig.queryMode ?? 'pivot'}
          onToggleQueryMode={() =>
            dispatch({
              type: 'SET_QUERY_MODE',
              mode: viewConfig.queryMode === 'adhoc' ? 'pivot' : 'adhoc',
            })
          }
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
        />
      </div>
      )}
      {/* 主区：过滤条件 + 表格 + 翻页（最宽列，左侧） */}
      <div className="pivot-table__main">
        {/* 浏览模式下条件区也隐藏 — 沉浸视图只看数据 */}
        {!browseMode && (
          <FilterPanel
            viewConfig={viewConfig}
            metadata={metadata}
            onChangeFilters={handleChangeFilters}
            onChangeMeasureFilters={handleChangeMeasureFilters}
            loadMembers={loadMembers}
          />
        )}
        {isAdhoc ? (
          // P5+ 即席查询(明细)模式:走 DetailRenderer 平铺表
          <DetailRenderer
            renderModel={renderModel}
            viewConfig={viewConfig}
            loading={loading}
            error={error}
            onSortClick={(fieldName, opts) =>
              handleSortClick(fieldName, 'ByDimension', { multi: opts?.multi })
            }
            onRetry={refetch}
            rowFieldLabels={rowFieldLabels}
            freezeHeader={freezeHeader ?? viewConfig.pageState.freezeHeader ?? true}
            onColumnContextMenu={(info) =>
              setColumnHeaderMenu({ ...info, sortKind: 'ByDimension' })
            }
            // P5+ 条件格式化:adhoc 仅数值列适用;按 viewConfig.rows 顺序解析 valueType
            numericFieldNames={adhocNumericFieldNames}
          />
        ) : viewConfig.pageState.displayMode === 'chart' ? (
          // P3+ 图表模式:不渲染 PivotRenderer 表格,改用 ChartRenderer
          <ChartRenderer
            data={
              renderModel
                ? buildChartSeries({
                    model: renderModel,
                    chartType: viewConfig.pageState.chartType ?? 'bar',
                  })
                : { type: 'bar', xAxis: [], series: [] }
            }
            loading={loading}
            error={error}
            height={500}
          />
        ) : treeModeUsable ? (
          // P5 树状模式:per-branch lazy query;走独立 pipeline 不复用 renderModel
          <TreeRenderer
            branches={treeQueriesResult.branches}
            expanded={expandedTreePaths}
            onToggle={toggleTreePath}
            onRetry={treeQueriesResult.retryBranch}
            maxDepth={viewConfig.rows.length}
            viewConfig={viewConfig}
            onSortClick={handleSortClick}
            rowFieldLabels={rowFieldLabels}
          />
        ) : (
          <PivotRenderer
            renderModel={renderModel}
            viewConfig={viewConfig}
            loading={loading}
            error={error}
            onSortClick={handleSortClick}
            onDrillDown={handleDrillDown}
            onDrillUp={handleDrillUp}
            onRetry={refetch}
            onCellClick={onCellClick}
            onCellRightClick={handleCellRightClick}
            rowFieldLabels={rowFieldLabels}
            freezeHeader={
              // 优先 props(宿主硬控);否则走 viewConfig(用户设置面板),默认 true
              freezeHeader ?? viewConfig.pageState.freezeHeader ?? true
            }
            freezeRowHeader={
              freezeRowHeader ?? viewConfig.pageState.freezeRowHeader ?? true
            }
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onHeaderContextMenu={handleHeaderContextMenu}
          />
        )}
        {/* P5+ 滚动模式下隐藏底部行分页栏 — 用 isScrollMode 派生(同时覆盖:
            1) 用户在 settings 切到 paginationMode='scroll'
            2) 浏览模式 强制 scroll(viewConfig.paginationMode 不变,但 isScrollMode=true)
            列轴翻页保留:它的存在条件是"列数 > pageSize",跟分页 UI 偏好正交 */}
        {!isScrollMode && (
          <Pagination
            axis="row"
            currentPage={viewConfig.pageState.rowPageNo}
            pageSize={viewConfig.pageState.rowPageSize}
            total={renderModel?.pagination.totalRowCount ?? 0}
            onPageChange={handlePageChange}
            onPageSizeChange={handleRowPageSizeChange}
            showTotal={viewConfig.pageState.showTotalRowCount !== false}
          />
        )}
        {/* P1.0：列轴翻页（仅当数据列数 > columnPageSize 时显示） */}
        {renderModel && (renderModel.columnHeader.length > viewConfig.pageState.columnPageSize) && (
          <Pagination
            axis="column"
            currentPage={viewConfig.pageState.columnPageNo}
            pageSize={viewConfig.pageState.columnPageSize}
            total={renderModel.columnHeader.length}
            onPageChange={handleColumnPageChange}
            onPageSizeChange={handleColumnPageSizeChange}
          />
        )}
      </div>
      {/* 设置面板:4 个 dropzone 垂直堆叠 — panelVisibility.fieldPanel=false 或浏览模式下不渲染 */}
      {panelVisibility.fieldPanel && !browseMode && (
      <div className="pivot-table__settings">
        <div className="pivot-table__panel-title">
          <span>设置</span>
          <button
            type="button"
            className="pivot-table__panel-close"
            data-testid="panel-close-field-panel"
            title="收起字段面板"
            aria-label="收起字段面板"
            onClick={() => togglePanel('fieldPanel', false)}
          >
            ×
          </button>
        </div>
        <DropZones
          viewConfig={viewConfig}
          metadata={metadata}
          draggingFieldType={draggingFieldType}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onTagDragStart={(ft) => setDraggingFieldType(ft)}
          onTagContextMenu={(e) => setTagMenu(e)}
          onSwapRowsColumns={() => dispatch({ type: 'SWAP_ROWS_COLUMNS' })}
        />
      </div>
      )}
      {/* 数据面板:FieldTree 在最右 — panelVisibility.fieldTree=false 或浏览模式下不渲染 */}
      {panelVisibility.fieldTree && !browseMode && (
      <div className="pivot-table__data">
        <div className="pivot-table__panel-title">
          <span>数据</span>
          <button
            type="button"
            className="pivot-table__panel-close"
            data-testid="panel-close-field-tree"
            title="收起字段树"
            aria-label="收起字段树"
            onClick={() => togglePanel('fieldTree', false)}
          >
            ×
          </button>
        </div>
        {/* P3+ 双视图切换 — 多维(默认) / 表视图 */}
        <div className="field-tree__mode-tabs" role="tablist" data-testid="field-tree-mode-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={fieldTreeMode === 'multi'}
            className="field-tree__mode-tab"
            data-active={fieldTreeMode === 'multi' ? 'true' : 'false'}
            data-testid="field-tree-mode-multi"
            onClick={() => setFieldTreeMode('multi')}
            title="多维视图:维度 / 度量 / 层次 / 命名集"
          >
            多维视图
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={fieldTreeMode === 'table'}
            className="field-tree__mode-tab"
            data-active={fieldTreeMode === 'table' ? 'true' : 'false'}
            data-testid="field-tree-mode-table"
            onClick={() => setFieldTreeMode('table')}
            title="表视图:按数据库表分组"
          >
            表视图
          </button>
        </div>
        <input
          type="search"
          className="field-tree__search"
          data-testid="field-tree-search"
          placeholder="搜索字段..."
          value={fieldSearch}
          onChange={(e) => setFieldSearch(e.target.value)}
        />
        <FieldTree
          metadata={metadata}
          searchQuery={fieldSearch}
          mode={fieldTreeMode}
          onFieldDragStart={(_name, fieldType) => setDraggingFieldType(fieldType)}
          onFieldContextMenu={handleFieldContextMenu}
          onFieldDoubleClick={handleFieldDoubleClick}
          fieldUsage={fieldUsage}
          onFieldToggle={handleFieldToggle}
        />
        {/* P2 我的字段区 — viewConfig.customFields 渲染 + 新建入口 */}
        <div className="my-fields" data-testid="my-fields">
          <div className="my-fields__title">
            我的字段
            <div className="my-fields__add-buttons">
              <button
                type="button"
                className="my-fields__add-btn"
                data-testid="my-fields-add-expr"
                title="新建计算度量"
                onClick={() => setEditorOpen({ kind: 'expr' })}
              >
                + 度量
              </button>
              <button
                type="button"
                className="my-fields__add-btn"
                data-testid="my-fields-add-range"
                title={
                  numericDimensionFields.length === 0
                    ? '范围分组需要数值类型的维度字段(行级 CASE WHEN);当前数据集无可用字段'
                    : '新建范围分组(基于数值维度,生成 CASE WHEN 表达式)'
                }
                disabled={numericDimensionFields.length === 0}
                onClick={() => setBaseFieldPicker({ kind: 'range' })}
              >
                + 范围
              </button>
              <button
                type="button"
                className="my-fields__add-btn"
                data-testid="my-fields-add-enum"
                title="新建枚举分组"
                disabled={dimensionFields.length === 0}
                onClick={() => setBaseFieldPicker({ kind: 'enum' })}
              >
                + 分组
              </button>
            </div>
          </div>
          {viewConfig.customFields.length === 0 ? (
            <div className="my-fields__empty">还没有自建字段</div>
          ) : (
            viewConfig.customFields.map((cf) => {
              // kind → fieldType:UI 上的 chip 通过这个 fieldType 让 dropRules 决定能落哪个 zone
              //   calc_measure / dim_as_measure → UserCalcMeasure(只能进 value/filter)
              //   enum_group / range_group / calc_column → 维度类(只能进 row/column/filter)
              const fieldType: FieldType =
                cf.kind === 'calc_measure' || cf.kind === 'dim_as_measure'
                  ? 'UserCalcMeasure'
                  : cf.kind === 'enum_group'
                    ? 'EnumGroup'
                    : cf.kind === 'range_group'
                      ? 'RangeGroup'
                      : 'CalcColumn';
              // P5+ adhoc 模式不支持自建字段(后端 DetailQuery 不解析 customElements)→ 灰显 + 不可拖
              const adhocDisabled = isAdhoc;

              // P5+ "在用" checkbox — 跟 FieldTree 同语义:
              //   - usage=0 → 未勾(只在 my-fields 区,等待引用)
              //   - usage=1 → 勾上,可点取消(从那个 zone 删,**cf 自身保留在 my-fields**)
              //   - usage>=2 → disabled(避免一键删歧义,走 chip × 单删)
              // 注:"取消勾选"不删 customField 自身,删的是 zone 引用 — 跟 metadata 字段对称语义
              const usage = fieldUsage.get(cf.id) ?? 0;
              const checked = usage > 0;
              const ambiguous = usage >= 2;
              const checkboxTitle = adhocDisabled
                ? '即席查询模式不支持自建字段'
                : ambiguous
                  ? '该字段在多个区域使用 — 请通过 chip 上的 × 单独删除'
                  : checked
                    ? '取消勾选 → 从当前区域移除(自建字段保留)'
                    : '勾选 → 添加到默认区域';

              return (
                <div
                  key={cf.id}
                  className="my-fields__item"
                  data-testid={`my-fields-item-${cf.id}`}
                  data-field-type={fieldType}
                  data-disabled={adhocDisabled ? 'true' : undefined}
                  draggable={!adhocDisabled}
                  title={
                    adhocDisabled
                      ? '即席查询模式不支持自建字段(切回透视模式可用)'
                      : '拖到行/列/数值/筛选区使用'
                  }
                  onDragStart={(e) => {
                    if (adhocDisabled) {
                      e.preventDefault();
                      return;
                    }
                    try {
                      e.dataTransfer.setData(
                        PIVOT_FIELD_MIME,
                        encodePivotField({ fieldName: cf.id, fieldType }),
                      );
                      e.dataTransfer.effectAllowed = 'move';
                    } catch {
                      // jsdom 等环境无 dataTransfer,忽略;callback 仍触发让 dropzone 高亮
                    }
                    setDraggingFieldType(fieldType);
                  }}
                >
                  <input
                    type="checkbox"
                    className="my-fields__checkbox"
                    data-testid={`my-fields-checkbox-${cf.id}`}
                    checked={checked}
                    disabled={adhocDisabled || ambiguous}
                    title={checkboxTitle}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (adhocDisabled || ambiguous) return;
                      handleFieldToggle(cf.id, fieldType);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={() => {}}
                    readOnly={adhocDisabled || ambiguous}
                  />
                  <span className="my-fields__kind-badge" data-kind={cf.kind}>
                    {cf.kind === 'calc_measure'
                      ? 'Σ'
                      : cf.kind === 'calc_column'
                        ? 'ƒ'
                        : cf.kind === 'enum_group'
                          ? '⊞'
                          : cf.kind === 'range_group'
                            ? '↔'
                            : '∑'/* dim_as_measure */}
                  </span>
                  <span className="my-fields__item-name">{cf.name}</span>
                  <button
                    type="button"
                    className="my-fields__item-remove"
                    data-testid={`my-fields-remove-${cf.id}`}
                    aria-label={`删除 ${cf.name}`}
                    title="删除自建字段(从所有区域同时移除)"
                    onClick={() => handleRemoveCustomField(cf.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}
      {/* 字段树右键菜单（绝对定位，跟随鼠标位置） */}
      {fieldMenu && (
        <ContextMenu
          x={fieldMenu.x}
          y={fieldMenu.y}
          items={fieldMenuItems}
          onClose={closeFieldMenu}
        />
      )}
      {/* P2 chip 右键菜单（排序 / 移动 / 快计 / 删除）*/}
      {tagMenu && (
        <ContextMenu
          x={tagMenu.x}
          y={tagMenu.y}
          items={tagMenuItems}
          onClose={closeTagMenu}
        />
      )}
      {/* P3 单元格右键菜单(查看明细)— 只在宿主未自定 onCellRightClick 时弹 */}
      {cellMenu && cellMenuItems.length > 0 && (
        <ContextMenu
          x={cellMenu.x}
          y={cellMenu.y}
          items={cellMenuItems}
          onClose={closeCellMenu}
        />
      )}
      {/* P5+ 字段级表头右键菜单(adhoc 列头 / pivot corner / pivot 度量列头)— 排序+复制 */}
      {columnHeaderMenu && columnHeaderMenuItems.length > 0 && (
        <ContextMenu
          x={columnHeaderMenu.x}
          y={columnHeaderMenu.y}
          items={columnHeaderMenuItems}
          onClose={() => setColumnHeaderMenu(null)}
          className="column-header-menu"
        />
      )}
      {/* P5+ pivot 行/列头**成员**级右键菜单(In/NotIn 过滤 + 复制成员名) */}
      {memberContextMenu && memberContextMenuItems.length > 0 && (
        <ContextMenu
          x={memberContextMenu.x}
          y={memberContextMenu.y}
          items={memberContextMenuItems}
          onClose={() => setMemberContextMenu(null)}
          className="member-context-menu"
        />
      )}
      {/* base field picker modal:点 + 范围/+ 分组 弹出选字段,选完才打开真 editor */}
      {baseFieldPicker && (
        <div
          className="base-field-picker-overlay"
          role="dialog"
          aria-modal="true"
          data-testid="base-field-picker"
          onClick={(e) => {
            // 点击 overlay 空白处关闭(点击内部 modal 不关)
            if (e.target === e.currentTarget) {
              setBaseFieldPicker(null);
              setBaseFieldSearch('');
            }
          }}
        >
          <div className="base-field-picker">
            <div className="base-field-picker__header">
              <span className="base-field-picker__title">
                选择基础字段({baseFieldPicker.kind === 'range' ? '数值维度' : '维度'})
              </span>
              <button
                type="button"
                className="base-field-picker__close"
                data-testid="base-field-picker-cancel"
                aria-label="取消"
                onClick={() => {
                  setBaseFieldPicker(null);
                  setBaseFieldSearch('');
                }}
              >
                ×
              </button>
            </div>
            <div className="base-field-picker__hint">
              {baseFieldPicker.kind === 'range'
                ? '范围分组本质是行级 CASE WHEN 表达式 — 把数值维度按区间分桶(例如年龄 → 0-18 / 18-65 / 65+)'
                : '枚举分组会把该维度字段的成员归类(例如国家 → 亚洲/欧洲)'}
            </div>
            <div className="base-field-picker__search-wrap">
              <svg
                className="base-field-picker__search-icon"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="7" cy="7" r="5" />
                <path d="M14 14l-3-3" />
              </svg>
              <input
                type="text"
                className="base-field-picker__search"
                data-testid="base-field-picker-search"
                placeholder="搜索字段名或别名"
                value={baseFieldSearch}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setBaseFieldSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (baseFieldSearch) {
                      // 先 Esc 清搜索,再 Esc 关 picker
                      setBaseFieldSearch('');
                    } else {
                      setBaseFieldPicker(null);
                    }
                  }
                }}
              />
              {baseFieldSearch && (
                <button
                  type="button"
                  className="base-field-picker__search-clear"
                  data-testid="base-field-picker-search-clear"
                  aria-label="清除搜索"
                  onClick={() => setBaseFieldSearch('')}
                >
                  ×
                </button>
              )}
            </div>
            <div className="base-field-picker__list">
              {(() => {
                const allCandidates =
                  baseFieldPicker.kind === 'range' ? numericDimensionFields : dimensionFields;
                const q = baseFieldSearch.trim().toLowerCase();
                const filtered = q
                  ? allCandidates.filter((name) => {
                      const alias = metaIndex.findByName(name)?.alias ?? name;
                      return (
                        alias.toLowerCase().includes(q) || name.toLowerCase().includes(q)
                      );
                    })
                  : allCandidates;
                if (filtered.length === 0) {
                  return (
                    <div
                      className="base-field-picker__empty"
                      data-testid="base-field-picker-empty"
                    >
                      {q ? `没有匹配 "${baseFieldSearch}" 的字段` : '当前数据集没有可用字段'}
                    </div>
                  );
                }
                return filtered.map((name) => {
                  const alias = metaIndex.findByName(name)?.alias ?? name;
                  return (
                    <button
                      key={name}
                      type="button"
                      className="base-field-picker__item"
                      data-testid={`base-field-picker-pick-${name}`}
                      onClick={() => {
                        setEditorOpen({
                          kind: baseFieldPicker.kind,
                          baseField: name,
                          baseFieldAlias: alias,
                        });
                        setBaseFieldPicker(null);
                        setBaseFieldSearch('');
                      }}
                    >
                      <span className="base-field-picker__item-icon" aria-hidden>
                        {/* range 是数值维度,enum 是普通维度 — 都用 # 标识"维度分类",
                            range 用 # 但悬停时区分(语义上 range 是数值区间) */}
                        {baseFieldPicker.kind === 'range' ? '#' : 'A'}
                      </span>
                      <span className="base-field-picker__item-alias">{alias}</span>
                      <span className="base-field-picker__item-name">{name}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* P3 显示设置 modal — 抽到 <SettingsModal> 子组件 */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        viewConfig={viewConfig}
        dispatch={dispatch}
        panelVisibility={panelVisibility}
        onTogglePanel={(key, next) => togglePanel(key, next)}
        isAdhoc={isAdhoc}
      />

      {/* P5+ 条件格式化 modal — 数值区 chip(pivot)/ 列头右键(adhoc 数值列)触发 */}
      {condFormatTarget !== null && (
        <ConditionalFormatModal
          measure={condFormatTarget.measure}
          measureAlias={metaIndex.findByName(condFormatTarget.measure)?.alias}
          mode={condFormatTarget.mode}
          rules={(viewConfig.pageState.conditionalFormats ?? []).filter(
            (r) =>
              r.measure === condFormatTarget.measure &&
              (r.mode ?? 'pivot') === condFormatTarget.mode,
          )}
          onApply={(nextRules) => {
            // 算 diff(按 id):
            //   - 删:旧的不在新的里 → REMOVE
            //   - 加 / 改:其余 → ADD / UPDATE
            // 仅对"同 measure + 同 mode"的 rule 做 diff,避免误删其他 mode 的规则
            const oldRules = (viewConfig.pageState.conditionalFormats ?? []).filter(
              (r) =>
                r.measure === condFormatTarget.measure &&
                (r.mode ?? 'pivot') === condFormatTarget.mode,
            );
            const oldIds = new Set(oldRules.map((r) => r.id));
            const nextIds = new Set(nextRules.map((r) => r.id));
            for (const r of oldRules) {
              if (!nextIds.has(r.id)) dispatch({ type: 'REMOVE_CONDITIONAL_FORMAT', id: r.id });
            }
            for (const r of nextRules) {
              if (oldIds.has(r.id)) dispatch({ type: 'UPDATE_CONDITIONAL_FORMAT', rule: r });
              else dispatch({ type: 'ADD_CONDITIONAL_FORMAT', rule: r });
            }
          }}
          onClose={() => setCondFormatTarget(null)}
        />
      )}

      {/* P2 自建字段编辑器 modals(calc_measure / calc_column 共用) */}
      {editorOpen?.kind === 'expr' && (
        <FieldExpressionEditor
          // calc_measure 引用 measure name → availableFields(度量+维度,旧 prop 含义保持)
          availableFields={availableFields}
          // calc_column 引用物理列 → physicalColumns(metadata.fields[].name)
          availableColumns={physicalColumns}
          initialField={
            editorOpen.initialField?.kind === 'calc_measure' ||
            editorOpen.initialField?.kind === 'calc_column'
              ? editorOpen.initialField
              : undefined
          }
          onApply={(cf) => {
            if (editorOpen.initialField) {
              dispatch({ type: 'UPDATE_CUSTOM_FIELD', field: cf });
            } else {
              handleAddCustomField(cf);
            }
          }}
          onClose={() => setEditorOpen(null)}
        />
      )}
      {editorOpen?.kind === 'range' && editorOpen.baseField && (
        <RangeGroupEditor
          baseField={editorOpen.baseField}
          baseFieldAlias={editorOpen.baseFieldAlias ?? editorOpen.baseField}
          initialField={
            editorOpen.initialField?.kind === 'range_group'
              ? editorOpen.initialField
              : undefined
          }
          onApply={(cf) => {
            if (editorOpen.initialField) {
              dispatch({ type: 'UPDATE_CUSTOM_FIELD', field: cf });
            } else {
              handleAddCustomField(cf);
            }
          }}
          onClose={() => setEditorOpen(null)}
        />
      )}
      {editorOpen?.kind === 'enum' && editorOpen.baseField && loadMembers && (
        <EnumGroupEditor
          baseField={editorOpen.baseField}
          baseFieldAlias={editorOpen.baseFieldAlias ?? editorOpen.baseField}
          loadMembers={() => loadMembers(editorOpen.baseField!)}
          initialField={
            editorOpen.initialField?.kind === 'enum_group'
              ? editorOpen.initialField
              : undefined
          }
          onApply={(cf) => {
            if (editorOpen.initialField) {
              dispatch({ type: 'UPDATE_CUSTOM_FIELD', field: cf });
            } else {
              handleAddCustomField(cf);
            }
          }}
          onClose={() => setEditorOpen(null)}
        />
      )}

      {/* P3+ 明细 modal:点 toolbar"明细"按钮 / 单元格右键(无宿主 onDrillThrough 时)→ 弹这个 */}
      {detailContext && (
        <DetailModal
          query={detailContext.query}
          onQuery={onQuery}
          contextChips={detailContext.chips}
          onClose={() => setDetailContext(null)}
        />
      )}
    </div>
  );
}
