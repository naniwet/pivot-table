/**
 * translateRows / translateColumns
 *
 * 职责：把 viewConfig.rows[] / viewConfig.columns[] 翻译为 query.rows / query.columns。
 *
 * **Hierarchy 处理**（[ADR-004-finding.md](../../../../ADR-004-finding.md) C2 策略）：
 *   一个 Hierarchy with drillDepth=N → 输出 N 个 level fieldName，
 *   即从顶层 level 到第 N 层 level 全部出现在 query.rows 中。
 *   后端按"多 level 笛卡尔积"返回行轴成员（drill 不是 filter，而是字段集变化）。
 *
 * **NamedSet 处理**（P2 §3）：
 *   type='NamedSet' → 输出 `{ _enum: 'NameSet', name: fieldName }`，
 *   后端按"预定义命名集成员"展开。
 *
 * 其他字段类型（Dimension / CalcGroup / ...）原样输出 fieldName。
 */

import type { MetadataIndex } from '../../metadata/fieldIndex.js';
import type { ColumnField, RowField } from '../../../types/index.js';
import type { FieldOrNameSet } from '../../../types/query.js';

function translateOne(
  field: { fieldName: string; type: RowField['type']; drillDepth?: number },
  metadataIndex?: MetadataIndex,
): Array<string | FieldOrNameSet> {
  // MEASURE_GROUP_NAME 是 UI 占位（决定度量轴方向），不出现在 query — 由 placeMeasureAxis 处理
  if (field.type === 'MeasureGroupName') {
    return [];
  }
  if (field.type === 'Hierarchy' && metadataIndex) {
    const levels = metadataIndex.getHierarchyLevels(field.fieldName);
    const drillDepth = Math.max(1, field.drillDepth ?? 1);
    const effective = Math.min(drillDepth, levels.length || 1);
    if (levels.length === 0) {
      return [field.fieldName]; // metadata 找不到 → 防御退化
    }
    const out: string[] = [];
    for (let i = 0; i < effective; i++) {
      out.push(levels[i]!.name);
    }
    return out;
  }
  if (field.type === 'NamedSet') {
    return [{ _enum: 'NameSet', name: field.fieldName }];
  }
  return [field.fieldName];
}

export function translateRows(
  rows: RowField[],
  metadataIndex: MetadataIndex,
): Array<string | FieldOrNameSet> {
  return rows.flatMap((r) => translateOne(r, metadataIndex));
}

/** columns 翻译规则同 rows；P1+ 已支持 Hierarchy / NamedSet */
export function translateColumns(
  columns: ColumnField[],
  metadataIndex?: MetadataIndex,
): Array<string | FieldOrNameSet> {
  return columns.flatMap((c) => translateOne(c, metadataIndex));
}
