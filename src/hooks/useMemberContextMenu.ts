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
import { addMemberToFilter } from '../core/viewConfig/addMemberToFilter.js';
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

// 2026-05-17:addMemberToFilter 整段下沉到 core/viewConfig/addMemberToFilter.ts
// (含 I1-I6 合并/去重/跨 op/单值升数组 全部不变量)

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
