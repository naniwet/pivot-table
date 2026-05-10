/**
 * buildPageSettings — 构造 query.pageSettings
 *
 * P0 默认值参见 prd/phase-p0.md 第 3 节 QueryBuilder。
 * 待联调确认后端默认值（见 prd/1-product.md 阻塞项 2）。
 */

import type { PageState } from '../../../types/index.js';
import type { PageSettings } from '../../../types/query.js';

export function buildPageSettings(state: PageState): PageSettings {
  // showGrandTotal 是用户可见开关(UI"显示总计")
  // totalAtEnd 是后端"行总计/列总计是否开"位置标记 — 必须跟 showGrandTotal 联动,
  // 否则即使 showGrandTotal=false,后端按 totalAtEnd='true,true' 仍返回总计行
  const grandOn = state.showGrandTotal !== false;
  return {
    // P3:用户可在设置面板切换;pageState 没设(undefined)时 fallback 到 true(老默认)
    // ⚠ compressEmptyColumns=false 时后端要求 engineType: 'MDX',否则报 406(probe 实测)
    compressEmptyRows: state.compressEmptyRows !== false,
    compressEmptyColumns: state.compressEmptyColumns !== false,
    rowPageNo: state.rowPageNo,
    rowPageSize: state.rowPageSize,
    columnPageNo: state.columnPageNo,
    columnPageSize: state.columnPageSize,
    showGrandTotal: grandOn,
    subTotalAtEnd: state.subTotalAtEnd !== false,
    isCrossTable: true,
    // 跟 showGrandTotal 联动:关闭总计时两位都改 false,确保后端两路检查都说不要
    totalAtEnd: grandOn ? 'true,true' : 'false,false',
    useFormat: true,
    useDataType: true,
    useTransform: true,
    handleSpecial: true,
    isAsyncQueryColumnHeader: state.asyncColumnHeader === true,
  };
}
