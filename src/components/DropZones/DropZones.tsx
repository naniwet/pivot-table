/**
 * DropZones — 四象限拖拽承载区
 *
 * 设计：
 *   - 仅负责"渲染当前 viewConfig + 接收拖拽 + 触发 callback"，不管 viewConfig 内部状态
 *   - 拖拽合法性由 canDrop（dropRules）判定，宿主在 onDrop 中自行 dispatch（一般经 useViewConfig 的 DROP_FIELD action）
 *   - draggingFieldType 由父组件维护并传入（用于实时 highlight/grey）
 *   - drop 携带的 fieldName/fieldType 通过 HTML5 dataTransfer 还原（dragProtocol.ts）
 *
 * 不做：
 *   - 区内字段重排（P1.5）
 *   - filter zone 实际筛选（P0：display only）
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';

import {
  decodePivotField,
  encodePivotField,
  PIVOT_FIELD_MIME,
} from '../../core/dropRules/dragProtocol.js';
import { canDrop, type DropZone, type FieldType } from '../../core/dropRules/dropRules.js';
import {
  findDuplicateColumnIndices,
  findDuplicateRowIndices,
  findDuplicateValueIndices,
} from '../../core/viewConfig/findDuplicates.js';
import { buildMetadataIndex } from '../../core/metadata/fieldIndex.js';
import { computeViewMode } from '../../core/viewMode/viewMode.js';
import { getAggregatorLabel } from '../../core/viewConfig/aggregators.js';
import {
  findQuickCalcOption,
  formatMeasureDisplayLabel,
  getMeasureFieldName,
} from '../../core/viewConfig/quickCalcs.js';
import {
  MEASURE_AXIS_FIELD_NAME,
  isMeasureAxisField,
} from '../../core/queryBuilder/measureAxis.js';
import {
  deriveFieldDisplayType,
  DISPLAY_TYPE_LABELS,
  type FieldDisplayType,
} from '../../core/metadata/fieldDisplayType.js';
import type { Metadata } from '../../types/metadata.js';
import type { QuickCalculation } from '../../types/query.js';
import type {
  ClientFilter,
  ClientMeasureFilter,
  ViewConfig,
} from '../../types/viewConfig.js';

/**
 * 递归收集 filter 树中所有 leaf 的 fieldName(group / nested AND-OR 都展开)。
 * 给 filter zone 渲染 chip 用 — UI 上每个 fieldName 1 个 chip(去重)。
 */
function collectFilterLeafFields(filter: ClientFilter): string[] {
  if (filter.kind === 'leaf') return [filter.field];
  return filter.children.flatMap(collectFilterLeafFields);
}

/** 度量过滤树同上 — leaf.measureName 收集 */
function collectMeasureLeafFields(mf: ClientMeasureFilter): string[] {
  if ('kind' in mf && mf.kind === 'group') {
    return mf.children.flatMap(collectMeasureLeafFields);
  }
  return [mf.measureName];
}

/** 去重保序 */
function dedupe<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  return arr.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

export interface DropZonesProps {
  viewConfig: ViewConfig;
  metadata: Metadata;
  /** 父组件维护：拖拽进行中的字段类型（用于 highlight）；未拖拽时 null/undefined */
  draggingFieldType?: FieldType | null;
  onDrop: (
    zone: DropZone,
    fieldName: string,
    fieldType: FieldType,
    insertIdx?: number,
    /** P3+ chip 内部拖动用:sourceZone + chipKey 用于精确 reorder */
    extra?: { sourceZone?: DropZone; chipKey?: string },
  ) => void;
  /**
   * × 删除单 chip 回调。第 3 参数 chipIdx 是 chip 在该 zone 数组的 index —
   * P5+ duplicate chip 精确定位用(value zone 重复时 encoded name 撞,需 idx 区分)。
   * 老 caller 不用 chipIdx,默认按 fieldName 删第一个 match(向后兼容)。
   */
  onRemove: (zone: DropZone, fieldName: string, chipIdx?: number) => void;
  /** P1.0：设置 measure 的 quickCalc（来自数值区 tag 上的菜单） */
  onSetQuickCalc?: (measureName: string, quickCalc: QuickCalculation | null) => void;
  /**
   * P1.5：zone 内字段顺序调整（上/下移一格）
   * 主要用于：cross-table 列轴调整层次（品类组放第一→顶层合并）
   */
  onMove?: (zone: DropZone, fieldName: string, direction: 'up' | 'down') => void;
  /**
   * P2 UI: 父级追踪正在 zone 间拖动的字段类型（用于 highlight 目标 zone）
   * 与字段树 dragStart 共用同一个 setDraggingFieldType 回调即可。
   */
  onTagDragStart?: (fieldType: FieldType) => void;
  /**
   * P2: chip 右键事件 — 父级渲染统一的 ContextMenu（排序 / 移动 / 快速计算 / 删除）
   * 不传则 chip 不响应右键。
   */
  onTagContextMenu?: (event: {
    zone: DropZone;
    fieldName: string;
    fieldType: FieldType;
    /**
     * P5+ duplicate chip 精确定位:chip 在该 zone 数组中的 index。
     * 用户场景:value 区两个完全同 measure+agg+qc 的 chip 共享同 encoded name,
     * 仅靠 fieldName 找会撞 → reducer 拿 chipIdx 精确定位用户点的那个 chip
     */
    chipIdx: number;
    x: number;
    y: number;
  }) => void;
  /** P3: 行列互换按钮回调;不传则不渲染该按钮 */
  onSwapRowsColumns?: () => void;
  className?: string;
  style?: CSSProperties;
}

/** P2: chip 上展示当前排序状态的 4 种箭头 */
const SORT_ARROW: Record<string, string> = {
  ASC: '↑',
  DESC: '↓',
  BASC: '↑组',
  BDESC: '↓组',
};

const ZONE_LABELS: Record<DropZone, string> = {
  row: '行轴',
  column: '列轴',
  value: '数值',
  filter: '筛选',
};

interface FieldTag {
  /** chip 唯一标识(用于 React key / remove / 右键菜单);value zone 是 encoded full name */
  name: string;
  /** 跨 zone 拖动时编码到 dataTransfer 的 fieldName(value zone 用 base measureName) */
  dragFieldName: string;
  alias: string;
  /** P2: 字段类型（zone 间互拖用 — encodePivotField 需要 fieldType） */
  fieldType: FieldType;
  /** value zone 用：当前 quickCalc 的业务名（"占行总计 %" 等）；为 null/undefined 时不显示 */
  quickCalcLabel?: string | null;
  /** P2: 当前排序方向（4 种之一，或 null 表示未参与排序） */
  sortDirection?: 'ASC' | 'DESC' | 'BASC' | 'BDESC' | null;
  /**
   * P5+ 数据类型 key — 'numeric' / 'text' / 'date' / 'boolean' / null
   *   - CSS 按这个 key 渲染图标 + 颜色(::before)
   *   - 中文短词靠 title 属性走 tooltip
   *   - 用 metadata.fields[].valueType + nodes[].type 联合推导
   *   - null:未知类型 或 sentinel(度量名称占位)— UI 不渲染图标
   */
  displayType?: FieldDisplayType | null;
  /**
   * P5+ 当前 chip 在该 mode 下不生效(灰显 + tooltip 提示)。
   * 典型场景:adhoc 模式下度量过滤器 — 后端 DetailQuery 不解析 measureFilters,
   *   chip 还在(切回 pivot 时保留意图),但视觉上明确"暂时不可用"。
   * 注:disabled 不影响交互(还能 × 删 / 右键菜单),只影响视觉。
   */
  disabled?: boolean;
  /**
   * P5+ 重复 chip 标记 — 用户拖了多个完全相同的 chip(同 fieldName / 同三元组)。
   * 拖拽不 dedup(无打断),但渲染层标红边框 + ⚠ icon,buildQuery 翻译前 first-wins dedup。
   * 用户改 chip 的 agg/qc 让 key 不再撞 → 自动清除(动态响应)。
   */
  duplicate?: boolean;
  /** duplicate 时悬停 tooltip 文本(描述如何去重) */
  duplicateReason?: string;
  /** disabled 时悬停 tooltip 文本 */
  disabledReason?: string;
}

/**
 * 根据鼠标位置 + zone 内 chip refs 算落点 idx(0..fields.length)。
 *
 * 策略:找鼠标距离最近的 chip 中心,鼠标在它左边 → idx=该 chip;右边 → idx+1。
 *   - 兼容 wrap 多行(用 2D 距离,自动按行就近)
 *   - 没有 chip 时返回 0
 */
function computeInsertIdx(
  e: DragEvent<HTMLDivElement>,
  tagsContainer: HTMLDivElement | null,
): number {
  if (!tagsContainer) return 0;
  const chips = Array.from(
    tagsContainer.querySelectorAll<HTMLElement>('[data-field-tag]'),
  );
  if (chips.length === 0) return 0;
  const my = e.clientY;
  // chip 现在垂直排列(每行一个),用 Y 轴判断"插入到哪一项之前/之后"
  let nearestIdx = 0;
  let nearestDist = Infinity;
  chips.forEach((chip, i) => {
    const r = chip.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    const d = Math.abs(cy - my);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  });
  const r = chips[nearestIdx]!.getBoundingClientRect();
  const cy = r.top + r.height / 2;
  return my < cy ? nearestIdx : nearestIdx + 1;
}

function ZoneView({
  zone,
  fields,
  draggingFieldType,
  queryMode,
  onDrop,
  onRemove,
  onTagDragStart,
  onTagContextMenu,
}: {
  zone: DropZone;
  fields: FieldTag[];
  draggingFieldType: FieldType | null | undefined;
  queryMode: 'pivot' | 'adhoc';
  onDrop: DropZonesProps['onDrop'];
  onRemove: DropZonesProps['onRemove'];
  onTagDragStart?: DropZonesProps['onTagDragStart'];
  onTagContextMenu?: DropZonesProps['onTagContextMenu'];
}): ReactNode {
  const allows = draggingFieldType ? canDrop(draggingFieldType, zone, queryMode) : null;
  const label = ZONE_LABELS[zone];
  const tagsRef = useRef<HTMLDivElement>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!draggingFieldType) return;
    if (!canDrop(draggingFieldType, zone, queryMode)) return;
    e.preventDefault(); // 标准：preventDefault 表示允许 drop
    e.dataTransfer.dropEffect = 'move';
    const idx = computeInsertIdx(e, tagsRef.current);
    if (idx !== dropTargetIdx) setDropTargetIdx(idx);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // 只在离开 zone 整体时清(rel target 不在 zone 内)— 避免 chip 间穿越触发误清
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setDropTargetIdx(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const idx = dropTargetIdx;
    setDropTargetIdx(null);
    const raw = e.dataTransfer.getData(PIVOT_FIELD_MIME);
    const payload = decodePivotField(raw);
    if (!payload) return;
    if (!canDrop(payload.fieldType, zone, queryMode)) return;
    onDrop(zone, payload.fieldName, payload.fieldType, idx ?? undefined, {
      sourceZone: payload.sourceZone,
      chipKey: payload.chipKey,
    });
  };

  const dataAttrs: Record<string, string> = {};
  if (allows !== null) dataAttrs['data-can-drop'] = String(allows);

  return (
    <div
      className={`dropzone dropzone--${zone}`}
      data-testid={`zone-${zone}`}
      data-zone={zone}
      title={
        allows === false && draggingFieldType
          ? `${draggingFieldType} 不能放入 ${label}`
          : undefined
      }
      {...dataAttrs}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone__label">{label}</div>
      <div className="dropzone__tags" ref={tagsRef} data-empty={fields.length === 0 ? 'true' : 'false'}>
        {fields.length === 0 && (
          <span className="dropzone__placeholder" aria-hidden>
            + 拖字段或右键添加
          </span>
        )}
        {fields.map((f, i) => (
          // React key:用 (encoded name, idx) tuple 防碰撞。
          // value zone 重复 chip 共享 encoded name(getMeasureFieldName 同算),
          // 单 f.name 当 key 会让 React 复用旧 DOM → 新 chip 继承旧 chip 的状态 +
          //   data-duplicate 也错位不应用 → 视觉上是"幽灵蓝色 chip" 而非红色 duplicate。
          // 业务标识 data-field-tag={f.name} 不变(duplicate 在模型里就是"看得见但不可单独操作")
          <Fragment key={`${f.name}::${i}`}>
            <span
              className="dropzone__drop-indicator"
              data-testid={`drop-indicator-${zone}-${i}`}
              data-active={dropTargetIdx === i ? 'true' : 'false'}
              aria-hidden
            />
            <span
              className="dropzone__tag"
              data-field-tag={f.name}
              data-sort-direction={f.sortDirection ?? undefined}
              data-disabled={f.disabled ? 'true' : undefined}
              data-duplicate={f.duplicate ? 'true' : undefined}
              draggable
              title={
                f.duplicate && f.duplicateReason
                  ? f.duplicateReason
                  : f.disabled && f.disabledReason
                    ? f.disabledReason
                    : '右键打开菜单(排序 / 移动 / 快速计算 / 删除)'
              }
              onDragStart={(e) => {
                try {
                  // 跨 zone 拖动:fieldName 用 dragFieldName(value zone 是 base measureName,其他 zone 同 name)
                  // 内部 reorder 用:sourceZone + chipKey(value zone chip 唯一标识)
                  e.dataTransfer.setData(
                    PIVOT_FIELD_MIME,
                    encodePivotField({
                      fieldName: f.dragFieldName,
                      fieldType: f.fieldType,
                      sourceZone: zone,
                      chipKey: f.name,
                    }),
                  );
                  e.dataTransfer.effectAllowed = 'move';
                } catch {
                  // jsdom 等环境无 dataTransfer，忽略；callback 仍触发
                }
                onTagDragStart?.(f.fieldType);
              }}
              onContextMenu={(e) => {
                if (!onTagContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                onTagContextMenu({
                  zone,
                  fieldName: f.name,
                  fieldType: f.fieldType,
                  chipIdx: i,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            >
              {/* P5+ 数据类型 icon — 在 alias 前(跟 FieldTree 同位置),CSS ::before 渲染图标
                 (Aa / # / 日 / ✓)按 data-type 切换。中文标签走 title tooltip */}
              {f.displayType && (
                <span
                  className="dropzone__tag-type"
                  data-type={f.displayType}
                  data-testid={`tag-type-${f.name}`}
                  title={`数据类型:${DISPLAY_TYPE_LABELS[f.displayType]}`}
                  aria-label={`数据类型 ${DISPLAY_TYPE_LABELS[f.displayType]}`}
                />
              )}
              {f.alias}
              {/* P5+ 重复 chip 警告 — alias 后跟一个红 ⚠;tooltip 在 chip 自身的 title 上 */}
              {f.duplicate && (
                <span
                  className="dropzone__tag-warning"
                  data-testid={`tag-warning-${f.name}`}
                  aria-label="重复字段警告"
                >
                  ⚠
                </span>
              )}
              {/* 排序状态箭头：4 种之一（仅在该字段参与排序时显示）*/}
              {f.sortDirection && (
                <span
                  className="dropzone__tag-sort"
                  data-testid={`tag-sort-${f.name}`}
                  title={`当前排序：${
                    f.sortDirection === 'ASC'
                      ? '升序'
                      : f.sortDirection === 'DESC'
                        ? '降序'
                        : f.sortDirection === 'BASC'
                          ? '分组内升序'
                          : '分组内降序'
                  }`}
                >
                  {SORT_ARROW[f.sortDirection]}
                </span>
              )}
              {f.quickCalcLabel && (
                <span className="dropzone__tag-suffix" title={f.quickCalcLabel}>
                  {' '}({f.quickCalcLabel})
                </span>
              )}
              <button
                type="button"
                className="dropzone__remove"
                data-testid={`remove-${zone}-${f.name}`}
                aria-label={`移除 ${f.alias}`}
                onClick={() => onRemove(zone, f.name, i)}
              >
                ×
              </button>
            </span>
          </Fragment>
        ))}
        {/* 末尾 indicator(idx=fields.length 即"插到末尾"位置) */}
        <span
          className="dropzone__drop-indicator"
          data-testid={`drop-indicator-${zone}-${fields.length}`}
          data-active={dropTargetIdx === fields.length ? 'true' : 'false'}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function DropZones({
  viewConfig,
  metadata,
  draggingFieldType,
  onDrop,
  onRemove,
  onTagDragStart,
  onTagContextMenu,
  onSwapRowsColumns,
  className,
  style,
}: DropZonesProps) {
  const idx = useMemo(() => buildMetadataIndex(metadata), [metadata]);
  // alias 优先级:metadata 字段 alias → customField.name(自建字段)→ 字段名(兜底)
  const customNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cf of viewConfig.customFields) m.set(cf.id, cf.name);
    return m;
  }, [viewConfig.customFields]);
  const aliasOf = (name: string): string =>
    idx.findByName(name)?.alias ?? customNameById.get(name) ?? name;
  // P5+ 数据类型 badge:从 metaIndex 推导;customField / sentinel 返回 null,UI 不渲染
  const displayTypeOf = (name: string): FieldTag['displayType'] =>
    deriveFieldDisplayType(idx.findByName(name));

  // P2: 字段当前排序方向（用于 chip 上的状态箭头）
  const sortDirOf = (fieldName: string): FieldTag['sortDirection'] => {
    for (const s of viewConfig.rowSorts) {
      const matches =
        (s.type === 'ByMeasure' && s.measureName === fieldName) ||
        (s.type === 'ByDimension' && s.fieldName === fieldName);
      if (matches) return s.direction;
    }
    return null;
  };

  // 是否已显式放置度量轴占位字段（在 rows 或 columns 任意一处）？
  const measureAxisInRows = viewConfig.rows.some(isMeasureAxisField);
  const measureAxisInColumns = viewConfig.columns.some(isMeasureAxisField);
  const measureAxisExplicit = measureAxisInRows || measureAxisInColumns;

  // P5+ 重复 chip 检测 — 计算 row/column/value 三个 zone 的 duplicate index 集合
  // 拖拽不 dedup,这里仅做视觉标记;buildQuery 翻译前会用同一份逻辑 first-wins dedup
  const dupRowIdx = findDuplicateRowIndices(viewConfig.rows);
  const dupColumnIdx = findDuplicateColumnIndices(viewConfig.columns);
  const dupValueIdx = findDuplicateValueIndices(viewConfig.values);
  const DUP_REASON_ROW = '跟前面 chip 完全相同,本次查询会忽略(buildQuery first-wins 去重);移除此 chip 或改字段';
  const DUP_REASON_VALUE = '跟前面 chip 完全相同,本次查询会忽略;改聚合方式或快速计算去重';

  // RowField/ColumnField 的 type 是 RowColFieldType（'Hierarchy'/'Dimension'/'CalcGroup'/'NamedSet'/...），
  // 与 dropRules 的 FieldType 名称一致；直接当 FieldType 用。
  const rowFields: FieldTag[] = viewConfig.rows.map((r, i) => ({
    name: r.fieldName,
    dragFieldName: r.fieldName,
    alias: isMeasureAxisField(r) ? 'Σ 度量名称' : aliasOf(r.fieldName),
    fieldType: r.type as FieldType,
    displayType: isMeasureAxisField(r) ? null : displayTypeOf(r.fieldName),
    duplicate: dupRowIdx.has(i),
    duplicateReason: dupRowIdx.has(i) ? DUP_REASON_ROW : undefined,
  }));
  const columnFields: FieldTag[] = viewConfig.columns.map((c, i) => ({
    name: c.fieldName,
    dragFieldName: c.fieldName,
    alias: isMeasureAxisField(c) ? 'Σ 度量名称' : aliasOf(c.fieldName),
    fieldType: c.type as FieldType,
    displayType: isMeasureAxisField(c) ? null : displayTypeOf(c.fieldName),
    duplicate: dupColumnIdx.has(i),
    duplicateReason: dupColumnIdx.has(i) ? DUP_REASON_ROW : undefined,
  }));
  // 用户没显式拖动 → 在列轴末尾**隐式**显示一个 Σ chip（占位，告诉用户度量在列）
  // 拖到行后 viewConfig 真正记录此字段（implicit → explicit）
  if (!measureAxisExplicit && viewConfig.values.length > 0) {
    columnFields.push({
      name: MEASURE_AXIS_FIELD_NAME,
      dragFieldName: MEASURE_AXIS_FIELD_NAME,
      alias: 'Σ 度量名称',
      fieldType: 'MeasureGroupName',
    });
  }
  // P3+ value zone:同 measureName + 不同 aggregator/quickCalc 是不同 chip。
  //   chip 标识用 encoded full name = getMeasureFieldName(v),保证 React key / remove / 右键菜单都精确到单 chip。
  //   显示别名用 baseAlias + (aggregator label, quickCalc label) 后缀。
  //   跨 zone 拖动用 base measureName(其他 zone 不认 encoded 名)。
  const valueFields: FieldTag[] = viewConfig.values.map((v, i) => {
    const qcLabel = v.quickCalc
      ? (findQuickCalcOption((v.quickCalc as { _enum: string })._enum)?.label ?? null)
      : null;
    const aggLabel = v.aggregator ? getAggregatorLabel(v.aggregator) : null;
    return {
      name: getMeasureFieldName(v),
      dragFieldName: v.measureName,
      alias: formatMeasureDisplayLabel(aliasOf(v.measureName), qcLabel, aggLabel),
      // value zone 的字段统一按 Measure 处理(measureName → Measure / CalcMeasure,
      // 拖到行/列的 dropRules 会拒绝,预期行为正确)
      fieldType: 'Measure' as FieldType,
      quickCalcLabel: null, // 已 inline 到 alias,不再单独显示
      displayType: displayTypeOf(v.measureName),
      duplicate: dupValueIdx.has(i),
      duplicateReason: dupValueIdx.has(i) ? DUP_REASON_VALUE : undefined,
    };
  });
  // 派生 mode flag(单源 — computeViewMode);adhoc 下 measureFilter 灰显,zone 显示规则 等都用它
  const viewMode = computeViewMode(viewConfig);
  const isAdhocMode = viewMode.isAdhoc;

  // P1.0 / P5+:filter zone 渲染所有 fieldName 涉及的 chip(递归扫 AND/OR group 树)
  // 维度过滤 + 度量过滤分别去重 — 同 fieldName 在多个 group / leaf 出现也只 1 个 chip
  // 删除 × → removeFieldFromZone 已递归裁所有相关 leaf(group 空了自动清),不用改 reducer
  const dimensionFilterFields = dedupe(
    viewConfig.filters.flatMap(collectFilterLeafFields),
  );
  const measureFilterFields = dedupe(
    viewConfig.measureFilters.flatMap(collectMeasureLeafFields),
  );
  const filterFields: FieldTag[] = [
    ...dimensionFilterFields.map(
      (fName): FieldTag => ({
        name: fName,
        dragFieldName: fName,
        alias: aliasOf(fName),
        // 维度 filter 默认 'Dimension'(实际 type 不影响拖到 row/column,dropRules 一致)
        fieldType: 'Dimension' as FieldType,
        displayType: displayTypeOf(fName),
      }),
    ),
    ...measureFilterFields.map(
      (mName): FieldTag => ({
        name: mName,
        dragFieldName: mName,
        alias: aliasOf(mName),
        fieldType: 'Measure' as FieldType,
        displayType: displayTypeOf(mName),
        // adhoc 模式下度量过滤不生效 → 灰显
        disabled: isAdhocMode,
        disabledReason: isAdhocMode
          ? '即席查询(明细)模式不支持度量过滤;切回透视模式生效'
          : undefined,
      }),
    ),
  ];

  // 给所有 chip 附上当前排序方向
  const annotate = (fields: FieldTag[]): FieldTag[] =>
    fields.map((f) => ({ ...f, sortDirection: sortDirOf(f.name) }));

  // P5+ adhoc 模式:只显示行 + 筛选两个区(column/value 隐藏);行列互换按钮也不渲染
  const isAdhoc = viewMode.isAdhoc;

  return (
    <div
      className={className ? `dropzones ${className}` : 'dropzones'}
      style={style}
      data-query-mode={viewConfig.queryMode ?? 'pivot'}
    >
      <ZoneView
        zone="row"
        fields={annotate(rowFields)}
        draggingFieldType={draggingFieldType}
        queryMode={isAdhoc ? 'adhoc' : 'pivot'}
        onDrop={onDrop}
        onRemove={onRemove}
        onTagDragStart={onTagDragStart}
        onTagContextMenu={onTagContextMenu}
      />
      {!isAdhoc && onSwapRowsColumns && (
        <button
          type="button"
          className="dropzones__swap"
          data-testid="dropzones-swap"
          title="行列互换 — 把行字段和列字段对调"
          onClick={onSwapRowsColumns}
          aria-label="行列互换"
        >
          ⇅
        </button>
      )}
      {!isAdhoc && (
        <>
          <ZoneView
            zone="column"
            fields={annotate(columnFields)}
            draggingFieldType={draggingFieldType}
            queryMode="pivot"
            onDrop={onDrop}
            onRemove={onRemove}
            onTagDragStart={onTagDragStart}
            onTagContextMenu={onTagContextMenu}
          />
          <ZoneView
            zone="value"
            fields={annotate(valueFields)}
            draggingFieldType={draggingFieldType}
            queryMode="pivot"
            onDrop={onDrop}
            onRemove={onRemove}
            onTagDragStart={onTagDragStart}
            onTagContextMenu={onTagContextMenu}
          />
        </>
      )}
      <ZoneView
        zone="filter"
        fields={annotate(filterFields)}
        draggingFieldType={draggingFieldType}
        queryMode={isAdhoc ? 'adhoc' : 'pivot'}
        onDrop={onDrop}
        onRemove={onRemove}
        onTagDragStart={onTagDragStart}
        onTagContextMenu={onTagContextMenu}
      />
    </div>
  );
}
