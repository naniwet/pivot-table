/**
 * buildRowHeaderSpans — 多级行头的 rowSpan 合并（与 buildColumnHeaderLevels 镜像）
 *
 * 输入：rowHeader 每行的 fullPath（path[lvl] = 该 level 的 member name）
 * 输出：number[r][lvl]
 *   - 0：该 cell 被上一行的 rowSpan 覆盖，渲染时跳过
 *   - >=1：渲染并 rowSpan=该值
 *
 * 算法：对每个 (r, lvl)
 *   - 若 r==0 或 prevPath[0..lvl] !== myPath[0..lvl] → 是新组的起点，
 *     rowSpan = 后续相邻同 prefix 行数（含自己）
 *   - 否则 → 0（被覆盖跳过）
 *
 * 不变量：标准 BI 严格层次合并 — 仅当上层 0..lvl-1 也相同才合并 lvl
 *   （和 buildColumnHeaderLevels 的 pathEqual(throughLevel) 完全对称）
 *
 * 参数 `merge` (P5+ 全局排序场景):
 *   - true(默认):正常合并(分组内排序 / 无排序时,hierarchy 顺序自然连续)
 *   - false:每个 cell 独立 rowSpan=1(全局排序 BASC/BDESC 时,后端打散 hierarchy,
 *     合并会跨"碰巧相邻"的同 prefix 行,视觉上暗示分组但其实没有 — 误导)
 */

function pathPrefixEqual(a: string[], b: string[], throughLevel: number): boolean {
  for (let i = 0; i <= throughLevel; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function buildRowHeaderSpans(paths: string[][], merge = true): number[][] {
  const numRows = paths.length;
  if (numRows === 0) return [];
  // 取第一行的 length 作为 numLevels；其他行长度不一致时只到 numLevels
  const numLevels = paths[0]?.length ?? 0;

  // merge=false: 不合并,每个 cell 都独立 rowSpan=1
  if (!merge) {
    return paths.map(() => Array<number>(numLevels).fill(1));
  }

  const out: number[][] = [];
  for (let r = 0; r < numRows; r++) {
    const row: number[] = [];
    for (let lvl = 0; lvl < numLevels; lvl++) {
      // 检查 r-1 行的 prefix[0..lvl] 是否与 r 相同
      if (r > 0 && pathPrefixEqual(paths[r - 1]!, paths[r]!, lvl)) {
        row.push(0);
        continue;
      }
      // r 是该 group 的起点。算 rowSpan（向后扩展同 prefix 的行）
      let span = 1;
      for (let r2 = r + 1; r2 < numRows; r2++) {
        if (pathPrefixEqual(paths[r]!, paths[r2]!, lvl)) span++;
        else break;
      }
      row.push(span);
    }
    out.push(row);
  }
  return out;
}
