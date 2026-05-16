/**
 * P1.0 + P2 快速计算（QuickCalc）— 业务名 ↔ 后端枚举映射
 *
 * P1.0 5 个：占行/列/总计 % / 排名 / 累计值 — [docs/prd/phase-p1.md](../../../../docs/prd/phase-p1.md) §7
 * P2  4 个：同期值 / 同比 / 上期 / 环比 — [docs/prd/phase-p2.md](../../../../docs/prd/phase-p2.md) §7
 *
 * 严禁把后端枚举直接暴露给用户：业务名以 label 字段为准。
 *
 * 时间智能（P2）的 dateDimension/dateLevel 由 detectTimeAxis(viewConfig, metadata)
 * 自动推导，调用方在选中时把 ctx 传进 buildPayload。
 */
import type { QuickCalculation } from '../../types/query.js';
import type { TimeAxisInfo } from '../timeAxis/detectTimeAxis.js';

export interface QuickCalcOption {
  /** 业务名（中文，UI 显示） */
  label: string;
  /** 后端枚举名 */
  enumName: string;
  /** 默认 args（无需 ctx 的简单情况）；P2 时间智能用 buildPayload */
  defaultPayload: QuickCalculation;
  /**
   * 选中时根据 context 构造 payload（P2 时间智能：填 dateDimension/dateLevel）
   * 返回 null 表示当前 context 不满足（如时间维度不存在）→ UI 应阻止选中
   */
  buildPayload?: (ctx: { timeAxis: TimeAxisInfo | null }) => QuickCalculation | null;
  /** 选项是否依赖时间维度（UI 据此对 disable 状态做提示） */
  requiresTimeAxis?: boolean;
}

export const P1_QUICK_CALCS: QuickCalcOption[] = [
  {
    label: '占行总计 %',
    enumName: 'RowGlobalPercent',
    defaultPayload: { _enum: 'RowGlobalPercent' },
  },
  {
    label: '占列总计 %',
    enumName: 'ColumnGlobalPercent',
    defaultPayload: { _enum: 'ColumnGlobalPercent' },
  },
  {
    label: '占总计 %',
    enumName: 'TotalPercent',
    defaultPayload: { _enum: 'TotalPercent' },
  },
  {
    label: '占分组 %',
    enumName: 'GroupPercent',
    defaultPayload: { _enum: 'GroupPercent' },
  },
  {
    label: '排名（从大到小）',
    enumName: 'GlobalRankDescending',
    defaultPayload: { _enum: 'GlobalRankDescending' },
  },
  {
    label: '排名（从小到大）',
    enumName: 'GlobalRankAscending',
    defaultPayload: { _enum: 'GlobalRankAscending' },
  },
  {
    label: '分组排名（从大到小）',
    enumName: 'GroupRankDescending',
    defaultPayload: { _enum: 'GroupRankDescending' },
  },
  {
    label: '分组排名（从小到大）',
    enumName: 'GroupRankAscending',
    defaultPayload: { _enum: 'GroupRankAscending' },
  },
  {
    label: '累计值',
    enumName: 'CumulativeValue',
    // CumulativeValue 实际需要 dateDimension/dateLevel/offset；P1.0 用空 stub，
    // 待 FilterPanel 之类的配置 UI 补齐参数后再用
    defaultPayload: {
      _enum: 'CumulativeValue',
      dateDimension: '',
      dateLevel: '',
      offset: 0,
    } as QuickCalculation,
  },
];

/**
 * P2 时间智能（4 个）— 都依赖时间维度（dateDimension/dateLevel），由 detectTimeAxis 推导
 * offset 默认 1（同期/同比的"前 1 个周期"）
 */
function makeTimePayload(enumName: string) {
  return ({ timeAxis }: { timeAxis: TimeAxisInfo | null }): QuickCalculation | null => {
    if (!timeAxis) return null;
    return {
      _enum: enumName,
      dateDimension: timeAxis.dateDimension,
      dateLevel: timeAxis.dateLevel,
      offset: 1,
    } as QuickCalculation;
  };
}

export const P2_TIME_QUICK_CALCS: QuickCalcOption[] = [
  {
    label: '同期值',
    enumName: 'SamePeriodValue',
    defaultPayload: { _enum: 'SamePeriodValue' } as QuickCalculation,
    buildPayload: makeTimePayload('SamePeriodValue'),
    requiresTimeAxis: true,
  },
  {
    label: '同比增长率',
    enumName: 'SamePeriodRatioIncrease',
    defaultPayload: { _enum: 'SamePeriodRatioIncrease' } as QuickCalculation,
    buildPayload: makeTimePayload('SamePeriodRatioIncrease'),
    requiresTimeAxis: true,
  },
  {
    label: '上期值',
    enumName: 'PrevPeriodValue',
    defaultPayload: { _enum: 'PrevPeriodValue' } as QuickCalculation,
    buildPayload: makeTimePayload('PrevPeriodValue'),
    requiresTimeAxis: true,
  },
  {
    label: '环比增长率',
    enumName: 'PrevPeriodRatioIncrease',
    defaultPayload: { _enum: 'PrevPeriodRatioIncrease' } as QuickCalculation,
    buildPayload: makeTimePayload('PrevPeriodRatioIncrease'),
    requiresTimeAxis: true,
  },
];

/** P1 + P2 全集（UI 渲染顺序） */
export const ALL_QUICK_CALCS: QuickCalcOption[] = [
  ...P1_QUICK_CALCS,
  ...P2_TIME_QUICK_CALCS,
];

/** 通过 enumName 在选项里找业务标签（反向） */
export function findQuickCalcOption(enumName: string): QuickCalcOption | undefined {
  return ALL_QUICK_CALCS.find((q) => q.enumName === enumName);
}

/**
 * 取 viewConfig.values 中 measureName 对应 entry 的 quickCalc 业务标签。
 *   - 没有 entry / quickCalc=null / 解析不到 enum → null
 *   - 例:返回 '同期值' / '占行总计 %' 等
 *
 * 用于在 PivotRenderer 列头 / DropZones chip / CSV 导出表头处给 measure 加 (label) 后缀,
 * 避免同一 measure 原值列和 quickCalc 列名字相同混淆用户。
 */
export function getValueQuickCalcLabel(
  values: ReadonlyArray<{ measureName: string; quickCalc?: QuickCalculation | null | undefined }>,
  measureName: string,
): string | null {
  const v = values.find((x) => x.measureName === measureName);
  if (!v?.quickCalc) return null;
  const qc = v.quickCalc;
  if (typeof qc !== 'object' || !('_enum' in qc)) return null;
  const enumName = (qc as { _enum: string })._enum;
  return findQuickCalcOption(enumName)?.label ?? null;
}

/**
 * 把 measure 的 alias 加上聚合 / quickCalc 后缀(全角括号)。
 *   formatMeasureDisplayLabel('销售额', '同期值', null)  === '销售额（同期值）'
 *   formatMeasureDisplayLabel('销售额', null, '平均值')  === '销售额（平均值）'
 *   formatMeasureDisplayLabel('销售额', '同期值', '平均值') === '销售额（平均值, 同期值）'
 *   formatMeasureDisplayLabel('销售额', null, null)     === '销售额'
 *
 * 兼容 P1.0 老调用方(只传 2 个参数 = 只有 quickCalcLabel),agg 当 null 处理。
 */
export function formatMeasureDisplayLabel(
  alias: string,
  quickCalcLabel: string | null | undefined,
  aggregatorLabel?: string | null | undefined,
): string {
  const parts: string[] = [];
  if (aggregatorLabel) parts.push(aggregatorLabel);
  if (quickCalcLabel) parts.push(quickCalcLabel);
  if (parts.length === 0) return alias;
  return `${alias}（${parts.join(', ')}）`;
}

/** quickCalc / aggregator override 后缀分隔符 — `@QC@` / `@AGG@`。
 *  选 '@xxx@':@ 不出现在合规 measureName(后端 fieldName 仅 [字符/字母/数字/_]),
 *  双 @ 防止跟万一带 @ 的 measureName 冲突。
 *  顺序固定:`<name>@AGG@<agg>@QC@<enum>` — 解析时按位置切。
 */
const QUICK_CALC_NAME_SEPARATOR = '@QC@';
const AGGREGATOR_NAME_SEPARATOR = '@AGG@';

/**
 * 计算 query.fields[].name(给后端 cellSet 列别名用)。
 *
 *   - 无 quickCalc + 无 aggregator → 直接返回 measureName
 *   - 有 aggregator override        → `<measure>@AGG@<AGG>`
 *   - 有 quickCalc                  → 在最后追加 `@QC@<enum>`
 *
 * 这个函数同时用于:
 *   1. buildQuery → query.fields[].name 写入
 *   2. translateSorts → sort.measure.name 写入(sort 引用的就是这个 fields[].name)
 *   3. parseCellSet → 反查:cellSet 返回的 column fieldName 也是这个新 name,
 *      用 splitMeasureFieldName 拆出原 measureName 查 metadata
 */
export function getMeasureFieldName(v: {
  measureName: string;
  aggregator?: import('../../types/query.js').Aggregator | null | undefined;
  quickCalc?: QuickCalculation | null | undefined;
}): string {
  let name = v.measureName;
  if (v.aggregator) name = `${name}${AGGREGATOR_NAME_SEPARATOR}${v.aggregator}`;
  if (v.quickCalc && typeof v.quickCalc === 'object' && '_enum' in v.quickCalc) {
    const enumName = (v.quickCalc as { _enum: string })._enum;
    name = `${name}${QUICK_CALC_NAME_SEPARATOR}${enumName}`;
  }
  return name;
}

/**
 * 反向:从 query.fields[].name(可能带 @AGG@/@QC@ 后缀)拆出原 measureName/aggregator/quickCalcEnum。
 *   splitMeasureFieldName('销售额_m@QC@SamePeriodValue')   → { measureName: '销售额_m', aggregator: null, quickCalcEnum: 'SamePeriodValue' }
 *   splitMeasureFieldName('销售额_m@AGG@AVG')              → { measureName: '销售额_m', aggregator: 'AVG', quickCalcEnum: null }
 *   splitMeasureFieldName('销售额_m@AGG@AVG@QC@RowGlobal') → { measureName: '销售额_m', aggregator: 'AVG', quickCalcEnum: 'RowGlobal' }
 *   splitMeasureFieldName('销售额_m')                       → { measureName: '销售额_m', aggregator: null, quickCalcEnum: null }
 */
export function splitMeasureFieldName(rawName: string): {
  measureName: string;
  aggregator: string | null;
  quickCalcEnum: string | null;
} {
  let name = rawName;
  let quickCalcEnum: string | null = null;
  const qcIdx = name.lastIndexOf(QUICK_CALC_NAME_SEPARATOR);
  if (qcIdx !== -1) {
    quickCalcEnum = name.slice(qcIdx + QUICK_CALC_NAME_SEPARATOR.length);
    name = name.slice(0, qcIdx);
  }
  let aggregator: string | null = null;
  const aggIdx = name.lastIndexOf(AGGREGATOR_NAME_SEPARATOR);
  if (aggIdx !== -1) {
    aggregator = name.slice(aggIdx + AGGREGATOR_NAME_SEPARATOR.length);
    name = name.slice(0, aggIdx);
  }
  return { measureName: name, aggregator, quickCalcEnum };
}
