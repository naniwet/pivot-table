/**
 * setRowPage — 设置行轴当前页码（1-based）
 *
 * 防御：pageNo < 1 强制为 1（后端不接受 0/负数）。
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export function setRowPage(viewConfig: ViewConfig, pageNo: number): ViewConfig {
  const safe = Math.max(1, Math.floor(pageNo));
  return {
    ...viewConfig,
    pageState: { ...viewConfig.pageState, rowPageNo: safe },
  };
}
