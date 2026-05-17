/**
 * addMemberToFilter — 把 (fieldName, memberName, op) 加进 filter tree(成员右键菜单用)
 *
 * 业务场景:用户右键 hierarchy 行/列头某 member,选"筛选保留" / "排除",
 *   把 member 加到既有 dim 筛选树。智能合并同 field+同 op 的 In/NotIn leaf,
 *   避免产生重复 leaf。
 *
 * 收益(Unix):原 useMemberContextMenu 内 private helper,纯数据变换,
 *   下沉到 core 可在 node 跑、独立测合并/去重规则。
 *
 * 不变量:
 *   I1. 找不到同 field+op 的 leaf → 在顶层追加新 In/NotIn leaf,value=[memberName]
 *   I2. 找到同 field+op 的 In leaf,value 是数组 + 未含 memberName → 追加进数组
 *   I3. 找到同 field+op leaf,value 已含 memberName → value 不变(去重),但 leaf 引用换
 *   I4. 找到的 leaf value 不是数组(string / null / '')→ 提升为数组
 *   I5. 不合并跨 op(已有 Equals leaf,加 In → 新建独立 In leaf,Equals 保留)
 *   I6. In ↔ NotIn 不互相合并(各自独立)
 */
import type { ClientFilter } from '../../types/viewConfig.js';

export function addMemberToFilter(
  filters: ClientFilter[],
  fieldName: string,
  memberName: string,
  op: 'In' | 'NotIn',
): ClientFilter[] {
  // 找同 field + 同 op 的 leaf(I5/I6:不同 op 视为不同 leaf)
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
    // I2/I3/I4:合并到现有 leaf,统一规范化为数组
    const existing = filters[foundIdx] as { value: unknown };
    const oldValue = existing.value;
    const arr = Array.isArray(oldValue)
      ? oldValue.includes(memberName)
        ? oldValue // I3
        : [...oldValue, memberName] // I2
      : oldValue == null || oldValue === ''
        ? [memberName] // I4
        : [oldValue, memberName]; // I4 — 老单值升数组
    const next = [...filters];
    next[foundIdx] = { ...filters[foundIdx], value: arr } as ClientFilter;
    return next;
  }

  // I1:新建 leaf
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
