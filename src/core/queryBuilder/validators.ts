/**
 * QueryBuilder 校验规则（参见 docs/prd/phase-p0.md QueryBuilder 校验节）
 *
 * P2 自建字段闭环:viewConfig.customFields 也是合法字段源。row/column/value 引用的
 * fieldName 可以是 metadata 里的字段,**也可以是 customFields 里的 id**
 *  (维度组分 EnumGroup/RangeGroup → row/column;计算度量 UserCalcMeasure → value)。
 */

import type { ViewConfig } from '../../types/index.js';
import type { MetadataIndex } from '../metadata/fieldIndex.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(`[ValidationError] ${message}`);
    this.name = 'ValidationError';
  }
}

export function validateViewConfig(viewConfig: ViewConfig, index: MetadataIndex): void {
  // 必填：modelId 由 metadata.id 提供，所以不在 viewConfig 校验

  // 必填：至少 1 个 measure 在 values
  if (viewConfig.values.length === 0) {
    throw new ValidationError('viewConfig.values must contain at least 1 measure');
  }

  // 自建字段 id 集合(用于 row/column/value 校验时与 metadata 一起算"已知字段")
  // calc_column 也是维度(行级计算列 → CustomDimension,跟 enum_group/range_group 同构)
  const customDimNames = new Set(
    viewConfig.customFields
      .filter((cf) => cf.kind === 'enum_group' || cf.kind === 'range_group' || cf.kind === 'calc_column')
      .map((cf) => cf.id),
  );
  const customMeasureNames = new Set(
    viewConfig.customFields
      .filter((cf) => cf.kind === 'calc_measure' || cf.kind === 'dim_as_measure')
      .map((cf) => cf.id),
  );

  const isKnownDimField = (name: string) =>
    !!index.findByName(name) || customDimNames.has(name);
  const isKnownMeasureField = (name: string) =>
    !!index.findByName(name) || customMeasureNames.has(name);

  // 字段名必须在 metadata 或 customFields 里存在 (MeasureGroupName 是虚拟字段，跳过校验)
  for (const row of viewConfig.rows) {
    if (row.type === 'MeasureGroupName') continue;
    if (!isKnownDimField(row.fieldName)) {
      throw new ValidationError(`row field "${row.fieldName}" not in metadata or customFields`);
    }
  }
  for (const col of viewConfig.columns) {
    if (col.type === 'MeasureGroupName') continue;
    if (!isKnownDimField(col.fieldName)) {
      throw new ValidationError(`column field "${col.fieldName}" not in metadata or customFields`);
    }
  }
  for (const v of viewConfig.values) {
    if (!isKnownMeasureField(v.measureName)) {
      throw new ValidationError(`measure "${v.measureName}" not in metadata or customFields`);
    }
  }
}
