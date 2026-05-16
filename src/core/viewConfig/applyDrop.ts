/**
 * applyDrop — 把字段拖入目标 zone 的纯变更
 *
 * 不变量见 applyDrop.test.ts 文件头注释。
 *
 * 关键设计：
 *   - 引 canDrop 做 type×zone 合法性校验（系统内边界检查）
 *   - 已在某 zone 的同名字段 → 自动从源 zone 移除（避免 I2 冲突）
 *   - 行/列字段类型映射：FieldType→RowColFieldType。Measure/CalcMeasure 走 value 分支
 *   - filter zone 在 P0 由 canDrop 全部 reject，函数实际不会到达 filter 分支
 *   - **insertIdx**(2026-05-06):可选位置参数,支持拖拽 reorder。不传 = append 末尾(原行为)
 */

import { canDrop, type DropZone, type FieldType } from '../dropRules/dropRules.js';
import { getMeasureFieldName } from './quickCalcs.js';
import type {
  ClientFilter,
  ColumnField,
  MeasureFilter,
  RowColFieldType,
  RowField,
  ValueField,
  ViewConfig,
} from '../../types/viewConfig.js';

/** 度量类 fieldType 的判定（拖入 filter 时走 measureFilters 分支） */
const MEASURE_LIKE_TYPES = new Set<FieldType>(['Measure', 'CalcMeasure', 'UserCalcMeasure']);

const ROW_COL_TYPE_MAP: Record<string, RowColFieldType> = {
  Hierarchy: 'Hierarchy',
  Dimension: 'Dimension',
  CalcGroup: 'CalcGroup',
  NamedSet: 'NamedSet',
  EnumGroup: 'EnumGroup',
  RangeGroup: 'RangeGroup',
  MeasureGroupName: 'MeasureGroupName',
};

function makeRowColField(fieldName: string, fieldType: FieldType): RowField {
  const mapped = ROW_COL_TYPE_MAP[fieldType];
  if (!mapped) {
    throw new Error(`[applyDrop] field type "${fieldType}" cannot be a row/column`);
  }
  if (mapped === 'Hierarchy') {
    return { fieldName, type: 'Hierarchy', drillDepth: 1 };
  }
  return { fieldName, type: mapped };
}

function makeValueField(fieldName: string): ValueField {
  return { measureName: fieldName, aggregator: null, quickCalc: null };
}

function removeFromAllZones(viewConfig: ViewConfig, fieldName: string): ViewConfig {
  return {
    ...viewConfig,
    rows: viewConfig.rows.filter((r) => r.fieldName !== fieldName),
    columns: viewConfig.columns.filter((c) => c.fieldName !== fieldName),
    values: viewConfig.values.filter((v) => v.measureName !== fieldName),
    // 注：filter zone 不在这里清 — 同名维度可同时存在于 filter 和 row 是合法的
    //（PRD：行轴 + 筛选区是两个不同语义，拖入 filter 不应自动移除行）
  };
}

/**
 * 在 arr 的 insertIdx 位置插入 item;idx 越界或 undefined → append 末尾。
 *
 * 注意:调用前 arr 应已经 remove 掉同名字段(由 caller 保证)。如果原字段在目标 zone 内
 * 且原 idx < insertIdx,需要把 insertIdx-1 — 否则用户感知的"放到第 i 个位置"会偏 1。
 */
function insertAt<T>(arr: T[], insertIdx: number | undefined, item: T): T[] {
  if (insertIdx === undefined || insertIdx < 0 || insertIdx >= arr.length) {
    return [...arr, item];
  }
  return [...arr.slice(0, insertIdx), item, ...arr.slice(insertIdx)];
}

/**
 * 调整 insertIdx:如果 fieldName 原本在目标 zone 内且原位置 < insertIdx,
 * remove 后下游元素左移 1,所以 insertIdx 也要 -1 才是用户视觉上的"插到 i 位"。
 */
function adjustInsertIdxForRemove(
  origIdxInTarget: number,
  insertIdx: number | undefined,
): number | undefined {
  if (insertIdx === undefined) return undefined;
  if (origIdxInTarget === -1) return insertIdx;
  if (origIdxInTarget < insertIdx) return insertIdx - 1;
  return insertIdx;
}

export function applyDrop(
  viewConfig: ViewConfig,
  zone: DropZone,
  fieldName: string,
  fieldType: FieldType,
  insertIdx?: number,
  extra?: { sourceZone?: DropZone; chipKey?: string; chipIndex?: number },
): ViewConfig {
  // P5+ adhoc 模式:走宽松规则(Measure → row 允许,column/value 禁用)
  const mode = viewConfig.queryMode === 'adhoc' ? 'adhoc' : 'pivot';
  if (!canDrop(fieldType, zone, mode)) {
    throw new Error(
      `[applyDrop] cannot drop ${fieldType} into ${zone} (mode=${mode})`,
    );
  }
  // adhoc 模式:措施类字段 → 强制走 row 分支(measure 落到 rows 数组,不走 value 分支)
  if (mode === 'adhoc') {
    // adhoc 只接受 row + filter,前面 canDrop 已挡住 column/value
    // Measure / Hierarchy / Dimension 等都按 RowField 处理 — 用 'Dimension' type(后端不识别细分类型)
    if (zone === 'row') {
      const cleared = {
        ...viewConfig,
        rows: viewConfig.rows.filter((r) => r.fieldName !== fieldName),
      };
      return {
        ...cleared,
        rows: insertAt(cleared.rows, insertIdx, { fieldName, type: 'Dimension' as RowColFieldType }),
      };
    }
    // zone === 'filter' 走标准 filter 分支(下面 row/column/filter 通用代码),不需要特殊处理
  }

  // P3+ value zone 特殊处理:支持同 measure 多 chip
  //   - sourceZone='value' + chipKey 命中 → REORDER 该 chip(remove 旧位 + 插新位,保留 aggregator/quickCalc)
  //   - 否则 → APPEND 新 ValueField(允许同 measureName 多 chip)
  if (zone === 'value') {
    const chipKey = extra?.chipKey;
    const chipIndex = extra?.chipIndex;
    if (extra?.sourceZone === 'value' && (chipKey || chipIndex !== undefined)) {
      const origIdx =
        chipIndex !== undefined && chipIndex >= 0 && chipIndex < viewConfig.values.length
          ? chipIndex
          : chipKey
            ? viewConfig.values.findIndex((v) => getMeasureFieldName(v) === chipKey)
            : -1;
      if (origIdx >= 0) {
        const item = viewConfig.values[origIdx]!;
        const others = viewConfig.values.filter((_, i) => i !== origIdx);
        const adjIdxLocal = adjustInsertIdxForRemove(origIdx, insertIdx);
        return { ...viewConfig, values: insertAt(others, adjIdxLocal, item) };
      }
      // chipKey/chipIndex 不在(异常情况)— 不 fallthrough APPEND,避免产生幽灵 chip
      return viewConfig;
    }
    // 字段树拖入 / 跨 zone 拖入 → APPEND;同时清理 row/column 中同名(单字段不能 row + value 并存)
    const cleared = {
      ...viewConfig,
      rows: viewConfig.rows.filter((r) => r.fieldName !== fieldName),
      columns: viewConfig.columns.filter((c) => c.fieldName !== fieldName),
    };
    return { ...cleared, values: insertAt(cleared.values, insertIdx, makeValueField(fieldName)) };
  }

  // row/column/filter target — 老 dedup 逻辑(同名字段 auto-move)
  const origIdxInTarget =
    zone === 'row'
      ? viewConfig.rows.findIndex((r) => r.fieldName === fieldName)
      : zone === 'column'
        ? viewConfig.columns.findIndex((c) => c.fieldName === fieldName)
        : -1;
  const adjIdx = adjustInsertIdxForRemove(origIdxInTarget, insertIdx);
  const cleared = removeFromAllZones(viewConfig, fieldName);

  if (zone === 'row') {
    const field = makeRowColField(fieldName, fieldType);
    return { ...cleared, rows: insertAt(cleared.rows, adjIdx, field) };
  }
  if (zone === 'column') {
    const field: ColumnField = makeRowColField(fieldName, fieldType);
    return { ...cleared, columns: insertAt(cleared.columns, adjIdx, field) };
  }
  if (zone === 'filter') {
    // 度量字段 → measureFilters；维度字段 → filters
    if (MEASURE_LIKE_TYPES.has(fieldType)) {
      // 度量已存在则不重复添加(仅 leaf 节点比较 measureName;group 节点跳过)
      const alreadyExists = cleared.measureFilters.some(
        (mf) =>
          (!('kind' in mf) || mf.kind === 'leaf' || mf.kind === undefined) &&
          (mf as { measureName: string }).measureName === fieldName,
      );
      if (alreadyExists) return cleared;
      const mfPlaceholder: MeasureFilter = {
        measureName: fieldName,
        operator: 'GreaterThan',
        value: '',
      };
      return { ...cleared, measureFilters: [...cleared.measureFilters, mfPlaceholder] };
    }
    // 维度类
    const placeholder: ClientFilter = {
      kind: 'leaf',
      field: fieldName,
      operator: 'In',
      value: [],
    };
    const alreadyExists = cleared.filters.some(
      (f) => f.kind === 'leaf' && f.field === fieldName,
    );
    return alreadyExists
      ? cleared
      : { ...cleared, filters: [...cleared.filters, placeholder] };
  }
  return cleared;
}
