/**
 * buildFieldMenuItems — 字段树右键菜单 ContextMenuItem[] 构造器(纯函数)
 *
 * 收益(Unix):原 useFieldMenu hook 内的 "决定哪些菜单项 + 各项的 disabled 状态" 整段
 *   ~70 行逻辑下沉到 core,可在 node 测;onClick 通过 callbacks 注入,dispatch 留 hook 层。
 *
 * 不变量:
 *   I1. fieldType / mode 决定哪些 zone 出现:adhoc → 只 row+filter;pivot → 全 4 zone
 *   I2. add-XXX disabled 状态由 canDrop(fieldType, zone, mode) 决定
 *   I3. 维度类字段(Dimension/Hierarchy/CalcGroup/EnumGroup/RangeGroup/CalcColumn)
 *       + pivot 模式 → 额外渲染 "作为度量" submenu(含 applicableAggregators(valueType))
 *   I4. adhoc 模式 → 不渲染 "作为度量" submenu(adhoc 无 value 区)
 *   I5. Measure / CalcMeasure 类型 → 不渲染 "作为度量"(本身已是度量)
 */
import { canDrop, type DropZone, type FieldType } from '../dropRules/dropRules.js';
import {
  applicableAggregators,
  getAggregatorLabel,
} from '../viewConfig/aggregators.js';
import type { Aggregator } from '../../types/query.js';
import type { MetadataIndex } from '../metadata/fieldIndex.js';

import type { ContextMenuItem } from './menuItem.js';

export interface FieldMenuContext {
  fieldName: string;
  fieldType: FieldType;
  isAdhoc: boolean;
  metaIndex: MetadataIndex;
}

export interface FieldMenuCallbacks {
  /** 添加字段到指定 zone(实现里通常 dispatch DROP_FIELD) */
  onAddToZone: (zone: DropZone) => void;
  /** 维度作度量(实现里 dispatch ADD_DIMENSION_AS_VALUE) */
  onAddAsMeasure: (aggregator: Aggregator) => void;
}

export function buildFieldMenuItems(
  ctx: FieldMenuContext,
  callbacks: FieldMenuCallbacks,
): ContextMenuItem[] {
  const { fieldName, fieldType, isAdhoc, metaIndex } = ctx;
  const { onAddToZone, onAddAsMeasure } = callbacks;
  const dropMode = isAdhoc ? 'adhoc' : 'pivot';

  const items: ContextMenuItem[] = [
    {
      key: 'add-row',
      label: '添加到行区',
      onClick: () => onAddToZone('row'),
      disabled: !canDrop(fieldType, 'row', dropMode),
    },
  ];
  // I1: pivot 模式额外 add-column / add-value
  if (!isAdhoc) {
    items.push({
      key: 'add-column',
      label: '添加到列区',
      onClick: () => onAddToZone('column'),
      disabled: !canDrop(fieldType, 'column', dropMode),
    });
    items.push({
      key: 'add-value',
      label: '添加到数值区',
      onClick: () => onAddToZone('value'),
      disabled: !canDrop(fieldType, 'value', dropMode),
    });
  }
  items.push({
    key: 'add-filter',
    label: '添加到过滤区',
    onClick: () => onAddToZone('filter'),
    disabled: !canDrop(fieldType, 'filter', dropMode),
  });

  // I3/I4/I5:维度作度量
  const isDimLike =
    !isAdhoc &&
    (fieldType === 'Dimension' ||
      fieldType === 'Hierarchy' ||
      fieldType === 'CalcGroup' ||
      fieldType === 'EnumGroup' ||
      fieldType === 'RangeGroup' ||
      fieldType === 'CalcColumn');
  if (isDimLike) {
    const node = metaIndex.findByName(fieldName);
    const valueType = node?.valueType ?? null;
    const aggs = applicableAggregators(valueType);
    items.push({ key: 'sep-as-measure', separator: true });
    items.push({
      key: 'as-measure',
      label: '作为度量(汇总依据)',
      children: aggs.map((a) => ({
        key: `as-measure-${a}`,
        label: getAggregatorLabel(a),
        onClick: () => onAddAsMeasure(a),
      })),
    });
  }

  return items;
}
