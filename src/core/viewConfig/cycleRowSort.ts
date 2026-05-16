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

/**
 * 排序模式 — **注意命名跟后端语义反了**(历史命名,见 ADR / 2026-05-16 接口实测):
 *   - 'global' = ASC/DESC = 实际是**分组内**排序(保留 hierarchy,组内按值排)
 *   - 'group'  = BASC/BDESC = 实际是**全局**排序(打散 hierarchy,全表按值排)
 *
 * B 前缀 = Break grouping(打破分组)。改名是大 breaking 变更,留注释提醒。
 * UI 标签已经在 useTagMenu / useColumnHeaderMenu 修正(按实际行为命名)。
 */
export type SortMode = 'global' | 'group';

export interface CycleRowSortOptions {
  /** P1.5：true 时不替换原有 rowSorts，仅在该列上做三态切换 */
  multi?: boolean;
  /** 见 SortMode 注释:'global'→ASC/DESC(实际分组内),'group'→BASC/BDESC(实际全局) */
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

// ============================================================
// 自定义排序顺序(ByCustomCaption)— P5+
// ============================================================

/**
 * 设置 / 替换某字段的自定义排序顺序。
 * 已存在同 fieldName 的 ByCustomCaption → 更新 customCaption + 重置为传入 direction(默认 ASC);
 * 不存在 → 新增一条 ByCustomCaption(ASC = 用户指定顺序)。
 *
 * 用法:用户在某 dim chip / 列头右键 "自定义排序…" → modal 拖拽成员排序 → 确定 → 调此函数 dispatch SET。
 */
export function setCustomSortOrder(
  viewConfig: ViewConfig,
  fieldName: string,
  customCaption: string[],
  direction: SortDirection = 'ASC',
): ViewConfig {
  const existing = viewConfig.rowSorts.findIndex(
    (s) => s.type === 'ByCustomCaption' && s.fieldName === fieldName,
  );
  const newSort: Sort = { type: 'ByCustomCaption', fieldName, direction, customCaption };
  if (existing !== -1) {
    const next = viewConfig.rowSorts.slice();
    next[existing] = newSort;
    return { ...viewConfig, rowSorts: next };
  }
  return { ...viewConfig, rowSorts: [...viewConfig.rowSorts, newSort] };
}

/** 移除某字段的自定义排序(留其他 sort 不动) */
export function removeCustomSortOrder(
  viewConfig: ViewConfig,
  fieldName: string,
): ViewConfig {
  return {
    ...viewConfig,
    rowSorts: viewConfig.rowSorts.filter(
      (s) => !(s.type === 'ByCustomCaption' && s.fieldName === fieldName),
    ),
  };
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
