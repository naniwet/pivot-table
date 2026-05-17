/**
 * buildCellMenuItems — 单元格右键菜单 ContextMenuItem[] 构造器(纯函数)
 *
 * 收益(Unix):原 useCellMenu hook 内的 3 个 private helper + menu 决策 整段下沉到 core
 *   (~80 行)。dispatch/callback 留 hook 层。
 *
 * 当前唯一菜单项:**查看明细**(drill-through);自建度量 cell 不可 drill。
 *
 * 不变量:
 *   I1. cellMenu=null / drillThroughEnabled=false / cellSet=null → 空 items(三段 guard)
 *   I2. 当前 cell 对应自建 measure(customField.id 匹配)→ 空 items
 *   I3. 正常 cell → 返回 1 个 "查看明细" item
 *   I4. onClick → 优先 onDrillThrough(query),回退 onSetDetailContext({query, chips})
 *   I5. chips 来自 row+col Member,跳过 Measures dimension / (All) level
 *   I6. viewConfig.filters > 0 → chips 末尾追加 "维度过滤(N 条)" 摘要
 */
import { buildDetailQuery } from '../drillThrough/buildDetailQuery.js';
import type { CellSet, Member } from '../../types/cellSet.js';
import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';
import type { ViewConfig } from '../../types/viewConfig.js';
import type { MetadataIndex } from '../metadata/fieldIndex.js';
import { splitMeasureFieldName } from '../viewConfig/quickCalcs.js';

import type { ContextMenuItem } from './menuItem.js';

export interface CellMenuTarget {
  rowIndex: number;
  colIndex: number;
  x: number;
  y: number;
}

export interface CellMenuContext {
  cellMenu: CellMenuTarget | null;
  drillThroughEnabled: boolean;
  cellSet: CellSet | null;
  viewConfig: ViewConfig;
  metadata: Metadata;
  metaIndex: MetadataIndex;
}

export interface CellMenuCallbacks {
  /** 宿主自定 — 接管 query 不弹内置 modal */
  onDrillThrough?: (query: Query) => void;
  /** 弹内置 DetailModal 的回调 */
  onSetDetailContext: (ctx: { query: Query; chips: string[] }) => void;
}

/** I5/I6:row+col tuple → 上下文 chip 摘要(度量 / 总计 member 跳过)*/
export function buildDetailContextChips(
  rowMember: Member[],
  colMember: Member[],
  viewConfig: ViewConfig,
  metaIndex: MetadataIndex,
): string[] {
  const chips: string[] = [];
  const memberToChip = (m: Member): string | null => {
    if (m.dimension === 'Measures') return null;
    if (m.level === '(All)') return null;
    const alias = metaIndex.findByName(m.fieldName)?.alias ?? m.fieldName;
    return `${alias}: ${m.name}`;
  };
  for (const m of rowMember) {
    const c = memberToChip(m);
    if (c) chips.push(c);
  }
  for (const m of colMember) {
    const c = memberToChip(m);
    if (c) chips.push(c);
  }
  if (viewConfig.filters.length > 0) {
    chips.push(`维度过滤(${viewConfig.filters.length} 条)`);
  }
  return chips;
}

/** 推断当前 cell 对应哪个 measureName(列/行轴含 Measures member 优先,否则 single value 兜底)*/
export function getCellMeasureName(
  rowMember: Member[],
  colMember: Member[],
  viewConfig: ViewConfig,
): string | null {
  for (const m of [...rowMember, ...colMember]) {
    if (m.dimension === 'Measures') {
      return splitMeasureFieldName(m.fieldName).measureName;
    }
  }
  if (viewConfig.values.length === 1) {
    return splitMeasureFieldName(viewConfig.values[0]!.measureName).measureName;
  }
  return null;
}

/** I2:当前 cell 对应自建 measure? */
export function isCustomFieldCell(
  rowMember: Member[],
  colMember: Member[],
  viewConfig: ViewConfig,
): boolean {
  if (viewConfig.customFields.length === 0) return false;
  const measureName = getCellMeasureName(rowMember, colMember, viewConfig);
  if (!measureName) return false;
  return viewConfig.customFields.some((field) => field.id === measureName);
}

export function buildCellMenuItems(
  ctx: CellMenuContext,
  callbacks: CellMenuCallbacks,
): ContextMenuItem[] {
  const { cellMenu, drillThroughEnabled, cellSet, viewConfig, metadata, metaIndex } = ctx;
  const { onDrillThrough, onSetDetailContext } = callbacks;
  // I1: 三段 guard
  if (!cellMenu || !drillThroughEnabled || !cellSet) return [];
  const rowMember = cellSet.rows[cellMenu.rowIndex] ?? [];
  const colMember = cellSet.columns[cellMenu.colIndex] ?? [];
  // I2: 自建 measure cell 不可 drill
  if (isCustomFieldCell(rowMember, colMember, viewConfig)) return [];
  return [
    {
      key: 'drill-through',
      label: '查看明细',
      onClick: () => {
        const q = buildDetailQuery({ viewConfig, metadata, rowMember, colMember });
        const chips = buildDetailContextChips(rowMember, colMember, viewConfig, metaIndex);
        // I4: 优先 onDrillThrough,fallback onSetDetailContext
        if (onDrillThrough) {
          onDrillThrough(q);
        } else {
          onSetDetailContext({ query: q, chips });
        }
      },
    },
  ];
}
