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

/**
 * P1 快速计算 — 2026-05-16 用真实接口逐一回测后,只保留**实测 work** 的选项。
 *
 * Wire format 重要事实(用户答疑 + 真实接口验证):
 *   - 简单 _enum 用**裸字符串**,不要包成 `{_enum: 'X'}`(否则后端转译到错路径,数据不算)
 *   - 带参数(time intelligence)用 `{_enum, ...params}` 对象形式
 *
 * 暂时未暴露(后端实施 bug,wire 怎么发都返回原值):
 *   - 占行总计 % (RowGlobalPercent)
 *   - 占列总计 % (ColumnGlobalPercent)
 *   - 占总计 %   (TotalPercent)
 *   - 累计值     (CumulativeValue — 默认参数 stub 也不可用)
 *   — 后端修复后,把对应注释解开即可
 */
export const P1_QUICK_CALCS: QuickCalcOption[] = [
  {
    label: '占分组 %',
    enumName: 'GroupPercent',
    defaultPayload: 'GroupPercent',
  },
  {
    label: '占总计 %',
    enumName: 'GlobalPercent',
    defaultPayload: 'GlobalPercent',
  },
  {
    label: '排名（从大到小）',
    enumName: 'GlobalRankDescending',
    defaultPayload: 'GlobalRankDescending',
  },
  {
    label: '排名（从小到大）',
    enumName: 'GlobalRankAscending',
    defaultPayload: 'GlobalRankAscending',
  },
  {
    label: '分组排名（从大到小）',
    enumName: 'GroupRankDescending',
    defaultPayload: 'GroupRankDescending',
  },
  {
    label: '分组排名（从小到大）',
    enumName: 'GroupRankAscending',
    defaultPayload: 'GroupRankAscending',
  },
];

/**
 * P2 时间智能（5 个）— 都依赖时间维度（dateDimension/dateLevel），由 detectTimeAxis 推导
 *
 * offset 语义:
 *   - 同期 / 上期 / 环比 → 默认 1(前 1 个周期)
 *   - 累计值              → 默认 0(在 dateLevel 边界重置,如按 Year reset 的 cumulative)
 */
function makeTimePayload(enumName: string, offset = 1) {
  return ({ timeAxis }: { timeAxis: TimeAxisInfo | null }): QuickCalculation | null => {
    if (!timeAxis) return null;
    return {
      _enum: enumName,
      dateDimension: timeAxis.dateDimension,
      dateLevel: timeAxis.dateLevel,
      offset,
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
    // 累计值 — 实测后端要求 dateDimension/dateLevel/offset,定位为 P2 时间智能
    // offset=0:在 dateLevel 边界重置(如行轴 Year+Quarter,按 Year 累计 4 个季度)
    label: '累计值',
    enumName: 'CumulativeValue',
    defaultPayload: { _enum: 'CumulativeValue' } as QuickCalculation,
    buildPayload: makeTimePayload('CumulativeValue', 0),
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
  const key = quickCalcKey(v.quickCalc);
  return key ? findQuickCalcOption(key)?.label ?? null : null;
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
 * 算出一个 QuickCalculation payload 的合成识别 key — 用于:
 *   1. @QC@ 后缀(getMeasureFieldName)
 *   2. 选项表 enumName 反查(findQuickCalcOption)
 *
 *   - 简单字符串形式('GroupPercent')→ 返回字符串本身
 *   - 对象 _enum(time intelligence 如 SamePeriodValue)→ 返回 _enum
 *   - 非法 → 返回 null
 *
 * 不变量:同一 QuickCalculation quickCalcKey 必须稳定(纯函数)。
 */
export function quickCalcKey(qc: QuickCalculation | null | undefined): string | null {
  if (qc == null) return null;
  if (typeof qc === 'string') return qc || null;
  if (typeof qc === 'object' && '_enum' in qc) {
    const base = (qc as { _enum: string })._enum;
    return base || null;
  }
  return null;
}

/**
 * 把 QuickCalculation 转成 backend wire format(只在 buildQuery 出口处用):
 *
 *   - 字符串       → 原样('GroupPercent')
 *   - 单 _enum 对象 `{_enum: 'X'}` → 字符串 'X'(防御 stale 数据 / 误传对象)
 *   - 多字段对象    → 原样(time intelligence 等带参数的)
 *
 * 关键不变量:`{_enum: 'GroupPercent'}` 跟 `'GroupPercent'` 语义等价,但后端实测
 * 只接受字符串形式;对象形式会被转译成 DataDimensionPercent/Rank 且 fields 错填,
 * quickCalc 实际不计算(2026-05-16 真实接口验证)。
 *
 * 调用点限定:仅在 buildQuery 出口处用,viewConfig.values[].quickCalc 内部表示
 * 不强制(union 接受两种)。
 */
export function normalizeQuickCalcWire(
  qc: QuickCalculation | null | undefined,
): QuickCalculation | null {
  if (qc == null) return null;
  if (typeof qc === 'string') return qc;
  if (typeof qc === 'object' && '_enum' in qc) {
    const keys = Object.keys(qc);
    // 只有 _enum 一个字段 → collapse 成字符串(后端 buggy 转译路径修复)
    // 注:TS 字面值 union 只覆盖白名单中的 _enum,任意 _enum 字符串需要 cast
    if (keys.length === 1) return (qc as { _enum: string })._enum as QuickCalculation;
    return qc;
  }
  return null;
}

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
  // 带 sort 的 rank 变体(RowGroupRank ASC vs DESC)需要在后缀里编码,否则两个 ValueField
  // 产生同名列,buildQuery 去重会丢一条。quickCalcKey 统一处理。
  const qcKey = quickCalcKey(v.quickCalc);
  if (qcKey) name = `${name}${QUICK_CALC_NAME_SEPARATOR}${qcKey}`;
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
