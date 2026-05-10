/**
 * MeasureFilterModal — 度量过滤高级条件 modal(P3)
 *
 * 类比 FilterModal,但:
 *   - leaf 字段是 measureName 而非 field
 *   - operator 限定 6 种数值/比较 + Between(MeasureFilterOperator)
 *   - 输出 ClientMeasureFilter(MeasureFilter | MeasureFilterGroup)
 *
 * 行 UI(每行):
 *   [度量 ▼] [operator ▼] [value 或 min ~ max(Between)] [×]
 *
 * 一层 group(group 子节点都是 leaf;嵌套 group 暂不暴露 UI,但 schema 支持)。
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { buildMetadataIndex } from '../../core/metadata/fieldIndex.js';
import type { Metadata } from '../../types/metadata.js';
import type { FilterLiteral } from '../../types/query.js';
import type {
  ClientMeasureFilter,
  MeasureFilter,
  MeasureFilterOperator,
} from '../../types/viewConfig.js';

export interface AvailableMeasure {
  name: string;
  alias: string;
}

export interface MeasureFilterModalProps {
  /** 可选的度量字段列表 */
  availableMeasures: AvailableMeasure[];
  /** 初始 filter; null 新建 */
  initialFilter?: ClientMeasureFilter | null;
  metadata: Metadata;
  onApply: (next: ClientMeasureFilter | null) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

/** 与 FilterPanel 度量 chip 一致 */
const OPERATOR_OPTIONS: { value: MeasureFilterOperator; label: string }[] = [
  { value: 'GreaterThan', label: '大于' },
  { value: 'GreaterThanOrEqual', label: '大于等于' },
  { value: 'LessThan', label: '小于' },
  { value: 'LessThanOrEqual', label: '小于等于' },
  { value: 'Equals', label: '等于' },
  { value: 'NotEquals', label: '不等于' },
  { value: 'Between', label: '区间' },
];

interface RowState {
  measureName: string;
  operator: MeasureFilterOperator;
  value: FilterLiteral; // Between 时是 [min, max]
}

function parseNum(text: string): FilterLiteral {
  const t = text.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

function formatNum(v: unknown): string {
  if (v === '' || v === null || v === undefined) return '';
  return String(v);
}

function isMeaningful(v: FilterLiteral, op: MeasureFilterOperator): boolean {
  if (op === 'Between') {
    if (!Array.isArray(v) || v.length !== 2) return false;
    return v.every(
      (x) => x !== '' && x !== null && x !== undefined && Number.isFinite(Number(x)),
    );
  }
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function decompose(
  initial: ClientMeasureFilter | null | undefined,
  defaultMeasure: string,
): { rows: RowState[]; op: 'And' | 'Or' } {
  if (!initial) {
    return {
      rows: [{ measureName: defaultMeasure, operator: 'GreaterThan', value: '' }],
      op: 'And',
    };
  }
  if ('kind' in initial && initial.kind === 'group') {
    const rows = initial.children
      .filter((c): c is MeasureFilter => !('kind' in c) || c.kind === 'leaf' || c.kind === undefined)
      .map((c) => ({
        measureName: c.measureName,
        operator: c.operator,
        value: c.value,
      }));
    return {
      rows: rows.length > 0
        ? rows
        : [{ measureName: defaultMeasure, operator: 'GreaterThan', value: '' }],
      op: initial.op,
    };
  }
  // leaf
  const leaf = initial as MeasureFilter;
  return {
    rows: [{ measureName: leaf.measureName, operator: leaf.operator, value: leaf.value }],
    op: 'And',
  };
}

function compose(rows: RowState[], op: 'And' | 'Or'): ClientMeasureFilter | null {
  const valid = rows.filter((r) => isMeaningful(r.value, r.operator));
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    const r = valid[0]!;
    return {
      kind: 'leaf',
      measureName: r.measureName,
      operator: r.operator,
      value: r.value,
    };
  }
  return {
    kind: 'group',
    op,
    children: valid.map(
      (r): MeasureFilter => ({
        kind: 'leaf',
        measureName: r.measureName,
        operator: r.operator,
        value: r.value,
      }),
    ),
  };
}

export function MeasureFilterModal({
  availableMeasures,
  initialFilter,
  metadata,
  onApply,
  onClose,
  className,
  style,
}: MeasureFilterModalProps): ReactNode {
  const idx = buildMetadataIndex(metadata);
  const defaultMeasure = availableMeasures[0]?.name ?? '';
  const decomposed = decompose(initialFilter ?? null, defaultMeasure);
  const [rows, setRows] = useState<RowState[]>(decomposed.rows);
  const [op, setOp] = useState<'And' | 'Or'>(decomposed.op);

  const aliasOf = (name: string): string =>
    availableMeasures.find((m) => m.name === name)?.alias ??
    idx.findByName(name)?.alias ??
    name;

  const updateRow = (i: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, idx2) => (idx2 === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        measureName: prev[0]?.measureName ?? defaultMeasure,
        operator: prev[0]?.operator ?? 'GreaterThan',
        value: '',
      },
    ]);
  };
  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx2) => idx2 !== i));
  };
  const apply = () => {
    onApply(compose(rows, op));
    onClose();
  };

  return (
    <div
      className={className ? `filter-modal-overlay ${className}` : 'filter-modal-overlay'}
      data-testid="measure-filter-modal"
      role="dialog"
      aria-modal="true"
      style={style}
    >
      <div className="filter-modal">
        <div className="filter-modal__header">
          <span className="filter-modal__title">高级筛选(度量,跨字段)</span>
          {rows.length > 1 && (
            <select
              className="filter-modal__op"
              data-testid="measure-filter-modal-op"
              value={op}
              onChange={(e) => setOp(e.target.value as 'And' | 'Or')}
            >
              <option value="And">且 (And)</option>
              <option value="Or">或 (Or)</option>
            </select>
          )}
        </div>
        <div className="filter-modal__body">
          {rows.map((r, i) => {
            const isBetween = r.operator === 'Between';
            const tuple: [unknown, unknown] =
              isBetween && Array.isArray(r.value)
                ? [r.value[0] ?? '', r.value[1] ?? '']
                : ['', ''];
            return (
              <div
                key={i}
                className="filter-modal__row"
                data-testid={`measure-filter-modal-row-${i}`}
              >
                <select
                  className="filter-modal__row-field"
                  data-testid={`measure-filter-modal-row-measure-${i}`}
                  value={r.measureName}
                  onChange={(e) => updateRow(i, { measureName: e.target.value, value: '' })}
                  title={aliasOf(r.measureName)}
                >
                  {availableMeasures.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.alias}
                    </option>
                  ))}
                </select>
                <select
                  className="filter-modal__row-op"
                  data-testid={`measure-filter-modal-row-op-${i}`}
                  value={r.operator}
                  onChange={(e) => {
                    const nextOp = e.target.value as MeasureFilterOperator;
                    const wasBetween = r.operator === 'Between';
                    const willBeBetween = nextOp === 'Between';
                    const nextValue =
                      wasBetween === willBeBetween ? r.value : willBeBetween ? [] : '';
                    updateRow(i, { operator: nextOp, value: nextValue });
                  }}
                >
                  {OPERATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {isBetween ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      className="filter-modal__row-val"
                      style={{ width: 80, flex: 'none' }}
                      placeholder="最小值"
                      value={formatNum(tuple[0])}
                      data-testid={`measure-filter-modal-row-min-${i}`}
                      onChange={(e) =>
                        updateRow(i, {
                          value: [parseNum(e.target.value), tuple[1]] as FilterLiteral,
                        })
                      }
                    />
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>~</span>
                    <input
                      type="number"
                      className="filter-modal__row-val"
                      style={{ width: 80, flex: 'none' }}
                      placeholder="最大值"
                      value={formatNum(tuple[1])}
                      data-testid={`measure-filter-modal-row-max-${i}`}
                      onChange={(e) =>
                        updateRow(i, {
                          value: [tuple[0], parseNum(e.target.value)] as FilterLiteral,
                        })
                      }
                    />
                  </span>
                ) : (
                  <input
                    type="number"
                    className="filter-modal__row-val"
                    placeholder="请输入数值"
                    value={formatNum(r.value)}
                    data-testid={`measure-filter-modal-row-val-${i}`}
                    onChange={(e) => updateRow(i, { value: parseNum(e.target.value) })}
                  />
                )}
                <button
                  type="button"
                  className="filter-modal__row-remove"
                  data-testid={`measure-filter-modal-row-remove-${i}`}
                  disabled={rows.length === 1}
                  aria-label={`删除条件 ${i + 1}`}
                  onClick={() => removeRow(i)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="filter-modal__footer">
          <button
            type="button"
            className="filter-modal__add"
            data-testid="measure-filter-modal-add"
            onClick={addRow}
          >
            + 添加条件
          </button>
          <div className="filter-modal__actions">
            <button
              type="button"
              className="filter-modal__cancel"
              data-testid="measure-filter-modal-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="filter-modal__apply"
              data-testid="measure-filter-modal-apply"
              onClick={apply}
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
