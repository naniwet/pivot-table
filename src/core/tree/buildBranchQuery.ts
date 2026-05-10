/**
 * buildBranchQuery — 为树状模式的"某个分支"构造独立查询
 *
 * 树状模式数据流:
 *   用户展开某个父节点 P → 起一个 query,只查 P 的下一层 children
 *   parentPath=['亚洲','中国'] + viewConfig.rows=[Region,Country,City]
 *     → 查 City,filter Region='亚洲' AND Country='中国'
 *
 * 跟普通 buildQuery 的差异:
 *   - rows 数组只剩**该分支对应的那一层**(不是整套)
 *   - dimensionFilter 加上 parentPath 各 level 的 Equals 约束(AND-ed 入 user filters)
 *   - 其他(columns / values / filters / sorts / pageSettings)透传
 *
 * 不变量:
 *   I1. parentPath.length === 0 → 查顶层 rows[0]
 *   I2. parentPath.length === viewConfig.rows.length-1 → 查最深层 rows[last]
 *   I3. parentPath.length >= viewConfig.rows.length → throw(已经叶子,不能再展开)
 *   I4. user.filters 不被覆盖,parentPath 约束仅 append
 *
 * MVP 限制:
 *   - rows 仅支持 flat dim(Dimension / EnumGroup / RangeGroup / NamedSet / CalcGroup)
 *   - Hierarchy(单字段 drillDepth)在 tree 模式下行为未定义;调用方先行 fallback 到 table 模式
 *   - 不动 column 轴的多 level 拆分
 */

import { buildQuery } from '../queryBuilder/buildQuery.js';
import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';
import type { ClientFilter, ViewConfig } from '../../types/viewConfig.js';

export interface BranchQueryInput {
  viewConfig: ViewConfig;
  metadata: Metadata;
  /** 父路径成员名(从顶到底);root 分支 = [] */
  parentPath: ReadonlyArray<string>;
}

/**
 * 把 parentPath 翻成 ClientFilter[](leaf 节点,Equals 单值)。
 * 跟 user.filters 平级 AND(数组级 AND;ClientFilter 已支持)。
 */
function pathToFilters(
  parentPath: ReadonlyArray<string>,
  rows: ViewConfig['rows'],
): ClientFilter[] {
  return parentPath.map((value, i) => {
    const f = rows[i];
    if (!f) {
      throw new Error(
        `[buildBranchQuery] parentPath len ${parentPath.length} > rows len ${rows.length}`,
      );
    }
    return {
      kind: 'leaf' as const,
      field: f.fieldName,
      operator: 'Equals' as const,
      value,
    };
  });
}

export function buildBranchQuery(input: BranchQueryInput): Query {
  const { viewConfig, metadata, parentPath } = input;
  const levelIdx = parentPath.length;

  if (viewConfig.rows.length === 0) {
    throw new Error('[buildBranchQuery] viewConfig.rows is empty — tree mode requires at least 1 row dim');
  }
  if (levelIdx >= viewConfig.rows.length) {
    throw new Error(
      `[buildBranchQuery] parentPath.length=${levelIdx} >= rows.length=${viewConfig.rows.length} (already leaf)`,
    );
  }

  const branchRow = viewConfig.rows[levelIdx]!;
  if (branchRow.type === 'Hierarchy') {
    throw new Error(
      `[buildBranchQuery] Hierarchy row not supported in tree mode (P5+); fallback to table mode`,
    );
  }

  const pathFilters = pathToFilters(parentPath, viewConfig.rows);
  const branchVc: ViewConfig = {
    ...viewConfig,
    rows: [branchRow],
    filters: [...viewConfig.filters, ...pathFilters],
    // sort/measureFilters/customFields/columns 透传
  };

  return buildQuery(branchVc, metadata, viewConfig.pageState);
}

/** 把 parentPath 序列化成 stable cache key — 用  隔开成员名,避免跟成员名冲突 */
const PATH_SEP = '';

export function pathKey(parentPath: ReadonlyArray<string>): string {
  return parentPath.length === 0 ? 'root' : `root${PATH_SEP}${parentPath.join(PATH_SEP)}`;
}

export function pathFromKey(key: string): string[] {
  if (key === 'root') return [];
  return key.slice(`root${PATH_SEP}`.length).split(PATH_SEP);
}
