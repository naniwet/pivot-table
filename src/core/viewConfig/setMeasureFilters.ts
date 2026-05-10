/**
 * setMeasureFilters — 替换 viewConfig.measureFilters 全集
 *
 * 用于 FilterPanel 内"用户改度量 operator / value / 删除度量 chip"等情况。
 * 整体替换比 per-index update 简单（数组小），可读性好。
 */
import type { ClientMeasureFilter, ViewConfig } from '../../types/viewConfig.js';

export function setMeasureFilters(
  viewConfig: ViewConfig,
  measureFilters: ClientMeasureFilter[],
): ViewConfig {
  return { ...viewConfig, measureFilters };
}
