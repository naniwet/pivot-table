/**
 * parseCellSet — 后端 CellSet → 前端 RenderModel 的纯函数
 *
 * 契约：CellSet + ViewConfig + Metadata → RenderModel
 *
 * 关键不变量：
 *   columnHeader.length === matrix[r].length === cellSet.columns.length（数据列数）
 *
 * 真实后端 columnMetadataArray 语义（probe 实测）：
 *   它是 **per-FIELD** 元数据（行轴 fields + 列轴 fields 的元数据），
 *   不是 per-data-column。例：rows=[年]、columns=[活动,销售额] → columnMetadataArray
 *   长度 = 1（年）+ 2（活动+销售额） = 3，但 cellSet.columns 是 14 个 (活动×measure) tuples。
 *   每个数据列的标签必须从 cellSet.columns[k] 这个 Member[] tuple 衍生。
 */

import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import type { CellSet, ColumnMetaData, Member } from '../../types/cellSet.js';
import type { Metadata } from '../../types/metadata.js';
import type {
  ColumnHeaderCell,
  ColumnHeaderGroupCell,
  RenderCell,
  RenderModel,
  RowHeaderNode,
} from '../../types/renderModel.js';
import type { RowField, ViewConfig } from '../../types/viewConfig.js';
import { findQuickCalcOption, formatMeasureDisplayLabel, splitMeasureFieldName } from '../viewConfig/quickCalcs.js';
import { getAggregatorLabel } from '../viewConfig/aggregators.js';
import type { Aggregator } from '../../types/query.js';

import { buildDenseMatrix } from './matrixBuilder.js';

const ALL_LEVEL = '(All)';

function isGrandTotalRow(members: Member[]): boolean {
  return members.some((m) => m.level === ALL_LEVEL);
}

function findHierarchyRowField(rows: RowField[]): RowField | undefined {
  return rows.find((r) => r.type === 'Hierarchy');
}

function findFieldMeta(arr: ColumnMetaData[], name: string): ColumnMetaData | undefined {
  return arr.find((m) => m.name === name);
}

const FALLBACK_COL_META: ColumnMetaData = {
  name: '',
  alias: '',
  valueType: 'STRING',
  dataFormat: '',
  maskingRuleIdList: [],
  accessible: true,
};

/** 从一个 column tuple 衍生该数据列的 metadata（用于 mask 检查、dataFormat）
 *
 * measure 列 fieldName 可能带 @QC@ 后缀,先拆原 measureName 再查 metadata。
 */
function deriveColumnMetaForTuple(
  tuple: Member[],
  columnMetadataArray: ColumnMetaData[],
): ColumnMetaData {
  if (tuple.length === 0) return FALLBACK_COL_META;
  const last = tuple[tuple.length - 1]!;
  const isMeasure = last.dimension === 'Measures';
  const lookupName = isMeasure
    ? splitMeasureFieldName(last.fieldName).measureName
    : last.fieldName;
  return findFieldMeta(columnMetadataArray, lookupName) ?? {
    ...FALLBACK_COL_META,
    name: last.fieldName,
    alias: last.name,
  };
}

/** 从一个 column tuple 衍生该数据列的展示标签（平级版：deepest member 的 alias 或 name）
 *
 * 关键:cellSet 返回的 measure column member.fieldName 可能是带 quickCalc 后缀的新 name
 * (因为 buildQuery 把 fields[].name 改成 '销售额_m@QC@SamePeriodValue'),所以查 metadata
 * 时要先 splitMeasureFieldName 拆出原 measureName,再 findFieldMeta。
 */
/**
 * 从 encoded fieldName 解出 aggregator label / quickCalc label。
 *   - 同 measure 多 ValueField(不同 aggregator)时,encoded fieldName 自带区分(@AGG@/@QC@)
 *   - 优先用 encoded suffix(精确);若 fieldName 无 encoded(如 cellSet stub 测试场景),
 *     退化用 viewConfig.values 唯一匹配项的 quickCalc/aggregator 反查
 */
function labelsFromEncoded(
  rawName: string,
  viewConfig: ViewConfig,
): { aggLabel: string | null; qcLabel: string | null } {
  const { measureName, aggregator, quickCalcEnum } = splitMeasureFieldName(rawName);
  let aggLabel = aggregator ? getAggregatorLabel(aggregator as Aggregator) : null;
  let qcLabel = quickCalcEnum ? (findQuickCalcOption(quickCalcEnum)?.label ?? null) : null;
  // Encoded 缺失 → 退化:viewConfig 里同 measureName 的 ValueField 唯一时取其设置
  if (!aggLabel || !qcLabel) {
    const matches = viewConfig.values.filter((v) => v.measureName === measureName);
    if (matches.length === 1) {
      const v = matches[0]!;
      if (!aggLabel && v.aggregator) aggLabel = getAggregatorLabel(v.aggregator);
      if (!qcLabel && v.quickCalc && typeof v.quickCalc === 'object' && '_enum' in v.quickCalc) {
        const opt = findQuickCalcOption((v.quickCalc as { _enum: string })._enum);
        if (opt) qcLabel = opt.label;
      }
    }
  }
  return { aggLabel, qcLabel };
}

function deriveColumnHeader(
  tuple: Member[],
  columnMetadataArray: ColumnMetaData[],
  fallbackIdx: number,
  viewConfig: ViewConfig,
): ColumnHeaderCell {
  if (tuple.length === 0) {
    return { fieldName: `_col${fallbackIdx}`, alias: '', dataFormat: '', isMeasure: false };
  }
  const last = tuple[tuple.length - 1]!;
  const isMeasure = last.dimension === 'Measures';
  const { measureName: rawMeasureName } = isMeasure
    ? splitMeasureFieldName(last.fieldName)
    : { measureName: last.fieldName };
  const lastMeta = findFieldMeta(columnMetadataArray, rawMeasureName);
  const baseAlias = lastMeta?.alias ?? last.name;
  let alias = baseAlias;
  if (isMeasure) {
    const { aggLabel, qcLabel } = labelsFromEncoded(last.fieldName, viewConfig);
    alias = formatMeasureDisplayLabel(baseAlias, qcLabel, aggLabel);
  }
  return {
    fieldName: last.fieldName,
    alias,
    dataFormat: lastMeta?.dataFormat ?? '',
    isMeasure,
  };
}

/**
 * 多级列头合并：对每个 level 扫描相邻 tuple，合并前 i 个 level 路径相同的连续段为一个 cell。
 *
 * 例：tuples = [
 *   [型号1, 销售额], [型号2, 销售额], ..., [型号6, 销售额]
 * ]
 * → 2 levels:
 *   level 0: [{label:型号1, colSpan:1}, {label:型号2, colSpan:1}, ...] (6 cells)
 *   level 1: [{label:销售额, colSpan:1}, ...] (6 cells, 每个独立)
 *
 * 多 measure 时上层会有 colSpan>1 的合并。
 */
function buildColumnHeaderLevels(
  tuples: Member[][],
  columnMetadataArray: ColumnMetaData[],
  viewConfig: ViewConfig,
): ColumnHeaderGroupCell[][] {
  if (tuples.length === 0) return [];
  const numLevels = tuples[0]?.length ?? 0;
  if (numLevels === 0) return [];

  /** 路径在 [from..to] 的前 lvl+1 项是否完全相同 */
  function pathEqual(a: Member[], b: Member[], throughLevel: number): boolean {
    for (let i = 0; i <= throughLevel; i++) {
      if (a[i]?.name !== b[i]?.name) return false;
    }
    return true;
  }

  const levels: ColumnHeaderGroupCell[][] = [];
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const cells: ColumnHeaderGroupCell[] = [];
    let groupStart = 0;
    for (let k = 1; k <= tuples.length; k++) {
      const isLast = k === tuples.length;
      const breakGroup =
        isLast || !pathEqual(tuples[k]!, tuples[k - 1]!, lvl);
      if (breakGroup) {
        const member = tuples[groupStart]![lvl]!;
        const isMeasure = member.dimension === 'Measures';
        // measure 列:fieldName 可能含 @AGG@/@QC@ 后缀,拆原 measureName 查 metadata
        const { measureName: rawMeasureName } = isMeasure
          ? splitMeasureFieldName(member.fieldName)
          : { measureName: member.fieldName };
        const meta = findFieldMeta(columnMetadataArray, rawMeasureName);
        const baseLabel = isMeasure ? (meta?.alias ?? member.name) : member.name;
        let label = baseLabel;
        if (isMeasure) {
          const { aggLabel, qcLabel } = labelsFromEncoded(member.fieldName, viewConfig);
          label = formatMeasureDisplayLabel(baseLabel, qcLabel, aggLabel);
        }
        cells.push({
          fieldName: member.fieldName,
          label,
          colSpan: k - groupStart,
          isMeasure,
        });
        groupStart = k;
      }
    }
    levels.push(cells);
  }
  return levels;
}

export function parseCellSet(
  cellSet: CellSet,
  viewConfig: ViewConfig,
  metadata: Metadata,
): RenderModel {
  // 数据列数 = cellSet.columns.length（列轴 tuple 数）
  // Cell.column 索引指 DATA 列（0-based）
  const dataColCount = cellSet.columns.length;

  // 关键修正（2026-05-05）：columnMetadataArray 是 per-FIELD 元数据，不是 per-data-column。
  // 每个数据列的 columnHeader/columnMeta 必须从 cellSet.columns[k] tuple 衍生（按 fieldName 查 metadata）
  const columnMeta: ColumnMetaData[] = cellSet.columns.map((tuple) =>
    deriveColumnMetaForTuple(tuple, cellSet.columnMetadataArray),
  );
  const columnHeader: ColumnHeaderCell[] = cellSet.columns.map((tuple, idx) =>
    deriveColumnHeader(tuple, cellSet.columnMetadataArray, idx, viewConfig),
  );
  const columnHeaderLevels = buildColumnHeaderLevels(
    cellSet.columns,
    cellSet.columnMetadataArray,
    viewConfig,
  );

  const fullMatrix = buildDenseMatrix(cellSet.data, cellSet.rows.length, dataColCount);

  // 1. 切分普通行 vs 总计行
  const normalRowIndices: number[] = [];
  let grandTotalRowIndex: number | null = null;
  for (let i = 0; i < cellSet.rows.length; i++) {
    if (isGrandTotalRow(cellSet.rows[i]!)) {
      grandTotalRowIndex = i;
    } else {
      normalRowIndices.push(i);
    }
  }

  const matrix: RenderCell[][] = normalRowIndices.map((i) => fullMatrix[i]!);
  const grandTotalRow = grandTotalRowIndex !== null ? fullMatrix[grandTotalRowIndex]! : null;

  // 2. 列级脱敏（仅对真实数据格生效，EMPTY_CELL 保持 frozen 不变）
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r]!;
    for (let c = 0; c < dataColCount; c++) {
      const meta = columnMeta[c];
      if (!meta || meta.maskingRuleIdList.length === 0) continue;
      const cell = row[c]!;
      if (cell.isEmpty) continue;
      row[c] = { ...cell, isMasked: true };
    }
  }

  // 3. 构建 rowHeader
  //
  // ADR-004 C2 后行轴语义：每个 cellSet.rows[i] 是 Member[]（=多 level 笛卡尔积），
  // 每个 Member 对应一个 level。我们把 fullPath = 全部 member.name 串联，
  // depth = members.length - 1，member 字段取最深 level 的 member（display 用）。
  //
  // canDrillDown / canDrillUp 是 hierarchy-level 属性（同一 hierarchy 所有行相同）：
  //   canDrillDown = drillDepth < maxDepth
  //   canDrillUp   = drillDepth > 1
  const hierarchyRowField = findHierarchyRowField(viewConfig.rows);
  let canDrillDown = false;
  let canDrillUp = false;
  let hierarchyFieldName: string | null = null;
  if (hierarchyRowField) {
    const drillDepth = Math.max(1, hierarchyRowField.drillDepth ?? 1);
    const maxDepth = buildMetadataIndex(metadata)
      .getHierarchyLevels(hierarchyRowField.fieldName).length;
    canDrillDown = drillDepth < Math.max(1, maxDepth);
    canDrillUp = drillDepth > 1;
    hierarchyFieldName = hierarchyRowField.fieldName;
  }

  const rowHeader: RowHeaderNode[] = normalRowIndices.map((srcIdx, dstIdx) => {
    const members = cellSet.rows[srcIdx]!;
    if (members.length === 0) {
      // 防御：成员为空
      return {
        member: { name: '', uniqueName: [], level: '', dimension: '', fieldName: '' },
        depth: 0,
        rowIndex: dstIdx,
        fullPath: [],
        hierarchyFieldName,
        canDrillDown,
        canDrillUp,
      };
    }
    const deepest = members[members.length - 1]!;
    return {
      member: deepest,
      depth: members.length - 1,
      rowIndex: dstIdx,
      fullPath: members.map((m) => m.name),
      hierarchyFieldName: hierarchyRowField ? hierarchyFieldName : null,
      canDrillDown: hierarchyRowField ? canDrillDown : false,
      canDrillUp: hierarchyRowField ? canDrillUp : false,
    };
  });

  return {
    rowHeader,
    columnHeader,
    columnHeaderLevels,
    matrix,
    grandTotalRow,
    columnMeta,
    pagination: { totalRowCount: cellSet.totalRowCount },
  };
}
