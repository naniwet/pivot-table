/**
 * buildQueryFor — 按 viewConfig.queryMode 分发到对应 builder
 *
 * 单一入口替代 PivotTable 内的 mode-fork useMemo,语义干净:
 *   - queryMode='adhoc' → buildAdhocQuery(rows + dimensionFilter,DetailQuery)
 *   - 其他 → buildQuery(完整透视)
 *
 * 不变量:
 *   - 缺必要字段(adhoc 缺 row;pivot 缺 value)→ 返回 null
 *   - builder 抛错 → 返回 null(防御性 — UI 不应因 build 失败崩溃)
 *   - 非 null 时 query 已经过 validateViewConfig
 */

import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';
import type { PageState, ViewConfig } from '../../types/viewConfig.js';

import { buildAdhocQuery } from './buildAdhocQuery.js';
import { buildQuery } from './buildQuery.js';

export function buildQueryFor(
  viewConfig: ViewConfig,
  metadata: Metadata,
  pageState: PageState,
): Query | null {
  const mode = viewConfig.queryMode === 'adhoc' ? 'adhoc' : 'pivot';
  if (mode === 'adhoc') {
    if (viewConfig.rows.length === 0) return null;
    try {
      return buildAdhocQuery(viewConfig, metadata, pageState);
    } catch {
      return null;
    }
  }
  if (viewConfig.values.length === 0) return null;
  try {
    return buildQuery(viewConfig, metadata, pageState);
  } catch {
    return null;
  }
}
