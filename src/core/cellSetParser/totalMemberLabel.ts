/**
 * formatTotalMemberLabel — backend 返回的"合计/小计" magic 成员名翻译给业务用户看
 *
 * Smartbi backend 在 query.pageSettings.showGrandTotal=true 或
 * column DimensionField.subTotal='SHOW'/'HIERARCHY_SHOW' 时,会返回:
 *   - 'SMARTBI合计'   — 全表 grand total(showGrandTotal 触发)
 *   - 'total'        — 各 level 的 subtotal(subTotal 触发)
 *
 * 这两个 magic name 直接显示给业务用户很奇怪("SMARTBI合计" 暴露技术栈、
 * "total" 中英文混杂),前端统一翻译成 BI 行业通用的中文 label。
 *
 * 调用点:在 RowHeaderNode / column member 渲染前,member.name → 此函数转换。
 * 不动 RenderModel 数据(filter/drill-through 仍用 raw name)— 只过 display。
 */

export function formatTotalMemberLabel(name: string): string {
  if (name === 'SMARTBI合计') return '合计';
  if (name === 'total') return '小计';
  return name;
}
