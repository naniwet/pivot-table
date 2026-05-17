/**
 * computeAvailableFields — 从 metadata 树派生 3+1 套可用字段集合
 *
 * 收益(Unix):原 useAvailableFields hook 内的纯计算抽出来,100% 无 React 依赖。
 *   hook 退化为 useMemo 一行包装,纯逻辑可在 node 跑(快 + 易维护)。
 *
 * 输出三个集合(给 picker + editor 用):
 *   - availableFields:**editor 表达式校验**(用户输 [alias] 也认)— 收 name + alias
 *   - dimensionFields:**picker 候选列表**(选 baseField 用)— 每字段 1 行,只收 name
 *   - numericDimensionFields:数值类型的维度字段(给 range_group 选 base field —
 *     range_group 本质是行级 CASE WHEN 表达式,必须是行级数值字段)
 *   - physicalColumns:计算列(calc_column SQL 行级)的引用校验列表 — name + alias
 *
 * 排除规则:
 *   - FOLDER_TYPES(DIMENSION_FOLDER / MEASURE_FOLDER / NAMEDSET_FOLDER / FOLDER)→ 只下钻,不收
 *   - HIDDEN_TYPES(MEASURE_GROUP_NAME / NAMEDSET / CALC_MEMBER / MEMBER 等)→ 整 subtree 跳过
 *   - HIDDEN_NAMES(member/namedset/calc_member 等)→ 按 name(case-insensitive)兜底隐藏
 *
 * 维度 vs 度量判定(2026-05-16):
 *   优先用 node.group === 'MEASURE',兼容 MEASURE_TYPES.has(node.type) —
 *   有些 dataset 把数值 measure 字段 type='FIELD',只在 group='MEASURE' 上区别。
 *   老逻辑只看 type 漏过滤,导致 ProductID/UnitsInStock 混入 picker。
 */
import type { Metadata } from '../../types/metadata.js';

const FOLDER_TYPES = new Set([
  'DIMENSION_FOLDER',
  'MEASURE_FOLDER',
  'NAMEDSET_FOLDER',
  'FOLDER',
]);

// 2026-05-16:命名集 / 计算成员 / 自定义成员先隐藏(跟 FieldTree.HIDDEN_FIELD_TYPES 一致)
const HIDDEN_TYPES = new Set([
  'MEASURE_GROUP_NAME',
  'MEASURE_GROUP_VALUE',
  'NAMEDSET',
  'NAMEDSET_FOLDER',
  'CALC_MEMBER',
  'CALC_MEMBER_FOLDER',
  'MEMBER',
  'MEMBER_FOLDER',
]);

// 2026-05-16:有些数据集把"成员"/"命名集"建成通用 FOLDER 类型,仅靠 node.name 区分
// (用户截图反馈:tab "成员" 的 name 字段是 "member")。按 name 兜底过滤一次。
const HIDDEN_NAMES = new Set<string>([
  'member',
  'members',
  'namedset',
  'namedsets',
  'named_set',
  'calc_member',
  'calcmember',
  'calcmembers',
]);

function isHiddenNode(n: { type: string; name: string }): boolean {
  if (HIDDEN_TYPES.has(n.type)) return true;
  if (HIDDEN_NAMES.has(n.name.toLowerCase())) return true;
  return false;
}

const MEASURE_TYPES = new Set(['MEASURE', 'CALC_MEASURE']);
const NUMERIC_VTYPES = new Set([
  'INTEGER',
  'LONG',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'BIGDECIMAL',
  'NUMERIC',
]);

export interface AvailableFields {
  /** 所有可拖字段(度量 + 维度);给 FieldExpressionEditor 在 calc_measure 模式做引用校验 */
  availableFields: string[];
  /** 非度量字段(给 enum_group 选 base field) */
  dimensionFields: string[];
  /** 数值类型的维度字段(给 range_group 选 base field) */
  numericDimensionFields: string[];
  /**
   * 计算列可引用的源字段集合 — 给 FieldExpressionEditor 在 calc_column 模式做引用校验。
   * 含 fields(物理列)+ levels(hierarchy 子级,绑物理列);不含 measures(行级表达式不能引用聚合)
   */
  physicalColumns: string[];
}

export function computeAvailableFields(metadata: Metadata): AvailableFields {
  const dims: string[] = [];
  const numericDims: string[] = [];
  const allSet = new Set<string>(); // editor 校验用:name + alias 都收
  const stack: typeof metadata.nodes = metadata.nodes.filter((n) => n.parentId === null);
  while (stack.length) {
    const node = stack.pop()!;
    if (isHiddenNode(node)) {
      // 整 subtree 隐藏(包括子节点) — 跟 FieldTree 一致,不下钻
      continue;
    }
    if (FOLDER_TYPES.has(node.type)) {
      for (const c of node.children) stack.push(c);
      continue;
    }
    // editor 校验:name + alias 都加入 availableFields
    allSet.add(node.name);
    const alias = node.alias || node.aliasFromDb;
    if (alias && alias !== node.name) allSet.add(alias);

    // picker 候选(dims/numericDims):只收 name(每字段一行,避免重复)
    const isMeasure =
      node.group === 'MEASURE' || MEASURE_TYPES.has(node.type);
    if (!isMeasure) {
      dims.push(node.name);
      if (node.valueType && NUMERIC_VTYPES.has(node.valueType)) {
        numericDims.push(node.name);
      }
    }
    for (const c of node.children) stack.push(c);
  }
  const all = Array.from(allSet);

  // physicalColumns:fields ∪ levels(都是绑物理列的字段),含 name + alias 双向匹配
  const physSet = new Set<string>();
  for (const f of metadata.fields) {
    physSet.add(f.alias || f.aliasFromDb || f.name);
    physSet.add(f.name);
  }
  for (const lv of metadata.levels) {
    physSet.add(lv.alias || lv.aliasFromDb || lv.name);
    physSet.add(lv.name);
  }
  const physicalColumns = Array.from(physSet);

  return {
    availableFields: all,
    dimensionFields: dims,
    numericDimensionFields: numericDims,
    physicalColumns,
  };
}
