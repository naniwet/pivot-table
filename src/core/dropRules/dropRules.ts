/**
 * dropRules — DropZones 拖拽合法性的数据驱动表
 *
 * 设计（ADR：避免 if-else 地狱）：
 *   FieldType × DropZone → boolean 矩阵；P1/P2 增量在表里加行/翻位即可，不动 canDrop。
 *
 * 单一职责：判断"<field type> 能否放进 <drop zone>"。
 * 不做：不依赖 viewConfig 的当前状态、不验证 hierarchy depth、不和 metadata 交互。
 */

/**
 * 字段类型 — 与 viewConfig 中 RowColFieldType / ValueFieldType 的并集对齐，
 * 但本文件刻意不 import viewConfig 类型，避免被 viewConfig 演化绑死（DDD：bounded context 隔离）。
 */
export type FieldType =
  | 'Dimension'
  | 'Hierarchy'
  | 'CalcGroup'
  | 'NamedSet'
  | 'EnumGroup'
  | 'RangeGroup'
  /** P5+ 用户行级计算列(`销售额/数量`)— 跟 EnumGroup/RangeGroup 同结构,作维度用 */
  | 'CalcColumn'
  | 'Measure'
  | 'CalcMeasure'
  | 'UserCalcMeasure'
  /** P3 度量名虚拟字段 — 控制度量沿行还是沿列展开 */
  | 'MeasureGroupName';

export type DropZone = 'row' | 'column' | 'value' | 'filter';

/**
 * 拖拽合法性矩阵：
 *   行/列：维度类（Dimension/Hierarchy/CalcGroup/EnumGroup/RangeGroup）
 *   数值：度量类（Measure/CalcMeasure/UserCalcMeasure）
 *   筛选：P1.0 起开放维度类(NamedSet/Dimension)+度量类(Measure/CalcMeasure/UserCalcMeasure)
 *
 * P2 自建字段闭环(2026-05-06):
 *   - EnumGroup/RangeGroup(用户建的维度分组)→ 跟普通维度一样可拖到 row/column/filter
 *   - UserCalcMeasure(用户建的计算度量)→ 跟普通 measure 一样可拖到 value/filter
 */
export const DROP_RULES: Record<FieldType, Record<DropZone, boolean>> = {
  Dimension: { row: true, column: true, value: false, filter: true },
  Hierarchy: { row: true, column: true, value: false, filter: true },
  CalcGroup: { row: true, column: true, value: false, filter: true },
  NamedSet: { row: true, column: true, value: false, filter: true },
  EnumGroup: { row: true, column: true, value: false, filter: true },
  RangeGroup: { row: true, column: true, value: false, filter: true },
  // 行级计算列:作维度,跟 EnumGroup/RangeGroup 一样
  // 想作 measure 用 → 走"维度转度量"独立机制(后续单独实现)
  CalcColumn: { row: true, column: true, value: false, filter: true },
  // P1.0：度量也可拖入 filter（→ measureFilters，top-N / 数值范围）
  Measure: { row: false, column: false, value: true, filter: true },
  CalcMeasure: { row: false, column: false, value: true, filter: true },
  UserCalcMeasure: { row: false, column: false, value: true, filter: true },
  // 度量名虚拟字段：可拖到行/列改变度量展开方向；不能进数值/筛选
  MeasureGroupName: { row: true, column: true, value: false, filter: false },
};

/**
 * @param mode P5+ 'adhoc' 时切到 adhoc 拖拽规则;'pivot' / undefined 走透视模式
 */
export function canDrop(
  fieldType: FieldType,
  zone: DropZone,
  mode?: 'pivot' | 'adhoc',
): boolean {
  if (mode === 'adhoc') return canDropInAdhoc(fieldType, zone);
  const rules = DROP_RULES[fieldType];
  if (!rules) return false;
  return rules[zone] ?? false;
}

/**
 * P5+ 即席查询(adhoc)模式专属规则:
 *   - 任意维度/度量都能拖到 row(后端 SQL 层把 measure 转成原始字段)
 *   - filter 接受 维度 + Measure(2026-05-10 起):
 *     · 维度类:正常 WHERE 过滤
 *     · Measure:作为"原始列值过滤"(类似 SQL `WHERE sale_amount > 500`),后端会自动
 *       把 measure 解析为底层物理列;**不是** measureFilter (HAVING 语义在 adhoc 无效)
 *   - column / value zone 完全不展示(canDrop 返回 false)
 *   - 自建字段(UserCalcMeasure / EnumGroup / RangeGroup / CalcMeasure)不让拖
 *     (adhoc DetailQuery 不解析 customElements)
 */
export function canDropInAdhoc(fieldType: FieldType, zone: DropZone): boolean {
  if (zone === 'column' || zone === 'value') return false;
  // 自建字段不支持(adhoc DetailQuery 不解析 customElements)
  if (
    fieldType === 'UserCalcMeasure' ||
    fieldType === 'EnumGroup' ||
    fieldType === 'RangeGroup' ||
    fieldType === 'CalcColumn'
  ) {
    return false;
  }
  if (fieldType === 'CalcMeasure') {
    // 计算度量后端 detailQuery 不解析 → 不让拖
    return false;
  }
  if (zone === 'row') {
    // Measure 在 adhoc 模式下允许拖入 row(后端自动转 baseField)
    return true;
  }
  if (zone === 'filter') {
    // 维度类 + 原生 Measure 都可拖(Measure 当原始列过滤)
    return (
      fieldType === 'Dimension' ||
      fieldType === 'Hierarchy' ||
      fieldType === 'CalcGroup' ||
      fieldType === 'NamedSet' ||
      fieldType === 'Measure'
    );
  }
  return false;
}
