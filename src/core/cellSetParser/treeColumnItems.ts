/**
 * treeColumnItems — 树状列表头展开/折叠的纯函数 helper
 *
 * 输入:
 *   - columnHeaderLevels:多级列头(每个 cell 带 colSpan,父级跨多个 leaf 列)
 *   - collapsed:已折叠 cell key 集合 — key = `c<level>:<startCol>`
 *
 * 输出(给 PivotRenderer 用):
 *   - filteredLevels:过滤后的 levels — collapsed parent 在自己 level 上 colSpan=1,
 *     被 ancestor rowSpan 覆盖的下层 cell 全部 skip
 *   - hiddenBodyCols:真正藏掉的数据列(body 不渲染)
 *   - placeholderBodyCols:占位列 — body 此列渲染空 cell(因为 header 上有 collapsed parent
 *     占了一格)。键是原 startCol,值是该 collapsed parent 的 key(渲染时方便 data 属性追溯)。
 *
 * 不变量:
 *   I-A. body 可见列数 = (origCols - hiddenBodyCols.size) — placeholder 已经在 origCols 中(就是 startCol)
 *        ↳ 即:body 一行渲染 N - hiddenBodyCols.size 个 td;其中 placeholderBodyCols 的列渲染空 td
 *   I-B. header 每个 level 的 cells.colSpan 之和 = body 可见列数 (table 结构合法)
 */

import type { ColumnHeaderGroupCell } from '../../types/renderModel.js';

export interface TreeColumnLevelCell extends ColumnHeaderGroupCell {
  /** 在该 level 中的起始数据列索引(0-based,原 colSpan 算的) */
  startCol: number;
  /** stable key,collapsed-set 索引用 */
  key: string;
  /** 是否是 leaf level */
  isLeaf: boolean;
  /** 是否是 collapsed parent(自身在 collapsed set 中) */
  collapsed: boolean;
  /** 是否有可展开/折叠的 subtree(非叶) */
  hasChildren: boolean;
}

export interface TreeColumnsResult {
  filteredLevels: TreeColumnLevelCell[][];
  hiddenBodyCols: ReadonlySet<number>;
  /**
   * collapsed parent 在 body 的占位列。
   * key = 该 placeholder 占用的 body 列号(startCol)
   * value = { key: 同 header cell key,colSpan: 该 collapsed parent 原始 colSpan(给
   *          renderer 算"哪些子列要 sum 聚合显示在 placeholder 上") }
   */
  placeholderBodyCols: ReadonlyMap<number, { key: string; colSpan: number }>;
}

export function buildColumnCellKey(level: number, startCol: number): string {
  return `c${level}:${startCol}`;
}

export function buildTreeColumnLevels(
  columnHeaderLevels: ReadonlyArray<ReadonlyArray<ColumnHeaderGroupCell>>,
  collapsed: ReadonlySet<string>,
): TreeColumnsResult {
  if (columnHeaderLevels.length === 0) {
    return {
      filteredLevels: [],
      hiddenBodyCols: new Set(),
      placeholderBodyCols: new Map(),
    };
  }
  const numLevels = columnHeaderLevels.length;

  // 第 1 遍:decorate(算 startCol/key/isLeaf/collapsed/hasChildren)
  //
  // hasChildren 决定 UI 是否给该 cell 出 ▶/▼ 折叠按钮。
  // 规则:
  //   1) 叶层(最深 level)= false(本身就是叶子,无可折叠 subtree)
  //   2) 下一层是度量层(Σ 度量虚拟维)= false — 折叠了就把数据列全藏起来,无意义。
  //      用户体感:"冰柜 ▼ 销售成本/销售额" 那种最后一层 dim,不该再有折叠按钮。
  //      检测:下一 level 任一 cell.isMeasure=true(度量层是整层 isMeasure=true,
  //           前端轴组合保证整层同质,取首个 cell 即可)
  //   3) 其他非叶 dim 层 = true(可折叠,把下面的 dim 子树合并展示)
  const nextLevelIsMeasures: boolean[] = [];
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const next = lvl + 1 < numLevels ? columnHeaderLevels[lvl + 1] : null;
    nextLevelIsMeasures.push(!!next && next.length > 0 && !!next[0]?.isMeasure);
  }
  const decorated: TreeColumnLevelCell[][] = [];
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const row = columnHeaderLevels[lvl]!;
    const out: TreeColumnLevelCell[] = [];
    let col = 0;
    for (const c of row) {
      const key = buildColumnCellKey(lvl, col);
      const isLeaf = lvl === numLevels - 1;
      // 下一层是度量层 → 不让折叠(hasChildren=false)
      const hasChildren = !isLeaf && !nextLevelIsMeasures[lvl];
      out.push({
        ...c,
        startCol: col,
        key,
        isLeaf,
        collapsed: collapsed.has(key),
        hasChildren,
      });
      col += c.colSpan;
    }
    decorated.push(out);
  }

  // 第 2 遍:收集 collapsedRanges + 算 hidden / placeholder
  // collapsed parent 范围 [startCol .. startCol+colSpan-1]:
  //   placeholder = startCol(body 此列渲染空 td)
  //   hidden = startCol+1 .. startCol+colSpan-1(body 完全不渲染)
  const placeholderBodyCols = new Map<number, { key: string; colSpan: number }>();
  const hiddenBodyCols = new Set<number>();
  // 同时记录"被 ancestor rowSpan 覆盖"的 (level, startCol+1..) 区段,用于 header 跳过
  const coveredByAncestor: Array<{ level: number; rangeStart: number; rangeEnd: number }> = [];
  for (let lvl = 0; lvl < numLevels - 1; lvl++) {
    for (const c of decorated[lvl]!) {
      if (!c.collapsed) continue;
      placeholderBodyCols.set(c.startCol, { key: c.key, colSpan: c.colSpan });
      for (let j = c.startCol + 1; j < c.startCol + c.colSpan; j++) {
        hiddenBodyCols.add(j);
      }
      // collapsed parent 的整个范围 [startCol .. startCol+colSpan-1] 在更深 level 都被 rowSpan 占据,
      // 那些 level 的 cells 必须 skip
      coveredByAncestor.push({
        level: lvl,
        rangeStart: c.startCol,
        rangeEnd: c.startCol + c.colSpan - 1,
      });
    }
  }

  function isCoveredByAncestor(level: number, startCol: number, span: number): boolean {
    const endCol = startCol + span - 1;
    for (const a of coveredByAncestor) {
      if (a.level >= level) continue; // ancestor must be 更浅
      if (a.rangeStart <= startCol && endCol <= a.rangeEnd) return true;
    }
    return false;
  }

  // 第 3 遍:重建 filteredLevels
  const filtered: TreeColumnLevelCell[][] = [];
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const row = decorated[lvl]!;
    const out: TreeColumnLevelCell[] = [];
    for (const c of row) {
      // collapsed parent 自身保留(colSpan=1,占 placeholder col)
      if (c.collapsed) {
        out.push({ ...c, colSpan: 1 });
        continue;
      }
      // 被 ancestor 完全覆盖 → 跳过
      if (isCoveredByAncestor(lvl, c.startCol, c.colSpan)) continue;
      // 算可见 body 列数(范围内 NOT in hidden — placeholder 也算 visible)
      let visibleSpan = 0;
      for (let j = c.startCol; j < c.startCol + c.colSpan; j++) {
        if (!hiddenBodyCols.has(j)) visibleSpan++;
      }
      if (visibleSpan === 0) continue;
      out.push({ ...c, colSpan: visibleSpan });
    }
    filtered.push(out);
  }

  return { filteredLevels: filtered, hiddenBodyCols, placeholderBodyCols };
}
