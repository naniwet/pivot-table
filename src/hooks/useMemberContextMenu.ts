/**
 * useMemberContextMenu — pivot 行头/列头**成员级**右键菜单 ContextMenuItem[]
 *
 * 适用:用户右键 pivot 表的具体成员单元格(如"江苏" / "2020")— 不是字段级(那个是 useColumnHeaderMenu)。
 *
 * 菜单项(都是单 click 直接生效,无 prompt;复杂条件让用户去 FilterPanel 编辑):
 *   - 筛选 = "江苏"          → 加 In leaf 到 viewConfig.filters,值 = 当前 member.name
 *   - 排除此项 ("江苏")       → 加 NotIn leaf
 *   - separator
 *   - 复制成员名
 *
 * 不持有 menu state — caller 控制 setMemberContextMenu(null)。
 *
 * 设计:
 *   - 同 field + 同 op 已存在 leaf 时,合并 value(避免一直加重复 leaf)
 *     - In:把新 value 追加到现有 In leaf 的 value 数组
 *     - NotIn:同上
 *   - 不存在 leaf → 新建一个
 */
import { useMemo } from 'react';

import type { ContextMenuItem } from '../components/ContextMenu/ContextMenu.js';
import type { MetadataIndex } from '../core/metadata/fieldIndex.js';
import type { ClientFilter } from '../types/viewConfig.js';

export interface MemberContextMenuTarget {
  /** 这个成员所属的字段(level 名 / dim 名) */
  fieldName: string;
  /** 当前成员的 name(直接当 In/NotIn 的 value) */
  memberName: string;
  x: number;
  y: number;
}

export interface UseMemberContextMenuOptions {
  memberContextMenu: MemberContextMenuTarget | null;
  filters: ClientFilter[];
  metaIndex: MetadataIndex;
  /** 替换 viewConfig.filters 的回调(== handleChangeFilters in caller) */
  onChangeFilters: (filters: ClientFilter[]) => void;
}

/**
 * 把 fieldName + member 加进 filter tree:
 *   - 同 field + 同 op 已存在 leaf → 把 member 追加到 value(数组化)
 *   - 否则在顶层加新 leaf
 */
function addMemberToFilter(
  filters: ClientFilter[],
  fieldName: string,
  memberName: string,
  op: 'In' | 'NotIn',
): ClientFilter[] {
  // 找现有同 field + 同 op 的 leaf
  let foundIdx = -1;
  filters.forEach((f, i) => {
    if (
      f.kind === 'leaf' &&
      (f as { field: string }).field === fieldName &&
      (f as { operator: string }).operator === op
    ) {
      foundIdx = i;
    }
  });

  if (foundIdx >= 0) {
    // 合并到现有 leaf 的 value 数组
    const existing = filters[foundIdx] as { value: unknown };
    const oldValue = existing.value;
    const arr = Array.isArray(oldValue)
      ? oldValue.includes(memberName)
        ? oldValue
        : [...oldValue, memberName]
      : oldValue == null || oldValue === ''
        ? [memberName]
        : [oldValue, memberName];
    const next = [...filters];
    next[foundIdx] = { ...filters[foundIdx], value: arr } as ClientFilter;
    return next;
  }

  return [
    ...filters,
    {
      kind: 'leaf',
      field: fieldName,
      operator: op,
      value: [memberName],
    } as ClientFilter,
  ];
}

export function useMemberContextMenu(opts: UseMemberContextMenuOptions): ContextMenuItem[] {
  const { memberContextMenu, filters, metaIndex, onChangeFilters } = opts;

  return useMemo<ContextMenuItem[]>(() => {
    if (!memberContextMenu) return [];
    const { fieldName, memberName } = memberContextMenu;
    const fieldAlias = metaIndex.findByName(fieldName)?.alias ?? fieldName;

    return [
      {
        key: 'filter-in',
        label: `筛选 ${fieldAlias} = "${memberName}"`,
        onClick: () => {
          onChangeFilters(addMemberToFilter(filters, fieldName, memberName, 'In'));
        },
      },
      {
        key: 'filter-not-in',
        label: `排除 ${fieldAlias} = "${memberName}"`,
        onClick: () => {
          onChangeFilters(addMemberToFilter(filters, fieldName, memberName, 'NotIn'));
        },
      },
      { key: 'sep', separator: true as const },
      {
        key: 'copy-name',
        label: '复制成员名',
        onClick: () => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(memberName).catch(() => {});
          }
        },
      },
    ];
  }, [memberContextMenu, filters, metaIndex, onChangeFilters]);
}
