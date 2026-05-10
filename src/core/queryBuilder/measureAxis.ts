/**
 * placeMeasureAxis — 决定度量名（measureNames） 在 query.rows / query.columns 里的位置
 *
 * 默认行为（兼容现有）：append 到 columns 末尾。
 *
 * P3 增量：用户可以把 MEASURE_GROUP_NAME 虚拟字段拖到行轴 / 列轴。
 *   - 在 viewConfig 里它表现为 `{ fieldName: '__measure_axis__', type: 'MeasureGroupName' }`
 *   - translateRows / translateColumns 会跳过它（不出现在 query 里）
 *   - 这里根据它在 viewConfig.rows/columns 中的位置，把 measureNames[] 插进对应的 query 轴
 */
import type { FieldOrNameSet } from '../../types/query.js';
import type { ColumnField, RowField } from '../../types/viewConfig.js';

/** sentinel 字段名 — 占位，UI 显示成"Σ 度量名称"，不发到后端 */
export const MEASURE_AXIS_FIELD_NAME = '__measure_axis__';

export function isMeasureAxisField(f: { type: RowField['type'] }): boolean {
  return f.type === 'MeasureGroupName';
}

export interface PlaceMeasureAxisInput {
  rows: Array<string | FieldOrNameSet>;
  columns: Array<string | FieldOrNameSet>;
}

/**
 * 计算 viewConfig 里 MeasureGroupName 在 row/column 上下游"非 MeasureGroupName 字段"的索引。
 * 返回 null 表示该字段在该 zone 里不存在。
 *
 * 例如 viewConfig.rows = [a, MGN, b]，translatedRows=[a, b]（跳过 MGN）。
 * MGN 实际占据"翻译后的索引 1"位置（在 a 之后）。
 */
function findMeasureAxisInsertIndex(
  fields: Array<RowField | ColumnField>,
): number | null {
  let translatedIdx = 0;
  for (const f of fields) {
    if (isMeasureAxisField(f)) {
      return translatedIdx; // 在该位置插入
    }
    translatedIdx++;
  }
  return null;
}

export function placeMeasureAxis(
  baseline: PlaceMeasureAxisInput,
  measureNames: string[],
  vcRows: RowField[],
  vcColumns: ColumnField[],
): PlaceMeasureAxisInput {
  if (measureNames.length === 0) return baseline;

  const inRowsIdx = findMeasureAxisInsertIndex(vcRows);
  const inColsIdx = findMeasureAxisInsertIndex(vcColumns);

  if (inRowsIdx !== null) {
    const rows = [...baseline.rows];
    rows.splice(inRowsIdx, 0, ...measureNames);
    return { rows, columns: baseline.columns };
  }
  if (inColsIdx !== null) {
    const columns = [...baseline.columns];
    columns.splice(inColsIdx, 0, ...measureNames);
    return { rows: baseline.rows, columns };
  }
  // 默认 append 到 columns 末尾（向后兼容）
  return {
    rows: baseline.rows,
    columns: [...baseline.columns, ...measureNames],
  };
}
