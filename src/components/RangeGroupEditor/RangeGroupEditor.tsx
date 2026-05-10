/**
 * RangeGroupEditor — 范围分组编辑器（P2 §10.2）
 *
 * 不引入第三方表单库。原生 input + 客户端校验（validateRanges 纯函数）。
 *
 * 输入：baseField + baseFieldAlias（基准字段名 + UI 显示）
 * 输出：onApply 回调收到 CustomRangeGroupField（含生成的 id）
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { validateRanges, type RangeRow } from '../../core/customFields/validateRanges.js';
import type { CustomRangeGroupField } from '../../types/viewConfig.js';

export interface RangeGroupEditorProps {
  /** 基准字段名（如 'Age'） */
  baseField: string;
  /** 基准字段 UI 别名（如 '年龄'） */
  baseFieldAlias: string;
  /** 编辑模式：传入则预填表单 */
  initialField?: CustomRangeGroupField;
  onApply: (field: CustomRangeGroupField) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

const EMPTY_ROW: RangeRow = { min: null, max: null, label: '' };

function genId(): string {
  return `rg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function RangeGroupEditor({
  baseField,
  baseFieldAlias,
  initialField,
  onApply,
  onClose,
  className,
  style,
}: RangeGroupEditorProps): ReactNode {
  const [name, setName] = useState(initialField?.name ?? '');
  const [rows, setRows] = useState<RangeRow[]>(
    initialField?.ranges ?? [EMPTY_ROW, EMPTY_ROW],
  );
  const [error, setError] = useState<string | null>(null);

  const updateRow = (i: number, patch: Partial<RangeRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setError(null);
  };
  const addRow = () => setRows((prev) => [...prev, EMPTY_ROW]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const apply = () => {
    if (!name.trim()) {
      setError('请输入字段名称');
      return;
    }
    const vr = validateRanges(rows);
    if (!vr.ok) {
      setError(vr.error);
      return;
    }
    const cf: CustomRangeGroupField = {
      id: initialField?.id ?? genId(),
      name: name.trim(),
      kind: 'range_group',
      baseField,
      ranges: rows.map((r) => ({ ...r, label: r.label.trim() })),
    };
    onApply(cf);
    onClose();
  };

  return (
    <div
      className={className ? `range-editor-overlay ${className}` : 'range-editor-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="range-editor"
      style={style}
    >
      <div className="range-editor">
        <div className="range-editor__header">
          <span className="range-editor__title">新建范围分组</span>
          <span className="range-editor__base">基于：{baseFieldAlias}</span>
        </div>
        <div className="range-editor__name-row">
          <label>字段名称</label>
          <input
            type="text"
            data-testid="range-editor-name"
            placeholder="例如：年龄段"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="range-editor__hint">
          区间格式：[min, max)；首个区间 min 留空表示 -∞，末尾 max 留空表示 +∞
        </div>
        <div className="range-editor__body">
          {rows.map((r, i) => (
            <div
              key={i}
              className="range-editor__row"
              data-testid={`range-editor-row-${i}`}
            >
              <input
                type="number"
                placeholder="-∞"
                className="range-editor__bound"
                data-testid={`range-editor-row-min-${i}`}
                value={r.min === null ? '' : r.min}
                onChange={(e) => updateRow(i, { min: parseNum(e.target.value) })}
              />
              <span className="range-editor__op">≤ {baseFieldAlias} &lt;</span>
              <input
                type="number"
                placeholder="+∞"
                className="range-editor__bound"
                data-testid={`range-editor-row-max-${i}`}
                value={r.max === null ? '' : r.max}
                onChange={(e) => updateRow(i, { max: parseNum(e.target.value) })}
              />
              <span className="range-editor__arrow">→</span>
              <input
                type="text"
                placeholder="标签"
                className="range-editor__label"
                data-testid={`range-editor-row-label-${i}`}
                value={r.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
              />
              <button
                type="button"
                className="range-editor__row-remove"
                data-testid={`range-editor-row-remove-${i}`}
                aria-label={`删除区间 ${i + 1}`}
                disabled={rows.length <= 2}
                onClick={() => removeRow(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="range-editor__add"
            data-testid="range-editor-add"
            onClick={addRow}
          >
            + 添加区间
          </button>
        </div>
        {error && (
          <div className="range-editor__error" data-testid="range-editor-error">
            ⚠️ {error}
          </div>
        )}
        <div className="range-editor__footer">
          <button
            type="button"
            className="range-editor__cancel"
            data-testid="range-editor-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="range-editor__apply"
            data-testid="range-editor-apply"
            onClick={apply}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
