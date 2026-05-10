/**
 * cycleRowSort — 点击列头切换排序方向（三态机：none → DESC → ASC → none）
 *
 * P1.0 起支持两种排序：
 *   - ByMeasure（点度量列头）→ 按该 measure 数值排序
 *   - ByDimension（点维度列头）→ 按该维度成员字典序排序
 *
 * P1.5：多列排序（shift+click）
 *   - 普通 click（默认）：替换为单列
 *   - shift+click（multi=true）：在原 rowSorts 上原位增/减/切换该列，其他列保留
 *
 * 切换不同字段（普通 click）时重置为 DESC。
 */

import type { Sort, SortDirection, ViewConfig } from '../../types/viewConfig.js';

export type SortKind = 'ByMeasure' | 'ByDimension';

/** 排序模式：global = ASC/DESC（默认），group = BASC/BDESC（分组内，P2） */
export type SortMode = 'global' | 'group';

export interface CycleRowSortOptions {
  /** P1.5：true 时不替换原有 rowSorts，仅在该列上做三态切换 */
  multi?: boolean;
  /** P2：'global'(ASC/DESC) 或 'group'(BASC/BDESC)；默认 global */
  mode?: SortMode;
}

function buildSort(kind: SortKind, fieldName: string, direction: SortDirection): Sort {
  return kind === 'ByMeasure'
    ? { type: 'ByMeasure', measureName: fieldName, direction }
    : { type: 'ByDimension', fieldName, direction };
}

/** 根据 mode 选 (DESC, ASC) 或 (BDESC, BASC) */
function dirsForMode(mode: SortMode): { desc: SortDirection; asc: SortDirection } {
  return mode === 'group'
    ? { desc: 'BDESC', asc: 'BASC' }
    : { desc: 'DESC', asc: 'ASC' };
}

function isDescendingDir(d: SortDirection): boolean {
  return d === 'DESC' || d === 'BDESC';
}

function isAscendingDir(d: SortDirection): boolean {
  return d === 'ASC' || d === 'BASC';
}

function getSortFieldName(s: Sort): string {
  return s.type === 'ByMeasure' ? s.measureName : s.fieldName;
}

function matchesField(s: Sort, kind: SortKind, fieldName: string): boolean {
  return s.type === kind && getSortFieldName(s) === fieldName;
}

export function cycleRowSort(
  viewConfig: ViewConfig,
  fieldName: string,
  kind: SortKind = 'ByMeasure',
  options: CycleRowSortOptions = {},
): ViewConfig {
  const multi = options.multi === true;
  const mode: SortMode = options.mode ?? 'global';
  const { desc, asc } = dirsForMode(mode);

  if (multi) {
    const existingIdx = viewConfig.rowSorts.findIndex((s) => matchesField(s, kind, fieldName));
    let nextSorts: Sort[];
    if (existingIdx === -1) {
      nextSorts = [...viewConfig.rowSorts, buildSort(kind, fieldName, desc)];
    } else {
      const current = viewConfig.rowSorts[existingIdx]!;
      if (isDescendingDir(current.direction)) {
        // 原位 DESC/BDESC → ASC/BASC（保持当前 mode）
        nextSorts = viewConfig.rowSorts.map((s, i) =>
          i === existingIdx ? buildSort(kind, fieldName, asc) : s,
        );
      } else if (isAscendingDir(current.direction)) {
        // 原位 ASC/BASC → 移除
        nextSorts = viewConfig.rowSorts.filter((_, i) => i !== existingIdx);
      } else {
        // 防御：未知 direction → 重置为本 mode 的 desc
        nextSorts = viewConfig.rowSorts.map((s, i) =>
          i === existingIdx ? buildSort(kind, fieldName, desc) : s,
        );
      }
    }
    return { ...viewConfig, rowSorts: nextSorts };
  }

  // 单列模式（默认）
  const current = viewConfig.rowSorts[0];
  let nextSorts: Sort[];
  if (!current || current.type !== kind || getSortFieldName(current) !== fieldName) {
    nextSorts = [buildSort(kind, fieldName, desc)];
  } else if (isDescendingDir(current.direction)) {
    nextSorts = [buildSort(kind, fieldName, asc)];
  } else {
    // ASC/BASC → none
    nextSorts = [];
  }
  return { ...viewConfig, rowSorts: nextSorts };
}
