/**
 * 计算每个数据列的 min/max — 给 dataBar range='auto' 用。
 *
 * 用 RenderModel 而不是原始 CellSet:
 *   - cell.value 是 number | string | null,parseCellSet 已经做过类型推导
 *   - matrix[r][c] 是 RenderCell,有 isEmpty 标志
 *   - columnHeader[c].fieldName 给我们 measure name(数据列 1:1 映射)
 *
 * 复杂度:O(rows × cols),一般查询不会超过 10K cells,跑一次不显著。
 *
 * 不变量:
 *   I1. measure 没数据(全空列)→ 不出现在结果 Map 里
 *   I2. measure 全相等(min===max)→ 仍出现,但 evaluateDataBar 会因 max<=min 跳过
 *   I3. measure 跨多列(同 measure 出现在不同 column tuple)→ 跨列 min/max 合并
 */
import type { RenderModel } from '../../types/renderModel.js';

export type MinMaxByMeasure = ReadonlyMap<string, { min: number; max: number }>;

export function computeColRanges(model: RenderModel): MinMaxByMeasure {
  const out = new Map<string, { min: number; max: number }>();
  const cols = model.columnHeader;
  if (cols.length === 0 || model.matrix.length === 0) return out;
  for (let r = 0; r < model.matrix.length; r++) {
    const row = model.matrix[r]!;
    for (let c = 0; c < cols.length; c++) {
      const cell = row[c];
      if (!cell || cell.isEmpty) continue;
      const v = cell.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const measure = cols[c]!.fieldName;
      const cur = out.get(measure);
      if (!cur) {
        out.set(measure, { min: v, max: v });
      } else {
        if (v < cur.min) cur.min = v;
        if (v > cur.max) cur.max = v;
      }
    }
  }
  return out;
}
