/**
 * viewMode — 单源派生 mode flag(避免散在各组件里 grep `viewConfig.queryMode`)
 *
 * 来源:
 *   viewConfig.queryMode               'pivot' | 'adhoc'
 *   viewConfig.pageState.displayMode   'table' | 'chart' | 'tree'(undef → table)
 *
 * 派生:
 *   - isAdhoc / isPivot                 query 模式(互斥)
 *   - isTable / isChart / isTree        显示模式(三选一)
 *   - isMatrixView                      pivot + table:数据矩阵渲染场景(总计/小计/condFmt 等都要它)
 *   - isDetailView                      adhoc:行级明细(== isAdhoc 别名,语义更清楚)
 *
 * Unix 哲学:本文件**只**做派生计算,不做"如何使用"判断 — 组件 grep `viewMode.isMatrixView`
 *           比 grep `!isAdhoc && (displayMode==='table' || !displayMode)` 短且语义化。
 *
 * 加新 mode / 加新派生 flag 时:**仅改本文件**,组件无变化(只要还用现有 flag 名)。
 *
 * 迁移现状(2026-05-10):
 *   ✓ 已迁:PivotTable / useTagMenu / DropZones / FilterPanel — 这几处 mode 检查最多
 *   - 未迁:Toolbar(接 queryMode/displayMode 字符串 prop,本身只做开关 UI,不需要派生)
 *   - 未迁:dropRules.ts / buildQueryFor.ts(走 mode dispatch switch,语义更清楚)
 *   - 未迁:useViewConfig reducer(直接看 action.type 配 state,跟"派生 flag"不同维度)
 *
 * Trade-off / 反悔成本:
 *   - 派生 flag 接口稳定 → 反悔成本低(组件可以慢慢迁移)
 *   - flag 数控制在 ~10 个之内,过多说明抽象失焦,应改 mode-aware adapter 对象
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export interface ViewMode {
  // ---- 基础 ----
  /** 即席查询模式(明细 SQL 直连) */
  isAdhoc: boolean;
  /** 透视模式(默认;聚合 OLAP) — `!isAdhoc` 别名 */
  isPivot: boolean;
  /** 表格展示(默认显示形态) */
  isTable: boolean;
  /** 图表展示(echarts 渲染) */
  isChart: boolean;
  /** 树状展示(P5 lazy-load 钻取) */
  isTree: boolean;

  // ---- 高频组合 ----
  /**
   * 数据矩阵渲染 = pivot + table — 是"完整透视表"场景。
   * 只在此态下"显示总计/小计""条件格式化""快速计算"等聚合后操作才有意义。
   */
  isMatrixView: boolean;
  /** 行级明细 = adhoc;`isAdhoc` 别名,在语义上更清楚 */
  isDetailView: boolean;
}

export function computeViewMode(viewConfig: ViewConfig): ViewMode {
  const isAdhoc = viewConfig.queryMode === 'adhoc';
  const displayMode = viewConfig.pageState.displayMode ?? 'table';
  const isChart = displayMode === 'chart';
  const isTree = displayMode === 'tree';
  const isTable = !isChart && !isTree;
  return {
    isAdhoc,
    isPivot: !isAdhoc,
    isTable,
    isChart,
    isTree,
    isMatrixView: !isAdhoc && isTable,
    isDetailView: isAdhoc,
  };
}
