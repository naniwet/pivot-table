/**
 * @company/pivot-table — 公开 API
 *
 * 当前阶段：P0 Week 2（核心纯函数完成）
 * UI 组件 (P0 Week 3-4) 尚未实现
 */

export * from './types/index.js';
export { buildQuery } from './core/queryBuilder/buildQuery.js';
export {
  buildDetailQuery,
  canViewDetail,
  DRILL_THROUGH_MAX_ROWS,
} from './core/drillThrough/buildDetailQuery.js';
export type { BuildDetailQueryInput } from './core/drillThrough/buildDetailQuery.js';
export { buildChartSeries } from './core/chart/buildChartSeries.js';
export type {
  ChartData,
  ChartType,
  ChartCategoryData,
  ChartPieData,
  BuildChartSeriesInput,
} from './core/chart/buildChartSeries.js';
export { chartDataToEChartsOption } from './core/chart/chartDataToEChartsOption.js';
export type { EChartsOption } from './core/chart/chartDataToEChartsOption.js';
export { ChartRenderer } from './components/ChartRenderer/ChartRenderer.js';
export type { ChartRendererProps } from './components/ChartRenderer/ChartRenderer.js';
export { DetailModal } from './components/DetailModal/DetailModal.js';
export type { DetailModalProps } from './components/DetailModal/DetailModal.js';
export {
  buildMemberQuery,
  type BuildMemberQueryOptions,
} from './core/queryBuilder/buildMemberQuery.js';
export { translateDimensionFilter } from './core/queryBuilder/translators/dimensionFilter.js';
export { buildMetadataIndex, type MetadataIndex } from './core/metadata/fieldIndex.js';
export { parseCellSet } from './core/cellSetParser/parseCellSet.js';
export { buildDenseMatrix } from './core/cellSetParser/matrixBuilder.js';

// ViewConfig 纯变更函数
export { applyDrop } from './core/viewConfig/applyDrop.js';
export { cycleRowSort } from './core/viewConfig/cycleRowSort.js';
export { removeFieldFromZone } from './core/viewConfig/removeFieldFromZone.js';
export {
  moveFieldInZone,
  type MoveDirection,
} from './core/viewConfig/moveFieldInZone.js';
export { setRowPage } from './core/viewConfig/setRowPage.js';
export { setFilters } from './core/viewConfig/setFilters.js';
export { setMeasureFilters } from './core/viewConfig/setMeasureFilters.js';
export {
  applyAddCustomField,
  applyRemoveCustomField,
  applyUpdateCustomField,
} from './core/viewConfig/customFields.js';
export {
  moveFieldInZone as moveField,
} from './core/viewConfig/moveFieldInZone.js';
export {
  parseExpression,
  type Expr,
} from './core/expression/parseExpression.js';
export { astToMdx } from './core/expression/astToMdx.js';
export {
  validateRanges,
  type RangeRow,
  type ValidateResult,
} from './core/customFields/validateRanges.js';
export {
  detectTimeAxis,
  type TimeAxisInfo,
} from './core/timeAxis/detectTimeAxis.js';
export {
  P1_QUICK_CALCS,
  P2_TIME_QUICK_CALCS,
  ALL_QUICK_CALCS,
  findQuickCalcOption,
  type QuickCalcOption,
} from './core/viewConfig/quickCalcs.js';
export {
  RangeGroupEditor,
  type RangeGroupEditorProps,
} from './components/RangeGroupEditor/RangeGroupEditor.js';
export {
  EnumGroupEditor,
  type EnumGroupEditorProps,
} from './components/EnumGroupEditor/EnumGroupEditor.js';
export {
  FieldExpressionEditor,
  type FieldExpressionEditorProps,
} from './components/FieldExpressionEditor/FieldExpressionEditor.js';
export { setValueQuickCalc } from './core/viewConfig/setValueQuickCalc.js';
export {
  drillDownHierarchy,
  drillUpHierarchy,
} from './core/viewConfig/drillHierarchy.js';
// (P1_QUICK_CALCS / findQuickCalcOption 已在上方 P2 export 集合里导出)

// HTML5 拖拽协议（FieldTree 编码、DropZones 解码）
export {
  PIVOT_FIELD_MIME,
  decodePivotField,
  encodePivotField,
  type PivotFieldDragPayload,
} from './core/dropRules/dragProtocol.js';

// 拖拽合法性 policy（pure，components 与 core/viewConfig 共用）
export {
  DROP_RULES,
  canDrop,
  type DropZone,
  type FieldType,
} from './core/dropRules/dropRules.js';

// 组件 + Hooks
export {
  FieldTree,
  type FieldTreeProps,
  type FieldContextMenuEvent,
} from './components/FieldTree/FieldTree.js';
export {
  ContextMenu,
  type ContextMenuProps,
  type ContextMenuItem,
} from './components/ContextMenu/ContextMenu.js';
export { FilterPanel, type FilterPanelProps } from './components/FilterPanel/FilterPanel.js';
export { FilterModal, type FilterModalProps } from './components/FilterModal/FilterModal.js';
export {
  MeasureFilterModal,
  type MeasureFilterModalProps,
  type AvailableMeasure,
} from './components/MeasureFilterModal/MeasureFilterModal.js';
export {
  MemberSelector,
  type MemberSelectorProps,
} from './components/MemberSelector/MemberSelector.js';
export {
  operatorsForType,
  isNumericLikeType,
  isTextLikeType,
  type OperatorOption,
} from './core/filterOperators/operatorsForType.js';
export { DropZones, type DropZonesProps } from './components/DropZones/DropZones.js';
export {
  PivotRenderer,
  type PivotRendererProps,
} from './components/PivotRenderer/PivotRenderer.js';
export { RelationGraphPanel } from './components/RelationGraphPanel/RelationGraphPanel.js';
export { Pagination, type PaginationProps } from './components/Pagination/Pagination.js';
export { Toolbar, type ToolbarProps } from './components/Toolbar/Toolbar.js';
export { PivotTable, type PivotTableProps } from './components/PivotTable/PivotTable.js';

// Smartbi 后端适配器（host-specific；可改放独立 package）
export {
  SmartbiClient,
  type SmartbiAuth,
  type SmartbiClientOptions,
} from './api/smartbi/SmartbiClient.js';

// CSV 导出（pure，宿主自行下载）
export { renderModelToCsv } from './core/export/csvExport.js';
export {
  extractSelectionTsv,
  type CellSelection,
} from './core/export/extractSelectionTsv.js';
export {
  clampColumnWidth,
  type ClampOptions,
} from './core/columnResize/clampColumnWidth.js';
export {
  useViewConfig,
  viewConfigReducer,
  type UseViewConfigOptions,
  type ViewConfigAction,
  type ViewConfigHistory,
} from './hooks/useViewConfig.js';
export {
  usePivotQuery,
  type UsePivotQueryOptions,
  type UsePivotQueryResult,
} from './hooks/usePivotQuery.js';

// 测试夹具（仅供宿主集成测试用，生产构建会 tree-shake 掉）
export {
  buildViewConfig,
  buildHierarchyRow,
  buildDimensionRow,
  buildValueField,
  buildSort,
  buildLeafFilter,
  buildMeasureFilter,
  defaultPageState,
} from './fixtures/builders.js';
export { orderModelMetadata, FIELD_IDS } from './fixtures/metadata/orderModel.js';
