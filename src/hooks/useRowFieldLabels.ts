/**
 * useRowFieldLabels — 行表头 corner 显示的字段 alias 数组
 *
 * 2026-05-17:整段纯逻辑已下沉到 core/viewConfig/rowFieldLabels.ts
 *   (computeRowFieldLabels)。本 hook 退化为 useMemo 1 行包装,只剩 React 集成职责。
 */

import { useMemo } from 'react';

import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import { computeRowFieldLabels } from '../core/viewConfig/rowFieldLabels.js';
import type { ViewConfig } from '../types/viewConfig.js';

export function useRowFieldLabels(
  viewConfig: ViewConfig,
  metaIndex: MetadataIndex,
): string[] {
  return useMemo(
    () => computeRowFieldLabels(viewConfig, metaIndex),
    [viewConfig.rows, viewConfig.customFields, metaIndex],
  );
}
