/**
 * CustomSortOrderModal — 自定义排序顺序编辑器
 *
 * 用法:dim chip 右键 "自定义排序…" → 打开此 modal
 *   - 列出该 dim 当前可见 member(由 caller 传 initialMembers,从 renderModel.rowHeader 提)
 *   - 拖拽 reorder(2026-05-18 加 HTML5 drag-and-drop)+ ↑↓ 按钮(键盘 fallback)
 *   - "重置为字典序":通过 onApply(null) 通知 caller 走 REMOVE_CUSTOM_SORT_ORDER
 *   - "确定":onApply(newOrder) 走 SET_CUSTOM_SORT_ORDER
 *   - "取消":onClose,啥都不动
 *
 * 草稿 state:用户编辑过程中存在 modal 内,点"确定"才一次性 apply。
 *
 * Trade-off:
 *   - member 列表来自当前页(initialMembers),不去 fetch 全量 — 简单。
 *     若用户想排序"当前页没出现的 member"(因翻页 / 隐藏),这版不支持;
 *     reducer 端 customCaption 数组可以包含任意串,后端按全量数据按 caption 匹配排序。
 *   - 加 member 输入框?(用户手动加未出现的 caption)— P5+ 不做,等真需要再补
 */
import {
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';

export interface CustomSortOrderModalProps {
  /** 该字段的 fieldName(显示用) */
  fieldName: string;
  /** 字段显示别名(模态框标题) */
  fieldAlias?: string;
  /** 当前可见的 member name 列表(从 renderModel.rowHeader 提取,去重保序) */
  initialMembers: string[];
  /**
   * 当前已配的自定义顺序(若有);初始用它,否则用 initialMembers。
   * 跨页编辑场景:可能跟 initialMembers 不一致(已配但当前页 partial)— 取并集
   */
  currentOrder?: string[];
  /**
   * 点"确定" → 回传新顺序数组;
   * 点"重置为字典序" → 回传 null(caller 走 REMOVE_CUSTOM_SORT_ORDER)
   */
  onApply: (newOrder: string[] | null) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

/** 取并集保序:current 在前(用户已配的顺序),initialMembers 中新出现的 append */
function mergeWithVisible(current: string[] | undefined, visible: string[]): string[] {
  if (!current || current.length === 0) return [...visible];
  const seen = new Set(current);
  const result = [...current];
  for (const m of visible) {
    if (!seen.has(m)) {
      result.push(m);
      seen.add(m);
    }
  }
  return result;
}

/**
 * 把 arr[fromIdx] 移到 toIdx 位置 — 语义:drop on target → source 占 target 原槽位,
 * target 被推到 source 来的方向。
 *
 * 用 splice 默认行为:删 fromIdx 后 insert at toIdx
 *   - 往下拖(from<to):[A,B,C] from=0 to=2 → 删 [B,C] → 插 at 2 → [B,C,A] ✓
 *   - 往上拖(from>to):[A,B,C] from=2 to=0 → 删 [A,B] → 插 at 0 → [C,A,B] ✓
 *   - 相邻互换:[A,B,C] from=0 to=1 → 删 [B,C] → 插 at 1 → [B,A,C] ✓
 */
function moveItem<T>(arr: readonly T[], fromIdx: number, toIdx: number): T[] {
  if (fromIdx === toIdx) return [...arr];
  const next = arr.slice();
  const [moved] = next.splice(fromIdx, 1);
  if (moved === undefined) return next;
  next.splice(toIdx, 0, moved);
  return next;
}

export function CustomSortOrderModal({
  fieldName,
  fieldAlias,
  initialMembers,
  currentOrder,
  onApply,
  onClose,
  className,
  style,
}: CustomSortOrderModalProps): ReactNode {
  const [draft, setDraft] = useState<string[]>(() =>
    mergeWithVisible(currentOrder, initialMembers),
  );

  // 拖拽 state — 仅 modal 本地
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ─── HTML5 drag-and-drop handlers ───
  const onDragStart = (idx: number) => (e: ReactDragEvent<HTMLDivElement>) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 必须 setData 才会触发 drag
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const onDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const onDragOver = (idx: number) => (e: ReactDragEvent<HTMLDivElement>) => {
    if (dragIdx === null) return; // 防御:只处理本 modal 拖拽
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };
  const onDragLeave = (idx: number) => () => {
    // 离开当前 hover idx 才清(防止子元素 leave 误清)
    if (dragOverIdx === idx) setDragOverIdx(null);
  };
  const onDrop = (targetIdx: number) => (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    setDraft((prev) => moveItem(prev, dragIdx, targetIdx));
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const moveUp = (idx: number) => {
    if (idx <= 0 || idx >= draft.length) return;
    setDraft((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  };
  const moveDown = (idx: number) => {
    if (idx < 0 || idx >= draft.length - 1) return;
    setDraft((prev) => {
      const next = prev.slice();
      [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
      return next;
    });
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };
  const handleReset = () => {
    onApply(null);
    onClose();
  };

  const titleSuffix = fieldAlias && fieldAlias !== fieldName ? ` · ${fieldAlias}` : '';

  return (
    <div
      className={className ? `cond-fmt-overlay ${className}` : 'cond-fmt-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="custom-sort-modal"
      style={style}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cond-fmt-modal">
        <div className="cond-fmt-modal__header">
          <span className="cond-fmt-modal__title">自定义排序{titleSuffix}</span>
          <button
            type="button"
            className="cond-fmt-modal__close"
            data-testid="custom-sort-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="cond-fmt-modal__body">
          {draft.length === 0 && (
            <div className="cond-fmt-modal__empty" data-testid="custom-sort-empty">
              当前页没有可见的成员
            </div>
          )}
          {draft.length > 0 && (
            <div className="custom-sort-list" data-testid="custom-sort-list">
              {draft.map((member, idx) => {
                const isDragging = dragIdx === idx;
                const isDropTarget =
                  dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
                // 拖拽方向决定 indicator 位置:往上拖 → target 上沿;往下拖 → 下沿
                const dropPos: 'before' | 'after' =
                  dragIdx !== null && dragIdx > idx ? 'before' : 'after';
                const itemStyle: CSSProperties = {
                  opacity: isDragging ? 0.4 : 1,
                  cursor: dragIdx !== null ? 'grabbing' : 'grab',
                  position: 'relative',
                };
                const indicatorStyle: CSSProperties = {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 2,
                  background: '#2563eb',
                  borderRadius: 1,
                  pointerEvents: 'none',
                  [dropPos === 'before' ? 'top' : 'bottom']: -1,
                };
                return (
                  <div
                    key={`${member}-${idx}`}
                    className="custom-sort-item"
                    data-testid={`custom-sort-item-${idx}`}
                    data-dragging={isDragging ? 'true' : undefined}
                    data-drop-target={isDropTarget ? 'true' : undefined}
                    draggable
                    onDragStart={onDragStart(idx)}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver(idx)}
                    onDragLeave={onDragLeave(idx)}
                    onDrop={onDrop(idx)}
                    style={itemStyle}
                  >
                    <span
                      className="custom-sort-item__handle"
                      aria-hidden
                      title="拖拽重排"
                      style={{ cursor: 'inherit', userSelect: 'none', marginRight: 4 }}
                    >
                      ⠿
                    </span>
                    <span className="custom-sort-item__index" aria-hidden>
                      {idx + 1}
                    </span>
                    <span className="custom-sort-item__label">{member}</span>
                    <button
                      type="button"
                      className="custom-sort-item__btn"
                      data-testid={`custom-sort-up-${idx}`}
                      aria-label={`上移 ${member}`}
                      disabled={idx === 0}
                      onClick={() => moveUp(idx)}
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="custom-sort-item__btn"
                      data-testid={`custom-sort-down-${idx}`}
                      aria-label={`下移 ${member}`}
                      disabled={idx === draft.length - 1}
                      onClick={() => moveDown(idx)}
                      title="下移"
                    >
                      ↓
                    </button>
                    {isDropTarget && <div style={indicatorStyle} aria-hidden />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cond-fmt-modal__footer">
          <button
            type="button"
            className="cond-fmt-modal__cancel"
            data-testid="custom-sort-reset"
            onClick={handleReset}
            title="清除自定义排序,恢复默认字典序"
          >
            重置为字典序
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="cond-fmt-modal__cancel"
            data-testid="custom-sort-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="cond-fmt-modal__apply"
            data-testid="custom-sort-apply"
            onClick={handleApply}
            disabled={draft.length === 0}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
