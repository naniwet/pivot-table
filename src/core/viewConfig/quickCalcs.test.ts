/**
 * quickCalcs — 快速计算选项表 + measure name 编解码
 *
 * 不变量:
 *   I1. P1 / P2 / ALL 选项表完整且 enumName 唯一(给后端的 enum 不重)
 *   I2. P2 时间智能 buildPayload:有 timeAxis 填字段,无 timeAxis 返回 null(UI 据此 disable)
 *   I3. findQuickCalcOption 反查命中 / miss
 *   I4. getValueQuickCalcLabel 取业务标签(values 索引 / null 处理)
 *   I5. formatMeasureDisplayLabel 4 种组合:无 / agg / quickCalc / 两者
 *   I6. getMeasureFieldName 编码:加 @AGG@ / @QC@ 后缀(顺序固定)
 *   I7. splitMeasureFieldName 解码:剥后缀回原 name + 抽 aggregator + quickCalc
 *   I8. 编 → 解 round-trip 等值(关键不变量,parseCellSet 反查依赖)
 */
import { describe, expect, it } from 'vitest';

import type { TimeAxisInfo } from '../timeAxis/detectTimeAxis.js';

import {
  ALL_QUICK_CALCS,
  P1_QUICK_CALCS,
  P2_TIME_QUICK_CALCS,
  findQuickCalcOption,
  formatMeasureDisplayLabel,
  getMeasureFieldName,
  getValueQuickCalcLabel,
  splitMeasureFieldName,
} from './quickCalcs.js';

const SAMPLE_TIME_AXIS: TimeAxisInfo = {
  dateDimension: 'OrderDate',
  dateLevel: 'Month',
} as TimeAxisInfo;

describe('quickCalcs — 选项表(I1)', () => {
  it('P1 9 个(+GroupPercent +GlobalRankAscending +GroupRankDescending +GroupRankAscending) / P2 4 个 / ALL = 13', () => {
    expect(P1_QUICK_CALCS).toHaveLength(9);
    expect(P2_TIME_QUICK_CALCS).toHaveLength(4);
    expect(ALL_QUICK_CALCS).toHaveLength(13);
  });

  it('每个选项 enumName 全集唯一(后端 enum 不能重)', () => {
    const enumNames = ALL_QUICK_CALCS.map((q) => q.enumName);
    expect(new Set(enumNames).size).toBe(enumNames.length);
  });

  it('每个选项 label 非空 + defaultPayload 含 _enum 字段', () => {
    for (const q of ALL_QUICK_CALCS) {
      expect(q.label).not.toBe('');
      expect(q.defaultPayload).toHaveProperty('_enum', q.enumName);
    }
  });

  it('P2 时间智能选项全部 requiresTimeAxis=true', () => {
    expect(P2_TIME_QUICK_CALCS.every((q) => q.requiresTimeAxis === true)).toBe(true);
  });

  it('P1 选项不含 requiresTimeAxis(undefined / false)', () => {
    expect(P1_QUICK_CALCS.every((q) => !q.requiresTimeAxis)).toBe(true);
  });
});

describe('P2 时间智能 buildPayload(I2)', () => {
  it('有 timeAxis → 返回填好 dateDimension/dateLevel 的 payload', () => {
    const samePeriod = P2_TIME_QUICK_CALCS.find((q) => q.enumName === 'SamePeriodValue')!;
    const payload = samePeriod.buildPayload!({ timeAxis: SAMPLE_TIME_AXIS });
    expect(payload).toEqual({
      _enum: 'SamePeriodValue',
      dateDimension: 'OrderDate',
      dateLevel: 'Month',
      offset: 1,
    });
  });

  it('timeAxis=null → 返回 null(UI 据此 disable 选项)', () => {
    for (const q of P2_TIME_QUICK_CALCS) {
      expect(q.buildPayload!({ timeAxis: null })).toBeNull();
    }
  });

  // 不再额外测"4 种 enum 各自正确" — I1 的"每个选项 defaultPayload._enum 等于 enumName"
  // 已经从结构上钉死,这里只测 buildPayload 行为(timeAxis 填充逻辑)够了。
});

describe('findQuickCalcOption(I3)', () => {
  // findQuickCalcOption 不区分 P1/P2,在 ALL_QUICK_CALCS 一起查;命中 / 未命中 各 1 条够了
  it('命中已知 enum → 返回选项(label 用作 UI 展示)', () => {
    expect(findQuickCalcOption('RowGlobalPercent')?.label).toBe('占行总计 %');
  });

  it('未知 enum → undefined', () => {
    expect(findQuickCalcOption('__unknown__')).toBeUndefined();
  });
});

describe('getValueQuickCalcLabel(I4)', () => {
  it('values 含 measure 且 quickCalc 命中 → 返回 label', () => {
    const values = [
      { measureName: '销售额', quickCalc: { _enum: 'RowGlobalPercent' } },
    ];
    expect(getValueQuickCalcLabel(values, '销售额')).toBe('占行总计 %');
  });

  it('values 不含 measure → null', () => {
    expect(getValueQuickCalcLabel([], '销售额')).toBeNull();
  });

  it('values 含 measure 但 quickCalc=null → null', () => {
    expect(
      getValueQuickCalcLabel([{ measureName: '销售额', quickCalc: null }], '销售额'),
    ).toBeNull();
  });

  it('quickCalc enum 不在选项表 → null(防御)', () => {
    const values = [{ measureName: 'x', quickCalc: { _enum: '__bogus__' } as never }];
    expect(getValueQuickCalcLabel(values, 'x')).toBeNull();
  });

  it('quickCalc 不是 object → null', () => {
    const values = [{ measureName: 'x', quickCalc: 'oops' as never }];
    expect(getValueQuickCalcLabel(values, 'x')).toBeNull();
  });
});

describe('formatMeasureDisplayLabel(I5)', () => {
  it('两者都无 → alias 原样', () => {
    expect(formatMeasureDisplayLabel('销售额', null, null)).toBe('销售额');
  });

  it('仅 quickCalc → alias（quickCalc）— 全角括号', () => {
    expect(formatMeasureDisplayLabel('销售额', '同期值', null)).toBe('销售额（同期值）');
  });

  it('仅 aggregator → alias（agg）', () => {
    expect(formatMeasureDisplayLabel('销售额', null, '平均值')).toBe('销售额（平均值）');
  });

  it('两者都有 → alias（agg, quickCalc）(顺序:agg 在前)', () => {
    expect(formatMeasureDisplayLabel('销售额', '同期值', '平均值')).toBe('销售额（平均值, 同期值）');
  });

  it('undefined 同 null 处理(老调用方 2 参数兼容)', () => {
    expect(formatMeasureDisplayLabel('销售额', undefined)).toBe('销售额');
    expect(formatMeasureDisplayLabel('销售额', '同期值')).toBe('销售额（同期值）');
  });
});

describe('getMeasureFieldName(I6) — 编码', () => {
  it('无 agg + 无 quickCalc → 原 name', () => {
    expect(getMeasureFieldName({ measureName: '销售额' })).toBe('销售额');
  });

  it('aggregator override → @AGG@<agg> 后缀', () => {
    expect(getMeasureFieldName({ measureName: '销售额', aggregator: 'AVG' })).toBe('销售额@AGG@AVG');
  });

  it('quickCalc → @QC@<enum> 后缀', () => {
    expect(
      getMeasureFieldName({
        measureName: '销售额',
        quickCalc: { _enum: 'RowGlobalPercent' },
      }),
    ).toBe('销售额@QC@RowGlobalPercent');
  });

  it('两者都有 → 顺序固定 <name>@AGG@<agg>@QC@<enum>', () => {
    expect(
      getMeasureFieldName({
        measureName: '销售额',
        aggregator: 'AVG',
        quickCalc: { _enum: 'SamePeriodValue' },
      }),
    ).toBe('销售额@AGG@AVG@QC@SamePeriodValue');
  });

  // 不另测 null/undefined 显式传入 — "无 agg + 无 quickCalc → 原 name" 已经覆盖
  // (不传 = undefined,显式 null/undefined 都走同一条 falsy 分支)
});

describe('splitMeasureFieldName(I7) — 解码', () => {
  it('裸 name → measureName 原样,其他 null', () => {
    expect(splitMeasureFieldName('销售额')).toEqual({
      measureName: '销售额',
      aggregator: null,
      quickCalcEnum: null,
    });
  });

  it('@AGG@ 后缀 → 抽 aggregator', () => {
    expect(splitMeasureFieldName('销售额@AGG@AVG')).toEqual({
      measureName: '销售额',
      aggregator: 'AVG',
      quickCalcEnum: null,
    });
  });

  it('@QC@ 后缀 → 抽 quickCalcEnum', () => {
    expect(splitMeasureFieldName('销售额@QC@RowGlobalPercent')).toEqual({
      measureName: '销售额',
      aggregator: null,
      quickCalcEnum: 'RowGlobalPercent',
    });
  });

  it('两个后缀 → 都抽出', () => {
    expect(splitMeasureFieldName('销售额@AGG@AVG@QC@SamePeriodValue')).toEqual({
      measureName: '销售额',
      aggregator: 'AVG',
      quickCalcEnum: 'SamePeriodValue',
    });
  });

  it('measureName 含下划线 / 数字 / 中文 → 不影响切分', () => {
    expect(splitMeasureFieldName('销售额_1624531356707@AGG@SUM')).toEqual({
      measureName: '销售额_1624531356707',
      aggregator: 'SUM',
      quickCalcEnum: null,
    });
  });
});

describe('编解码 round-trip(I8)— 关键不变量', () => {
  it.each([
    { measureName: '销售额' },
    { measureName: '销售额', aggregator: 'AVG' as const },
    { measureName: '销售额', quickCalc: { _enum: 'RowGlobalPercent' } as const },
    {
      measureName: '销售额',
      aggregator: 'AVG' as const,
      quickCalc: { _enum: 'SamePeriodValue' } as const,
    },
    { measureName: '销售额_1624531356707', aggregator: 'COUNT_DISTINCT' as const },
  ])('encode → decode 等值: %p', (v) => {
    const encoded = getMeasureFieldName(v);
    const decoded = splitMeasureFieldName(encoded);
    expect(decoded.measureName).toBe(v.measureName);
    expect(decoded.aggregator).toBe(v.aggregator ?? null);
    expect(decoded.quickCalcEnum).toBe(
      v.quickCalc && '_enum' in v.quickCalc ? v.quickCalc._enum : null,
    );
  });
});
