import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { getAlias, type DataSetField, type Metadata, type View } from '../../types/metadata.js';
import type {
  CustomRelationConfig,
  RelationCardinality,
  RelationDirection,
} from '../../types/viewConfig.js';
import { SelectMenu } from '../SelectMenu/SelectMenu.js';

interface RelationGraphPanelProps {
  metadata: Metadata;
  customRelations: CustomRelationConfig[];
  onChange: (relations: CustomRelationConfig[]) => void;
}

interface BaseRelation {
  srcViewId: string;
  destViewId: string;
  cardinalityType?: string | null;
  filterDirection?: string | null;
  fieldRelations?: Array<{ srcFieldId?: string; destFieldId?: string }>;
}

type Selection =
  | { kind: 'base'; key: string }
  | { kind: 'custom'; id: string }
  | { kind: 'draft' }
  | null;

interface NodePosition {
  x: number;
  y: number;
}

interface DragState {
  viewId: string;
  offsetX: number;
  offsetY: number;
}

const SVG_WIDTH = 720;
const SVG_HEIGHT = 520;
const NODE_WIDTH = 152;
const NODE_HEIGHT = 58;

function getRelationGraphRelations(metadata: Metadata): BaseRelation[] {
  const graph = metadata.relationGraph;
  if (!graph || typeof graph !== 'object') return [];
  const relations = (graph as { relations?: unknown }).relations;
  if (!Array.isArray(relations)) return [];
  return relations.filter((item): item is BaseRelation => {
    if (!item || typeof item !== 'object') return false;
    const rel = item as Partial<BaseRelation>;
    return typeof rel.srcViewId === 'string' && typeof rel.destViewId === 'string';
  });
}

function viewLabel(view: View | undefined): string {
  if (!view) return '';
  return getAlias(view) || view.name;
}

function fieldLabel(field: DataSetField | undefined): string {
  if (!field) return '';
  return getAlias(field) || field.name;
}

function cardinalityLabel(cardinalityType?: string | null): string {
  if (cardinalityType === 'MANY2ONE') return 'MANY → ONE';
  if (cardinalityType === 'ONE2ONE') return 'ONE → ONE';
  if (cardinalityType === 'MANY2MANY') return 'MANY → MANY';
  return 'ONE → MANY';
}

function directionLabel(direction?: string | null): string {
  if (direction === 'BOTH' || direction === 'Both') return '双向';
  return '单向';
}

function fieldOptions(fields: DataSetField[]) {
  return fields.map((field) => ({ value: field.id, label: fieldLabel(field) }));
}

function firstField(fieldsByView: Map<string, DataSetField[]>, viewId: string): DataSetField | undefined {
  return fieldsByView.get(viewId)?.[0];
}

function nextRelationId(): string {
  return `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function baseRelationKey(relation: BaseRelation): string {
  return `${relation.srcViewId}-${relation.destViewId}`;
}

function getLayout(views: View[]): Map<string, NodePosition> {
  const columns = views.length <= 4 ? 2 : 3;
  const horizontalGap = columns === 2 ? 300 : 210;
  const verticalGap = 138;
  const startX = columns === 2 ? 108 : 58;
  const startY = 78;
  const map = new Map<string, NodePosition>();
  views.forEach((view, index) => {
    map.set(view.id, {
      x: startX + (index % columns) * horizontalGap,
      y: startY + Math.floor(index / columns) * verticalGap,
    });
  });
  return map;
}

function centerOf(position: NodePosition): NodePosition {
  return { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT / 2 };
}

function clampNodePosition(position: NodePosition): NodePosition {
  return {
    x: Math.max(18, Math.min(SVG_WIDTH - NODE_WIDTH - 18, Math.round(position.x))),
    y: Math.max(18, Math.min(SVG_HEIGHT - NODE_HEIGHT - 18, Math.round(position.y))),
  };
}

function edgeAnchor(from: NodePosition, to: NodePosition): NodePosition {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx / NODE_WIDTH > absDy / NODE_HEIGHT) {
    return {
      x: fromCenter.x + (dx > 0 ? NODE_WIDTH / 2 : -NODE_WIDTH / 2),
      y: fromCenter.y + (dy / Math.max(absDx, 1)) * (NODE_WIDTH / 2),
    };
  }
  return {
    x: fromCenter.x + (dx / Math.max(absDy, 1)) * (NODE_HEIGHT / 2),
    y: fromCenter.y + (dy > 0 ? NODE_HEIGHT / 2 : -NODE_HEIGHT / 2),
  };
}

function cardinalitiesFromBase(relation: BaseRelation): [RelationCardinality, RelationCardinality] {
  if (relation.cardinalityType === 'MANY2ONE') return ['MANY', 'ONE'];
  if (relation.cardinalityType === 'ONE2ONE') return ['ONE', 'ONE'];
  if (relation.cardinalityType === 'MANY2MANY') return ['MANY', 'MANY'];
  return ['ONE', 'MANY'];
}

function offsetToward(from: NodePosition, to: NodePosition, distance: number): NodePosition {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}

function renderCardinalityMarker(
  edgeId: string,
  side: 'left' | 'right',
  cardinality: RelationCardinality,
  anchor: NodePosition,
  toward: NodePosition,
): ReactNode {
  // 2026-05-17 重做端点标记 — 旧版 ONE 单线太细易混,MANY 用 3 个独立 <line> 没 stroke-linejoin
  // 看起来碎。改为:
  //   ONE  → 加长加粗的单 perpendicular 杠(类似 ER 图的"exactly one")
  //   MANY → 单个 <path> 画 3-prong 鸡爪 + stroke-linejoin round(干净尖角)
  //   两者都离 box 边 12-18px,给视觉缓冲不与 box 边线打架
  const dx = toward.x - anchor.x;
  const dy = toward.y - anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  // perpendicular 单位向量 — 用于把 marker 沿 edge 法向铺开;
  // 实际离 anchor 的距离由 offsetToward 用 edge 方向算
  const px = -dy / length;
  const py = dx / length;

  if (cardinality === 'ONE') {
    // ONE:单 perpendicular 短杠,12px 离 box,半长 7px,加粗(CSS stroke-width)
    const bar = offsetToward(anchor, toward, 13);
    const half = 7;
    const a = { x: bar.x + px * half, y: bar.y + py * half };
    const b = { x: bar.x - px * half, y: bar.y - py * half };
    return (
      <line
        className="relation-graph__cardinality-marker relation-graph__cardinality-marker--one"
        data-testid={`relation-cardinality-${edgeId}-${side}`}
        data-cardinality="one"
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
      />
    );
  }

  // MANY:3-prong 鸡爪,base 在内、3 个尖朝外。单 <path> 画(stroke-linejoin round 让尖角圆滑)
  // 形状:base 是中心点,3 条线分别去 left-tip / right-tip / forward-tip(toward 反方向)
  const base = offsetToward(anchor, toward, 9);
  const forward = offsetToward(anchor, toward, 18);
  const wing = 7;
  const wingL = { x: forward.x + px * wing, y: forward.y + py * wing };
  const wingR = { x: forward.x - px * wing, y: forward.y - py * wing };
  // 3 条线从 base 散开:wingL ← base → wingR + base → forward
  // 用 polyline 形式:wingL → base → forward → base → wingR(穿 base 两次,linejoin 圆)
  const d =
    `M ${wingL.x} ${wingL.y} L ${base.x} ${base.y} ` +
    `L ${forward.x} ${forward.y} L ${base.x} ${base.y} ` +
    `L ${wingR.x} ${wingR.y}`;
  return (
    <path
      className="relation-graph__cardinality-marker relation-graph__cardinality-marker--many"
      data-testid={`relation-cardinality-${edgeId}-${side}`}
      data-cardinality="many"
      d={d}
    />
  );
}

function renderDirectionMarker(
  edgeId: string,
  start: NodePosition,
  end: NodePosition,
  direction: 'one-to-many' | 'source-to-target',
): ReactNode {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const tip = offsetToward(mid, end, 5);
  const back = offsetToward(mid, start, 5);
  const left = { x: back.x + px * 4, y: back.y + py * 4 };
  const right = { x: back.x - px * 4, y: back.y - py * 4 };
  return (
    <path
      className="relation-graph__direction"
      data-testid={`relation-direction-${edgeId}`}
      data-direction={direction}
      d={`M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y}`}
    />
  );
}

function directionPointsForCardinality(
  start: NodePosition,
  end: NodePosition,
  leftCardinality: RelationCardinality,
  rightCardinality: RelationCardinality,
): { start: NodePosition; end: NodePosition; direction: 'one-to-many' | 'source-to-target' } {
  if (leftCardinality === 'ONE' && rightCardinality === 'MANY') {
    return { start, end, direction: 'one-to-many' };
  }
  if (leftCardinality === 'MANY' && rightCardinality === 'ONE') {
    return { start: end, end: start, direction: 'one-to-many' };
  }
  return { start, end, direction: 'source-to-target' };
}

function makeDraftRelation(
  views: View[],
  fieldsByView: Map<string, DataSetField[]>,
): CustomRelationConfig | null {
  const leftViewId = views[0]?.id ?? '';
  const rightViewId = views[1]?.id ?? views[0]?.id ?? '';
  const leftFieldId = firstField(fieldsByView, leftViewId)?.id ?? '';
  const rightFieldId = firstField(fieldsByView, rightViewId)?.id ?? '';
  if (!leftViewId || !rightViewId || !leftFieldId || !rightFieldId) return null;
  return {
    id: nextRelationId(),
    name: `${viewLabel(views[0])}-${viewLabel(views[1] ?? views[0])}`,
    enabled: true,
    leftViewId,
    rightViewId,
    leftCardinality: 'ONE',
    rightCardinality: 'MANY',
    direction: 'Single',
    conditions: [{ leftFieldId, rightFieldId, operator: 'EQUALS' }],
    isWeak: true,
    isFilter: false,
  };
}

function draftFromBase(
  relation: BaseRelation,
  metadata: Metadata,
  fieldsByView: Map<string, DataSetField[]>,
): CustomRelationConfig | null {
  const leftViewId = relation.srcViewId;
  const rightViewId = relation.destViewId;
  const fieldRelation = relation.fieldRelations?.[0];
  const leftFieldId = fieldRelation?.srcFieldId ?? firstField(fieldsByView, leftViewId)?.id ?? '';
  const rightFieldId = fieldRelation?.destFieldId ?? firstField(fieldsByView, rightViewId)?.id ?? '';
  if (!leftFieldId || !rightFieldId) return null;
  const left = metadata.views.find((view) => view.id === leftViewId);
  const right = metadata.views.find((view) => view.id === rightViewId);
  const [leftCardinality, rightCardinality] =
    relation.cardinalityType === 'MANY2ONE'
      ? (['MANY', 'ONE'] as const)
      : relation.cardinalityType === 'ONE2ONE'
        ? (['ONE', 'ONE'] as const)
        : relation.cardinalityType === 'MANY2MANY'
          ? (['MANY', 'MANY'] as const)
          : (['ONE', 'MANY'] as const);
  return {
    id: nextRelationId(),
    name: `${viewLabel(left)}-${viewLabel(right)}`,
    enabled: true,
    leftViewId,
    rightViewId,
    leftCardinality,
    rightCardinality,
    direction: relation.filterDirection === 'BOTH' ? 'Both' : 'Single',
    conditions: [{ leftFieldId, rightFieldId, operator: 'EQUALS' }],
    isWeak: true,
    isFilter: false,
  };
}

function RelationSelect({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <label className="relation-editor__field">
      <span className="relation-editor__field-label">{label}</span>
      <SelectMenu
        ariaLabel={label}
        testId={testId}
        className="relation-editor__select"
        value={value}
        options={options}
        onChange={onChange}
      />
    </label>
  );
}

export function RelationGraphPanel({
  metadata,
  customRelations,
  onChange,
}: RelationGraphPanelProps): ReactNode {
  const views = metadata.views;
  const baseRelations = getRelationGraphRelations(metadata);
  const viewOptions = views.map((view) => ({ value: view.id, label: viewLabel(view) }));
  const fieldsByView = useMemo(() => {
    const map = new Map<string, DataSetField[]>();
    for (const field of metadata.fields) {
      if (!field.viewId) continue;
      const arr = map.get(field.viewId) ?? [];
      arr.push(field);
      map.set(field.viewId, arr);
    }
    return map;
  }, [metadata.fields]);
  const basePositions = useMemo(() => getLayout(views), [views]);
  const [manualPositions, setManualPositions] = useState<Record<string, NodePosition>>({});
  const positions = useMemo(() => {
    const map = new Map(basePositions);
    for (const [viewId, position] of Object.entries(manualPositions)) {
      if (map.has(viewId)) map.set(viewId, position);
    }
    return map;
  }, [basePositions, manualPositions]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<CustomRelationConfig | null>(null);

  useEffect(() => {
    setManualPositions((current) => {
      const next: Record<string, NodePosition> = {};
      for (const view of views) {
        if (current[view.id]) next[view.id] = current[view.id];
      }
      return next;
    });
  }, [views]);

  useEffect(() => {
    if (!dragState) return;
    const onMouseMove = (event: MouseEvent) => {
      const point = clientToSvgPoint(event.clientX, event.clientY);
      setManualPositions((current) => ({
        ...current,
        [dragState.viewId]: clampNodePosition({
          x: point.x - dragState.offsetX,
          y: point.y - dragState.offsetY,
        }),
      }));
    };
    const onMouseUp = () => setDragState(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState]);

  const clientToSvgPoint = (clientX: number, clientY: number): NodePosition => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: clientX, y: clientY };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * SVG_WIDTH,
      y: ((clientY - rect.top) / rect.height) * SVG_HEIGHT,
    };
  };

  const selectedBase =
    selection?.kind === 'base'
      ? baseRelations.find((relation) => baseRelationKey(relation) === selection.key)
      : undefined;
  const editableRelation = draft;
  const leftFields = editableRelation ? fieldsByView.get(editableRelation.leftViewId) ?? [] : [];
  const rightFields = editableRelation ? fieldsByView.get(editableRelation.rightViewId) ?? [] : [];
  const selectedCondition = editableRelation?.conditions[0];
  const canSave =
    Boolean(editableRelation?.leftViewId) &&
    Boolean(editableRelation?.rightViewId) &&
    Boolean(selectedCondition?.leftFieldId) &&
    Boolean(selectedCondition?.rightFieldId);

  const openEditor = () => {
    setEditorOpen(true);
    if (!selection && customRelations[0]) {
      setSelection({ kind: 'custom', id: customRelations[0].id });
      setDraft({ ...customRelations[0], conditions: [...customRelations[0].conditions] });
    }
  };

  const selectBase = (relation: BaseRelation) => {
    setSelection({ kind: 'base', key: baseRelationKey(relation) });
    setDraft(null);
  };

  const selectCustom = (relation: CustomRelationConfig) => {
    setSelection({ kind: 'custom', id: relation.id });
    setDraft({ ...relation, conditions: [...relation.conditions] });
  };

  const startAdd = () => {
    const next = makeDraftRelation(views, fieldsByView);
    if (!next) return;
    setSelection({ kind: 'draft' });
    setDraft(next);
  };

  const copyBase = () => {
    if (!selectedBase) return;
    const next = draftFromBase(selectedBase, metadata, fieldsByView);
    if (!next) return;
    setSelection({ kind: 'draft' });
    setDraft(next);
  };

  const updateDraft = (patch: Partial<CustomRelationConfig>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateDraftCondition = (patch: Partial<CustomRelationConfig['conditions'][number]>) => {
    setDraft((current) => {
      if (!current) return current;
      const condition = current.conditions[0] ?? { leftFieldId: '', rightFieldId: '', operator: 'EQUALS' as const };
      return { ...current, conditions: [{ ...condition, ...patch }] };
    });
  };

  const updateView = (side: 'left' | 'right', viewId: string) => {
    const firstFieldId = firstField(fieldsByView, viewId)?.id ?? '';
    if (side === 'left') {
      updateDraft({ leftViewId: viewId });
      updateDraftCondition({ leftFieldId: firstFieldId });
    } else {
      updateDraft({ rightViewId: viewId });
      updateDraftCondition({ rightFieldId: firstFieldId });
    }
  };

  const saveDraft = () => {
    if (!editableRelation || !canSave) return;
    const left = views.find((view) => view.id === editableRelation.leftViewId);
    const right = views.find((view) => view.id === editableRelation.rightViewId);
    const saved = { ...editableRelation, name: editableRelation.name || `${viewLabel(left)}-${viewLabel(right)}` };
    if (selection?.kind === 'custom') {
      onChange(customRelations.map((relation) => (relation.id === saved.id ? saved : relation)));
    } else {
      onChange([...customRelations, saved]);
      setSelection({ kind: 'custom', id: saved.id });
    }
    setDraft({ ...saved, conditions: [...saved.conditions] });
  };

  const deleteDraft = () => {
    if (selection?.kind === 'custom' && editableRelation) {
      onChange(customRelations.filter((relation) => relation.id !== editableRelation.id));
    }
    setSelection(null);
    setDraft(null);
  };

  const renderEdge = (
    id: string,
    fromViewId: string,
    toViewId: string,
    leftCardinality: RelationCardinality,
    rightCardinality: RelationCardinality,
    kind: 'base' | 'custom',
    selected: boolean,
    disabled: boolean,
    onClick: () => void,
  ) => {
    const from = positions.get(fromViewId);
    const to = positions.get(toViewId);
    if (!from || !to) return null;
    const start = edgeAnchor(from, to);
    const end = edgeAnchor(to, from);
    const semanticDirection = directionPointsForCardinality(start, end, leftCardinality, rightCardinality);
    return (
      <g
        key={id}
        className="relation-graph__edge-hit"
        data-testid={`relation-svg-edge-${id}`}
        data-selected={selected ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        onClick={onClick}
      >
        <line
          className={`relation-graph__edge relation-graph__edge--${kind}`}
          data-testid={`relation-svg-edge-line-${id}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
        />
        {renderDirectionMarker(id, semanticDirection.start, semanticDirection.end, semanticDirection.direction)}
        {renderCardinalityMarker(id, 'left', leftCardinality, start, end)}
        {renderCardinalityMarker(id, 'right', rightCardinality, end, start)}
      </g>
    );
  };

  const startDragNode = (event: ReactMouseEvent<SVGGElement>, viewId: string) => {
    const position = positions.get(viewId);
    if (!position) return;
    event.preventDefault();
    const point = clientToSvgPoint(event.clientX, event.clientY);
    setDragState({ viewId, offsetX: point.x - position.x, offsetY: point.y - position.y });
  };

  return (
    <div className="relation-panel" data-testid="relation-graph-panel">
      <div className="relation-panel__summary">
        <div>
          <div className="relation-panel__summary-title">关系图</div>
          <div className="relation-panel__summary-subtitle">本次分析临时覆盖,不写回模型</div>
        </div>
        <div className="relation-panel__stats" aria-label="关系图统计">
          <span>{views.length} 张表</span>
          <span>{baseRelations.length} 原始</span>
          <span>{customRelations.length} 自定义</span>
        </div>
      </div>

      <button
        type="button"
        className="relation-panel__open"
        data-testid="relation-open-editor"
        onClick={openEditor}
      >
        打开关系图编辑器
      </button>

      <div className="relation-panel__mini-list">
        <div className="relation-panel__mini-title">本次分析连线</div>
        {customRelations.length === 0 ? (
          <div className="relation-panel__empty">暂无自定义连线</div>
        ) : (
          customRelations.map((relation) => {
            const left = views.find((view) => view.id === relation.leftViewId);
            const right = views.find((view) => view.id === relation.rightViewId);
            return (
              <button
                key={relation.id}
                type="button"
                className="relation-panel__mini-edge"
                data-disabled={relation.enabled ? undefined : 'true'}
                onClick={() => {
                  setEditorOpen(true);
                  selectCustom(relation);
                }}
              >
                <span>{viewLabel(left)}</span>
                <span>{relation.leftCardinality} → {relation.rightCardinality}</span>
                <span>{viewLabel(right)}</span>
              </button>
            );
          })
        )}
      </div>

      {editorOpen && (
        <div className="relation-editor-overlay" role="presentation">
          <div className="relation-editor" data-testid="relation-editor-modal" role="dialog" aria-modal="true">
            <div className="relation-editor__header">
              <div>
                <div className="relation-editor__title">关系图编辑器</div>
                <div className="relation-editor__subtitle">原始模型只读展示,自定义关系只影响本次查询</div>
              </div>
              <div className="relation-editor__toolbar">
                <button type="button" className="relation-editor__primary" data-testid="relation-add" onClick={startAdd}>
                  新增关系
                </button>
                <button type="button" className="relation-editor__ghost" onClick={() => setEditorOpen(false)}>
                  关闭
                </button>
              </div>
            </div>

            <div className="relation-editor__body">
              <div className="relation-editor__canvas">
                <svg
                  ref={svgRef}
                  className="relation-graph-svg"
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                  role="img"
                  aria-label="关系图"
                >
                  <rect className="relation-graph__backdrop" x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} rx="18" />
                  {baseRelations.map((relation) =>
                    (() => {
                      const [leftCardinality, rightCardinality] = cardinalitiesFromBase(relation);
                      return renderEdge(
                        `base-${baseRelationKey(relation)}`,
                        relation.srcViewId,
                        relation.destViewId,
                        leftCardinality,
                        rightCardinality,
                        'base',
                        selection?.kind === 'base' && selection.key === baseRelationKey(relation),
                        false,
                        () => selectBase(relation),
                      );
                    })(),
                  )}
                  {customRelations.map((relation) =>
                    renderEdge(
                      `custom-${relation.id}`,
                      relation.leftViewId,
                      relation.rightViewId,
                      relation.leftCardinality,
                      relation.rightCardinality,
                      'custom',
                      selection?.kind === 'custom' && selection.id === relation.id,
                      !relation.enabled,
                      () => selectCustom(relation),
                    ),
                  )}
                  {views.map((view) => {
                    const position = positions.get(view.id);
                    if (!position) return null;
                    const fieldCount = fieldsByView.get(view.id)?.length ?? 0;
                    return (
                      <g
                        key={view.id}
                        className="relation-graph__node"
                        data-testid={`relation-svg-node-${view.id}`}
                        transform={`translate(${position.x} ${position.y})`}
                        onMouseDown={(event) => startDragNode(event, view.id)}
                      >
                        <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="10" />
                        <text className="relation-graph__node-title" x="16" y="25">
                          {viewLabel(view)}
                        </text>
                        <text className="relation-graph__node-meta" x="16" y="44">
                          {fieldCount} 字段
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <aside className="relation-editor__side">
                {selectedBase ? (
                  <div className="relation-editor__card">
                    <div className="relation-editor__card-head">
                      <span>原始关系</span>
                      <span className="relation-panel__badge">只读</span>
                    </div>
                    <div className="relation-editor__fact">
                      <span>{viewLabel(views.find((view) => view.id === selectedBase.srcViewId))}</span>
                      <strong>{cardinalityLabel(selectedBase.cardinalityType)}</strong>
                      <span>{viewLabel(views.find((view) => view.id === selectedBase.destViewId))}</span>
                    </div>
                    <div className="relation-editor__muted">
                      筛选方向: {directionLabel(selectedBase.filterDirection)}
                    </div>
                    <button type="button" className="relation-editor__primary" onClick={copyBase}>
                      复制为本次分析覆盖
                    </button>
                  </div>
                ) : editableRelation ? (
                  <div className="relation-editor__card">
                    <div className="relation-editor__card-head">
                      <span>{selection?.kind === 'custom' ? '编辑自定义关系' : '新增自定义关系'}</span>
                      <span className="relation-panel__badge relation-panel__badge--custom">查询级</span>
                    </div>
                    <div className="relation-editor__form">
                      <RelationSelect
                        label="左表"
                        testId="relation-left-view"
                        value={editableRelation.leftViewId}
                        options={viewOptions}
                        onChange={(value) => updateView('left', value)}
                      />
                      <RelationSelect
                        label="右表"
                        testId="relation-right-view"
                        value={editableRelation.rightViewId}
                        options={viewOptions}
                        onChange={(value) => updateView('right', value)}
                      />
                      <RelationSelect
                        label="左字段"
                        testId="relation-left-field"
                        value={selectedCondition?.leftFieldId ?? ''}
                        options={fieldOptions(leftFields)}
                        onChange={(value) => updateDraftCondition({ leftFieldId: value })}
                      />
                      <RelationSelect
                        label="右字段"
                        testId="relation-right-field"
                        value={selectedCondition?.rightFieldId ?? ''}
                        options={fieldOptions(rightFields)}
                        onChange={(value) => updateDraftCondition({ rightFieldId: value })}
                      />
                      <RelationSelect
                        label="左基数"
                        testId="relation-left-cardinality"
                        value={editableRelation.leftCardinality}
                        options={[
                          { value: 'ONE', label: 'ONE' },
                          { value: 'MANY', label: 'MANY' },
                        ]}
                        onChange={(value) => updateDraft({ leftCardinality: value as RelationCardinality })}
                      />
                      <RelationSelect
                        label="右基数"
                        testId="relation-right-cardinality"
                        value={editableRelation.rightCardinality}
                        options={[
                          { value: 'ONE', label: 'ONE' },
                          { value: 'MANY', label: 'MANY' },
                        ]}
                        onChange={(value) => updateDraft({ rightCardinality: value as RelationCardinality })}
                      />
                      <RelationSelect
                        label="筛选方向"
                        testId="relation-direction"
                        value={editableRelation.direction}
                        options={[
                          { value: 'Single', label: '单向' },
                          { value: 'Both', label: '双向' },
                        ]}
                        onChange={(value) => updateDraft({ direction: value as RelationDirection })}
                      />
                      <label className="relation-editor__toggle">
                        <input
                          type="checkbox"
                          checked={editableRelation.enabled}
                          onChange={(event) => updateDraft({ enabled: event.currentTarget.checked })}
                        />
                        启用这条关系
                      </label>
                    </div>
                    <div className="relation-editor__condition">
                      {fieldLabel(metadata.fields.find((field) => field.id === selectedCondition?.leftFieldId))}
                      {' = '}
                      {fieldLabel(metadata.fields.find((field) => field.id === selectedCondition?.rightFieldId))}
                    </div>
                    <div className="relation-editor__actions">
                      <button
                        type="button"
                        className="relation-editor__primary"
                        data-testid="relation-save"
                        disabled={!canSave}
                        onClick={saveDraft}
                      >
                        保存关系
                      </button>
                      <button
                        type="button"
                        className="relation-editor__danger"
                        data-testid="relation-delete"
                        onClick={deleteDraft}
                      >
                        {selection?.kind === 'custom' ? '删除关系' : '放弃新增'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relation-editor__empty">
                    <strong>选择一条线查看详情</strong>
                    <span>原始关系可复制成查询级覆盖关系,自定义关系可编辑或删除。</span>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
