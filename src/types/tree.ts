/**
 * 树状模式专属类型(P5 Phase 2 lazy-load)
 *
 * 跟现有 RenderModel 完全独立 — 树状模式走自己的 pipeline。
 */

import type { CellSet } from './cellSet.js';
import type { ColumnHeaderCell, ColumnHeaderGroupCell, RenderCell, RenderModel } from './renderModel.js';

/** 路径 key — `pathKey(parentPath)` 序列化得来,用做 cache key */
export type TreePathKey = string;

/** 单个分支的查询状态 — root + 每个展开的 parent 都有一个 BranchEntry */
export type BranchEntry =
  | {
      status: 'loading';
      /** 用于 abort(切走 / 父折叠 / viewConfig 变了) */
      controller: AbortController;
    }
  | {
      status: 'success';
      /** 该分支的 row 序列(不含 parent / 不含 grand total)*/
      rows: BranchRow[];
      /** 该分支的列头(各 branch 对齐 — root 决定即可) */
      columnHeader: ColumnHeaderCell[];
      /** 多 level 列头(cross-table) */
      columnHeaderLevels?: ColumnHeaderGroupCell[][];
      /** raw cellSet 保留(给 CSV 导出 / 调试用) */
      cellSet: CellSet;
      /** parseCellSet 输出的 RenderModel(其他 hooks/工具复用) */
      renderModel: RenderModel;
    }
  | {
      status: 'error';
      error: Error;
    };

export interface BranchRow {
  /** 该 row 最深 level 的成员(等于该 branch 的最深 row.member) */
  member: import('./cellSet.js').Member;
  /** 完整路径(含 parent path)— 用于做 expand key */
  fullPath: string[];
  /** 数据 cells(measure 数量列;跟 columnHeader 对齐) */
  cells: RenderCell[];
}

/** 树状状态 — 只在 PivotTable 组件本地持有,不入 viewConfig */
export interface TreeState {
  /** 已展开的 path key 集合 */
  expanded: ReadonlySet<TreePathKey>;
  /** 各分支 cache(loading / success / error) */
  branches: ReadonlyMap<TreePathKey, BranchEntry>;
}
