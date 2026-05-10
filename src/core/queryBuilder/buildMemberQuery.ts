/**
 * buildMemberQuery — 取某字段 distinct 成员的最小查询 (不要求 measure)
 *
 * 与 buildQuery 不同:loadMembers / "某字段成员列表" 等场景只需要查询那一个字段
 * 作为行轴,不需要 measure (后端把每个成员作为一行返回)。
 *
 * 设计:
 *   - 跳过 buildQuery 的 measure 必填校验
 *   - 仅校验 field 在 metadata 中存在 (防御)
 *   - pageSettings 用合理默认值 (rowPageSize=1000;distinct 集通常 < 1k)
 */
import type { Metadata } from '../../types/metadata.js';
import type { Query } from '../../types/query.js';
import { buildMetadataIndex } from '../metadata/fieldIndex.js';

import { buildPageSettings } from './translators/pageSettings.js';

export interface BuildMemberQueryOptions {
  pageSize?: number;
}

export function buildMemberQuery(
  field: string,
  metadata: Metadata,
  options: BuildMemberQueryOptions = {},
): Query {
  const idx = buildMetadataIndex(metadata);
  if (!idx.findByName(field)) {
    throw new Error(
      `[buildMemberQuery] field "${field}" not in metadata`,
    );
  }
  const pageSize = options.pageSize ?? 1000;
  return {
    modelId: metadata.id,
    queryType: 'PivotQuery',
    rows: [field],
    columns: [],
    fields: [],
    filters: [],
    measureFilters: [],
    rowSorts: [],
    columnSorts: [],
    pageSettings: buildPageSettings({
      rowPageSize: pageSize,
      rowPageNo: 1,
      columnPageSize: 1,
      columnPageNo: 1,
    }),
    customElements: [],
  };
}
