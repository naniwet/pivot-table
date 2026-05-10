/**
 * moveFieldInZone — zone 内字段顺序调整（上移/下移一格）
 *
 * 核心场景：cross-table 列头合并依赖列轴第一个字段为顶层（合并最多）；
 * 用户拖入顺序可能不符合预期，UI 提供 ↑↓ 按钮即可调整。
 *
 * 不变量：
 *   - 边界（首项 'up' / 末项 'down'）→ 原对象返回（noop，避免无谓 rerender）
 *   - 字段不存在 → 原对象返回
 *   - filter zone：维度 leaf 用 field 匹配，度量 measureFilter 用 measureName 匹配；
 *     两个数组各自独立重排
 */
import { getMeasureFieldName } from './quickCalcs.js';
import type { DropZone } from '../dropRules/dropRules.js';
import type {
  ClientFilter,
  ClientMeasureFilter,
  ValueField,
  ViewConfig,
} from '../../types/viewConfig.js';

export type MoveDirection = 'up' | 'down';

/** 在数组里按谓词找到 idx，与目标位置 swap；越界返回原数组（引用） */
function moveByPredicate<T>(
  arr: readonly T[],
  matches: (item: T) => boolean,
  direction: MoveDirection,
): readonly T[] {
  const idx = arr.findIndex(matches);
  if (idx === -1) return arr;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= arr.length) return arr;
  const next = arr.slice();
  // 简单 swap
  const tmp = next[idx]!;
  next[idx] = next[targetIdx]!;
  next[targetIdx] = tmp;
  return next;
}

export function moveFieldInZone(
  viewConfig: ViewConfig,
  zone: DropZone,
  fieldName: string,
  direction: MoveDirection,
): ViewConfig {
  switch (zone) {
    case 'row': {
      const next = moveByPredicate(viewConfig.rows, (r) => r.fieldName === fieldName, direction);
      return next === viewConfig.rows ? viewConfig : { ...viewConfig, rows: next as ViewConfig['rows'] };
    }
    case 'column': {
      const next = moveByPredicate(
        viewConfig.columns,
        (c) => c.fieldName === fieldName,
        direction,
      );
      return next === viewConfig.columns
        ? viewConfig
        : { ...viewConfig, columns: next as ViewConfig['columns'] };
    }
    case 'value': {
      // value zone:fieldName 可能是 encoded full name(getMeasureFieldName(v))或 base measureName
      const matches = (v: ValueField): boolean =>
        getMeasureFieldName(v) === fieldName || v.measureName === fieldName;
      const next = moveByPredicate(viewConfig.values, matches, direction);
      return next === viewConfig.values
        ? viewConfig
        : { ...viewConfig, values: next as ViewConfig['values'] };
    }
    case 'filter': {
      // 维度 leaf 优先；找不到再试度量
      const leafMatch = (f: ClientFilter): boolean =>
        f.kind === 'leaf' && f.field === fieldName;
      if (viewConfig.filters.some(leafMatch)) {
        const next = moveByPredicate(viewConfig.filters, leafMatch, direction);
        return next === viewConfig.filters
          ? viewConfig
          : { ...viewConfig, filters: next as ViewConfig['filters'] };
      }
      // 度量过滤:仅 leaf 用 measureName 匹配;group 节点跳过(group reorder 暂不支持)
      const mfMatch = (mf: ClientMeasureFilter): boolean =>
        (!('kind' in mf) || mf.kind === 'leaf' || mf.kind === undefined) &&
        (mf as { measureName: string }).measureName === fieldName;
      if (viewConfig.measureFilters.some(mfMatch)) {
        const next = moveByPredicate(viewConfig.measureFilters, mfMatch, direction);
        return next === viewConfig.measureFilters
          ? viewConfig
          : { ...viewConfig, measureFilters: next as ViewConfig['measureFilters'] };
      }
      return viewConfig;
    }
  }
}
