/**
 * setFilters — 替换 viewConfig.filters 全集
 *
 * 用于 FilterPanel 内"用户改 operator / value / 删除某条 chip"等情况。
 * 整体替换比 per-index update 简单（filters 数组小），可读性好。
 */
import type { ClientFilter, ViewConfig } from '../../types/viewConfig.js';

export function setFilters(viewConfig: ViewConfig, filters: ClientFilter[]): ViewConfig {
  return { ...viewConfig, filters };
}
