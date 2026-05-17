/**
 * addDimensionAsValue — 把维度字段加到 value 区(创建 CustomDimAsMeasureField 包装)
 *
 * 收益(Unix + TDD §2.1):reducer 那段 40 行(含 Date.now/Math.random)抽到 core,
 *   `mintId` 通过参数注入而非直接调全局 — 单测可传 deterministic id;reducer 一行调用。
 *
 * 业务语义:
 *   "维度转度量" — 用户右键维度 chip 选"转度量(AGG)",或拖维度到 value 区。
 *   生成一个 CustomDimAsMeasureField 包装 (sourceField + aggregator),给 buildQuery
 *   翻译成 CustomMeasure customElement;同时把 customField.id 加到 values。
 *
 * 不变量:
 *   I1. 已有同 sourceField + 同 aggregator 的 dim_as_measure customField + 已在 values
 *       → 入参引用(no-op,防重复)
 *   I2. 已有同上 customField 但 values 不含 → 仅追加 values(复用 customField)
 *   I3. 不存在匹配 customField → 用 mintId() 新建 customField,同时追加 values
 *   I4. mintId 仅在 I3 路径调用一次(I1/I2 不调,避免无谓 side effect / 帮助测试断言)
 *   I5. 显示名固定 "<sourceField>(<aggregator>)" — 跟 calc_column / enum_group 命名风格一致
 */
import type { Aggregator } from '../../types/query.js';
import type {
  CustomDimAsMeasureField,
  ViewConfig,
} from '../../types/viewConfig.js';

export function addDimensionAsValue(
  state: ViewConfig,
  fieldName: string,
  aggregator: Aggregator,
  mintId: () => string,
): ViewConfig {
  // I1/I2: 复用已有同 (sourceField, aggregator) 的 customField
  const existingCf = state.customFields.find(
    (cf): cf is CustomDimAsMeasureField =>
      cf.kind === 'dim_as_measure' &&
      cf.sourceField === fieldName &&
      cf.aggregator === aggregator,
  );
  if (existingCf) {
    const hasValue = state.values.some((v) => v.measureName === existingCf.id);
    if (hasValue) return state; // I1
    return {
      // I2
      ...state,
      values: [
        ...state.values,
        { measureName: existingCf.id, aggregator: null, quickCalc: null },
      ],
    };
  }
  // I3: 新建 customField + 追加 values
  const id = mintId();
  const newCf: CustomDimAsMeasureField = {
    id,
    name: `${fieldName}(${aggregator})`, // I5
    kind: 'dim_as_measure',
    sourceField: fieldName,
    aggregator,
    dataFormat: '',
  };
  return {
    ...state,
    customFields: [...state.customFields, newCf],
    values: [
      ...state.values,
      { measureName: id, aggregator: null, quickCalc: null },
    ],
  };
}
