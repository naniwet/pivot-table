/**
 * swapRowsColumns — 行列互换(transpose)
 *
 * 简单 swap viewConfig.rows ↔ viewConfig.columns。其他字段不动:
 *   - rowSorts/columnSorts:**不互换**(语义不同 — rowSort 是按列值给行排序,
 *     columnSort 是按行值给列排序;互换轴后,排序的 reference 会错乱)
 *   - 实际若用户希望"完全镜像",可后续扩展;先做最简语义
 *
 * MeasureGroupName chip(Σ 度量名称)在哪侧就跟着转过去 — 自然行为,无需特殊处理
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export function swapRowsColumns(viewConfig: ViewConfig): ViewConfig {
  return {
    ...viewConfig,
    rows: viewConfig.columns,
    columns: viewConfig.rows,
  };
}
