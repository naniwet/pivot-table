/**
 * translateAggregatorOverrides — viewConfig.values 里有 `aggregator` 覆盖的 ValueField
 * 翻译成 `CustomMeasure` customElement(原 measure 复刻一份,改 aggregator)。
 *
 * 为什么走 CustomMeasure 而不是 `MeasureField.aggregator`(2026-05-16 真实接口实测):
 *   - `MeasureField.aggregator='AVG'` 后端**不识别**,返回的数据 = 原 SUM 值(silent bug)
 *   - 后端原生支持的"换聚合方式"路径:CustomMeasure {measure: {aggregator}, measureBinding}
 *     — 等价于在 dataset 里临时新建一个同 binding 但不同 aggregator 的 measure
 *
 * Wire format(用户答疑后实测 work):
 *   {
 *     "_enum": "CustomMeasure",
 *     "measure": {
 *       "name": "销售额_m@AGG@AVG",   // = getMeasureFieldName(v) — 跟 columns/sort 引用一致
 *       "alias": "销售额(平均值)",      // 显示用
 *       "aggregator": "AVG",            // 新聚合方式
 *       "dataType": "DOUBLE",           // 从原 measure 拷贝
 *       "dataFormat": "...",
 *       ...
 *     },
 *     "measureBinding": {
 *       "measure": "销售额_m@AGG@AVG",  // 跟上面 measure.name 一致
 *       "view": "sales_fact",           // 原 measure 所属物理表
 *       "column": "销售额"              // 原 measure 所属物理列
 *     }
 *   }
 *
 * 边界:
 *   - 找不到 measureBinding(测试 stub 场景 / calc_measure / 未知 measure)→ skip
 *     (上层 buildQuery 也会因此把这个 chip 走 fallback)
 */
import { getAggregatorLabel } from '../../viewConfig/aggregators.js';
import type { MetadataIndex } from '../../metadata/fieldIndex.js';
import { getMeasureFieldName } from '../../viewConfig/quickCalcs.js';
import type { CustomElement } from '../../../types/query.js';
import type { ValueField } from '../../../types/viewConfig.js';

/** 给 buildQuery 用 — 把 aggregator override 的 valueField 翻译成 CustomMeasure[] */
export function translateAggregatorOverrides(
  values: ReadonlyArray<ValueField>,
  metaIndex: MetadataIndex,
): CustomElement[] {
  const out: CustomElement[] = [];
  const seen = new Set<string>(); // 同 encoded name 去重(2 个 chip 同 measure+agg 时只 emit 1 个)
  for (const v of values) {
    if (v.aggregator == null) continue;
    const name = getMeasureFieldName(v); // e.g. '销售额_m@AGG@AVG'
    if (seen.has(name)) continue;
    const binding = metaIndex.getMeasureBinding(v.measureName);
    if (!binding) continue; // 找不到物理 binding → 不能 emit CustomMeasure
    const baseAlias = metaIndex.findByName(v.measureName)?.alias ?? v.measureName;
    const aggLabel = getAggregatorLabel(v.aggregator);
    seen.add(name);
    out.push({
      _enum: 'CustomMeasure',
      measure: {
        name,
        alias: aggLabel ? `${baseAlias}(${aggLabel})` : baseAlias,
        desc: '',
        category: '',
        dataType: binding.dataType,
        aggregator: v.aggregator,
        dataFormat: binding.dataFormat,
        maskRule: '',
      },
      measureBinding: {
        measure: name,
        view: binding.view,
        column: binding.column,
      },
    } as unknown as CustomElement);
  }
  return out;
}

/**
 * 判断哪些 valueField 应该走 CustomMeasure 路径(buildQuery 用) — 跟
 * translateAggregatorOverrides 必须保持一致的过滤条件:
 *   1. 有 aggregator override
 *   2. metaIndex 能找到 binding
 * 走这条路径的 chip:**不再发 MeasureField**(避免重复定义同名 measure)
 */
export function shouldGoCustomMeasure(
  v: ValueField,
  metaIndex: MetadataIndex,
): boolean {
  if (v.aggregator == null) return false;
  return metaIndex.getMeasureBinding(v.measureName) != null;
}
