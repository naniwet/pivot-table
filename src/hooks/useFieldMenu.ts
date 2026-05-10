/**
 * useFieldMenu — 字段树右键菜单 ContextMenuItem[](field tree 上的字段)
 *
 * 内容:
 *   - 添加到行/列/数值/筛选(adhoc 模式只显示行+筛选)
 *   - 维度类字段额外显示「作为度量(汇总依据)」submenu(仅 pivot 模式)
 *
 * 不持有 fieldMenu state — 由 caller(PivotTable)通过 props 传入。
 */

import { useMemo } from 'react';
import type { Dispatch } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import type { FieldContextMenuEvent } from '../components/FieldTree/FieldTree.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import { canDrop, type DropZone } from '../core/dropRules/dropRules.js';
import {
  applicableAggregators,
  getAggregatorLabel,
} from '../core/viewConfig/aggregators.js';
import type { ViewConfigAction } from './useViewConfig.js';

export interface UseFieldMenuOptions {
  fieldMenu: FieldContextMenuEvent | null;
  isAdhoc: boolean;
  metaIndex: MetadataIndex;
  dispatch: Dispatch<ViewConfigAction>;
}

export function useFieldMenu(opts: UseFieldMenuOptions): ContextMenuItem[] {
  const { fieldMenu, isAdhoc, metaIndex, dispatch } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!fieldMenu) return [];
    const ft = fieldMenu.fieldType;
    const dropMode = isAdhoc ? 'adhoc' : 'pivot';

    const addToZone = (zone: DropZone) =>
      dispatch({
        type: 'DROP_FIELD',
        zone,
        fieldName: fieldMenu.fieldName,
        fieldType: fieldMenu.fieldType,
      });

    const items: ContextMenuItem[] = [
      {
        key: 'add-row',
        label: '添加到行区',
        onClick: () => addToZone('row'),
        disabled: !canDrop(ft, 'row', dropMode),
      },
    ];
    if (!isAdhoc) {
      items.push({
        key: 'add-column',
        label: '添加到列区',
        onClick: () => addToZone('column'),
        disabled: !canDrop(ft, 'column', dropMode),
      });
      items.push({
        key: 'add-value',
        label: '添加到数值区',
        onClick: () => addToZone('value'),
        disabled: !canDrop(ft, 'value', dropMode),
      });
    }
    items.push({
      key: 'add-filter',
      label: '添加到过滤区',
      onClick: () => addToZone('filter'),
      disabled: !canDrop(ft, 'filter', dropMode),
    });

    // P3+ 维度作度量 — adhoc 模式不支持(没 value 区);仅 pivot + 维度类字段显示
    // 'CalcColumn'(P5 用户自建行级计算列)也算维度类,可走"转度量"路径变 dim_as_measure
    const isDimLike =
      !isAdhoc &&
      (ft === 'Dimension' ||
        ft === 'Hierarchy' ||
        ft === 'CalcGroup' ||
        ft === 'EnumGroup' ||
        ft === 'RangeGroup' ||
        ft === 'CalcColumn');
    if (isDimLike) {
      const node = metaIndex.findByName(fieldMenu.fieldName);
      const valueType = node?.valueType ?? null;
      const aggs = applicableAggregators(valueType);
      items.push({ key: 'sep-as-measure', separator: true });
      items.push({
        key: 'as-measure',
        label: '作为度量(汇总依据)',
        children: aggs.map((a) => ({
          key: `as-measure-${a}`,
          label: getAggregatorLabel(a),
          onClick: () => {
            dispatch({
              type: 'ADD_DIMENSION_AS_VALUE',
              fieldName: fieldMenu.fieldName,
              aggregator: a,
            });
          },
        })),
      });
    }

    return items;
    // 闭包依赖 fieldMenu;ContextMenu 只在 click 时调 onClick,所以
    // 不必每次 viewConfig 变化都重算 items(避免 re-render 噪音)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldMenu, metaIndex, isAdhoc]);
}
