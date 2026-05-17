/**
 * setFieldSubTotal — 对 row/column 区指定字段的 subTotal 显示模式做切换
 *
 * 收益:reducer SET_FIELD_SUB_TOTAL case 原 ~17 行(含范型 helper + rest-spread 清字段)
 *   变 1 行调用;之前 hook 层无独立测试,抽到 core 补 5 case 覆盖。
 *
 * 不变量:
 *   I1. fieldName 不在该 zone → 返回入参引用(no-op)
 *   I2. subTotal 给值 → 该 field 的 subTotal 字段被设置(已有则覆盖)
 *   I3. subTotal === undefined → 该 field 上的 subTotal 字段被彻底剔除
 *        (而非 set undefined — 让序列化结果干净,buildQuery 也少一次 if-check)
 *   I4. 不影响其他 field;不影响另一个 zone(row 操作不动 columns,反之亦然)
 */
import type { ViewConfig } from '../../types/viewConfig.js';

export type SubTotalMode = 'SHOW' | 'HIERARCHY_SHOW' | 'HIDDEN';

export function setFieldSubTotal(
  state: ViewConfig,
  zone: 'row' | 'column',
  fieldName: string,
  subTotal: SubTotalMode | undefined,
): ViewConfig {
  const source = zone === 'row' ? state.rows : state.columns;
  const idx = source.findIndex((f) => f.fieldName === fieldName);
  if (idx < 0) return state; // I1

  const updateField = <T extends { fieldName: string; subTotal?: SubTotalMode }>(
    arr: T[],
  ): T[] =>
    arr.map((f, i) => {
      if (i !== idx) return f;
      if (subTotal === undefined) {
        // I3: 彻底剔除 subTotal 字段(不是 set undefined)
        const { subTotal: _drop, ...rest } = f as T & { subTotal?: SubTotalMode };
        return rest as T;
      }
      return { ...f, subTotal } as T;
    });

  if (zone === 'row') {
    return { ...state, rows: updateField(state.rows) };
  }
  return { ...state, columns: updateField(state.columns) };
}
