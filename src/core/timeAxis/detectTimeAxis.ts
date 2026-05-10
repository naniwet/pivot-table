/**
 * detectTimeAxis — 从 viewConfig 行/列轴上找时间字段，推导 { dateDimension, dateLevel }
 *
 * 用途：P2 时间智能 quickCalc 默认 payload 需要 dateDimension/dateLevel，
 * UI 调用此函数自动推导。
 *
 * 后端语义(2026-05-06 用户实测确认):
 *   - dateDimension: **时间层次的 fieldName**(HIERARCHY_TIME 节点的 name,如 'the_date')
 *   - dateLevel:     **当前展开到的 level fieldName**(LEVEL_TIME_* 节点的 name,如 'the_date_Year2')
 *
 * ⚠ FieldNode.hierarchy 字段不可信 — 真实 metadata 里塞的是类型枚举(如
 * 'LEVEL_TIME_YEAR'),不是 hierarchy 的 name。从 level 节点要往上找 HIERARCHY_TIME 父。
 *
 * 规则：
 *   - 行轴优先（PRD §7：通常时间在行轴），未找到再看列轴
 *   - hierarchy 字段：dateDimension=hierarchy.name,dateLevel=children[drillDepth-1].name
 *   - 普通 LEVEL_TIME_* 字段：从 metadata 树上溯找 HIERARCHY_TIME 父,用其 name 作 dateDimension
 *   - level 没有 HIERARCHY_TIME 父(孤立时间字段)→ null
 *   - 找不到 → null（UI 据此置灰菜单）
 */
import { buildMetadataIndex } from '../metadata/fieldIndex.js';
import type { FieldNode, FieldNodeType, Metadata } from '../../types/metadata.js';
import type { ViewConfig } from '../../types/viewConfig.js';

const TIME_LEVEL_TYPES = new Set<FieldNodeType>([
  'LEVEL_TIME_YEAR',
  'LEVEL_TIME_QUARTER',
  'LEVEL_TIME_MONTH',
  'LEVEL_TIME_DAY',
]);

const HIERARCHY_TIME_TYPES = new Set<FieldNodeType>(['HIERARCHY_TIME']);

export interface TimeAxisInfo {
  dateDimension: string;
  dateLevel: string;
}

function isTimeLevel(node: FieldNode): boolean {
  return TIME_LEVEL_TYPES.has(node.type);
}

function isTimeHierarchy(node: FieldNode): boolean {
  return HIERARCHY_TIME_TYPES.has(node.type);
}

/**
 * 从 level 节点上溯,找最近的 HIERARCHY_TIME 祖先节点;找不到 → null
 *   实测真实 metadata 是 1 层嵌套(HIERARCHY_TIME → LEVEL_TIME_*),
 *   但用 while-loop 防御任意嵌套深度。
 */
function findTimeHierarchyAncestor(
  levelNode: FieldNode,
  index: ReturnType<typeof buildMetadataIndex>,
): FieldNode | null {
  let cur: FieldNode | null = index.findParentByName(levelNode.name);
  while (cur) {
    if (isTimeHierarchy(cur)) return cur;
    cur = index.findParentByName(cur.name);
  }
  return null;
}

/**
 * 从 viewConfig 的某条 row/column 字段推导出时间信息（如果它是时间字段）
 */
function deriveFromAxisField(
  axisField: { fieldName: string; drillDepth?: number },
  index: ReturnType<typeof buildMetadataIndex>,
): TimeAxisInfo | null {
  const node = index.findByName(axisField.fieldName);
  if (!node) return null;

  if (isTimeHierarchy(node)) {
    const depth = Math.max(1, axisField.drillDepth ?? 1);
    const level = node.children[depth - 1];
    if (!level) return null;
    return { dateDimension: node.name, dateLevel: level.name };
  }

  if (isTimeLevel(node)) {
    // ⚠ 不读 node.hierarchy 字段 — 真实数据该字段是 type 枚举不是 name
    const hier = findTimeHierarchyAncestor(node, index);
    if (!hier) return null; // 孤立时间 level 没有 hierarchy 父 → 无法构造 dateDimension
    return { dateDimension: hier.name, dateLevel: node.name };
  }

  return null;
}

export function detectTimeAxis(
  viewConfig: ViewConfig,
  metadata: Metadata,
): TimeAxisInfo | null {
  const index = buildMetadataIndex(metadata);
  // 行轴优先
  for (const r of viewConfig.rows) {
    const info = deriveFromAxisField(r, index);
    if (info) return info;
  }
  // 列轴备选
  for (const c of viewConfig.columns) {
    const info = deriveFromAxisField(c, index);
    if (info) return info;
  }
  return null;
}

/**
 * 单条 axisField 推导出该字段贡献的所有可选时间维度。
 *
 *   - LEVEL_TIME_*:贡献 1 个(自己 + 上溯到的 hierarchy)
 *   - HIERARCHY_TIME with drillDepth=N:贡献当前展开的 N 个 levels(用户拖了
 *     hierarchy 展开到 月,可按 年/季/月 三个粒度算同期值)
 *   - 非时间字段 / 找不到 hierarchy 父 → []
 */
function deriveAllFromAxisField(
  axisField: { fieldName: string; drillDepth?: number },
  index: ReturnType<typeof buildMetadataIndex>,
): TimeAxisInfo[] {
  const node = index.findByName(axisField.fieldName);
  if (!node) return [];

  if (isTimeHierarchy(node)) {
    const depth = Math.max(1, axisField.drillDepth ?? 1);
    return node.children
      .slice(0, depth)
      .filter(isTimeLevel)
      .map((level) => ({ dateDimension: node.name, dateLevel: level.name }));
  }

  if (isTimeLevel(node)) {
    const hier = findTimeHierarchyAncestor(node, index);
    if (!hier) return [];
    return [{ dateDimension: hier.name, dateLevel: node.name }];
  }

  return [];
}

/**
 * 返回行/列轴上**所有**可选时间维度(去重),用于多时间字段时让用户选择。
 *
 *   - 行轴 + 列轴依次扫描;同 (dateDimension, dateLevel) 去重(行列同字段时只算一个)
 *   - 给 quickCalc 时间智能子菜单用 — 1 个时,菜单仍是 leaf 自动选;多个时弹出"按 X 算"submenu
 */
export function detectAllTimeAxes(
  viewConfig: ViewConfig,
  metadata: Metadata,
): TimeAxisInfo[] {
  const index = buildMetadataIndex(metadata);
  const all: TimeAxisInfo[] = [];
  for (const r of viewConfig.rows) all.push(...deriveAllFromAxisField(r, index));
  for (const c of viewConfig.columns) all.push(...deriveAllFromAxisField(c, index));
  // dedup by dateDimension+dateLevel(行列同字段时避免双显)
  const seen = new Set<string>();
  return all.filter((info) => {
    const key = `${info.dateDimension}|${info.dateLevel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
