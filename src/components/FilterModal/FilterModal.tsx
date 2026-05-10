/**
 * FilterModal — 高级条件 modal(P1.5 单字段 → P3 跨字段升级)
 *
 * 两种模式(prop 决定):
 *   - 单字段模式: 传 `field`, 不传 `availableFields` — 行字段锁定;旧 P1.5 行为
 *   - 通用模式:   传 `availableFields[]` — 每行可选不同字段(跨字段 AND/OR);P3 入口
 *
 * Apply 输出形态:
 *   - 1 行 → leaf
 *   - ≥2 行 → group{op, children: leaf[]}(children 字段可不同 — translateDimensionFilter 已支持)
 *   - 全空(任何行 value 都为空) → null(host 据此清空 / 不创建)
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { buildMetadataIndex } from '../../core/metadata/fieldIndex.js';
import {
  isNumericLikeType,
  operatorsForType,
} from '../../core/filterOperators/operatorsForType.js';
import { getAlias, type Metadata, type ValueType } from '../../types/metadata.js';
import type { BinaryOperator, FilterLiteral } from '../../types/query.js';
import type { ClientFilter } from '../../types/viewConfig.js';

export interface AvailableField {
  name: string;
  alias: string;
  dataType: ValueType;
}

export interface FilterModalProps {
  /** 单字段模式: 锁定字段名(P1.5 兼容) */
  field?: string;
  /** 通用模式: 字段列表,每行可选(P3 跨字段 OR) */
  availableFields?: AvailableField[];
  /** 初始 filter; null 表示新建空 group */
  initialFilter?: ClientFilter | null;
  metadata: Metadata;
  /** apply 回调; null 表示用户清空(host 应移除该 filter) */
  onApply: (next: ClientFilter | null) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

interface RowState {
  /** 字段名(单字段模式 = 锁定值;通用模式 = 用户选) */
  field: string;
  operator: BinaryOperator;
  value: FilterLiteral;
}

function isMultiValueOperator(op: BinaryOperator): boolean {
  return op === 'In' || op === 'NotIn';
}

function parseValue(text: string, op: BinaryOperator, isNumeric: boolean): FilterLiteral {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  if (isMultiValueOperator(op)) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (isNumeric) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }
  return trimmed;
}

function formatValue(v: FilterLiteral): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(',');
  return String(v);
}

function isMeaningfulValue(v: FilterLiteral): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'string' && v === '') return false;
  return true;
}

/** 把 initialFilter 拆为 RowState[] + op + 默认 field */
function decompose(
  initial: ClientFilter | null | undefined,
  defaultField: string,
): { rows: RowState[]; op: 'And' | 'Or' } {
  if (!initial) {
    return {
      rows: [{ field: defaultField, operator: 'Equals', value: '' }],
      op: 'And',
    };
  }
  if (initial.kind === 'leaf') {
    return {
      rows: [{ field: initial.field, operator: initial.operator, value: initial.value }],
      op: 'And',
    };
  }
  // group: 取所有 leaf children
  const rows = initial.children
    .filter((c): c is Extract<ClientFilter, { kind: 'leaf' }> => c.kind === 'leaf')
    .map((c) => ({ field: c.field, operator: c.operator, value: c.value }));
  return {
    rows: rows.length > 0 ? rows : [{ field: defaultField, operator: 'Equals', value: '' }],
    op: initial.op,
  };
}

/** 根据 rows 数 + op 输出 ClientFilter(过滤掉空 value 行);全空返 null */
function compose(rows: RowState[], op: 'And' | 'Or'): ClientFilter | null {
  const valid = rows.filter((r) => isMeaningfulValue(r.value));
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    const r = valid[0]!;
    return { kind: 'leaf', field: r.field, operator: r.operator, value: r.value };
  }
  return {
    kind: 'group',
    op,
    children: valid.map((r) => ({
      kind: 'leaf',
      field: r.field,
      operator: r.operator,
      value: r.value,
    })),
  };
}

export function FilterModal({
  field,
  availableFields,
  initialFilter,
  metadata,
  onApply,
  onClose,
  className,
  style,
}: FilterModalProps): ReactNode {
  const idx = buildMetadataIndex(metadata);

  // 模式判定 + 默认字段
  // - 通用模式: availableFields 非空,每行字段可选
  // - 单字段模式: 传 field,所有行 field 锁定
  const isMulti = !!availableFields && availableFields.length > 0;
  const defaultField =
    field ??
    availableFields?.[0]?.name ??
    '';
  // 用于显示当前模式的字段池 — 单字段模式只暴露该字段
  const fieldsPool: AvailableField[] = isMulti
    ? availableFields!
    : (() => {
        const node = idx.findByName(defaultField);
        return [
          {
            name: defaultField,
            alias: node ? getAlias(node) : defaultField,
            dataType: node?.valueType ?? 'STRING',
          },
        ];
      })();

  const decomposed = decompose(initialFilter ?? null, defaultField);
  const [rows, setRows] = useState<RowState[]>(decomposed.rows);
  const [op, setOp] = useState<'And' | 'Or'>(decomposed.op);

  const fieldInfo = (name: string): AvailableField | undefined =>
    fieldsPool.find((f) => f.name === name) ??
    (() => {
      const n = idx.findByName(name);
      if (!n) return undefined;
      return { name, alias: getAlias(n), dataType: n.valueType ?? 'STRING' };
    })();

  const updateRow = (i: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        field: prev[0]?.field ?? defaultField,
        operator: prev[0]?.operator ?? 'Equals',
        value: '',
      },
    ]);
  };
  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };
  const apply = () => {
    const next = compose(rows, op);
    onApply(next);
    onClose();
  };

  // 标题:单字段模式显示字段名;通用模式显示"高级条件"
  const titleText = isMulti
    ? '高级筛选(跨字段)'
    : `高级条件 — ${fieldInfo(defaultField)?.alias ?? defaultField}`;

  return (
    <div
      className={className ? `filter-modal-overlay ${className}` : 'filter-modal-overlay'}
      data-testid="filter-modal"
      role="dialog"
      aria-modal="true"
      style={style}
    >
      <div className="filter-modal">
        <div className="filter-modal__header">
          <span className="filter-modal__title">{titleText}</span>
          {rows.length > 1 && (
            <select
              className="filter-modal__op"
              data-testid="filter-modal-op"
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
            const fInfo = fieldInfo(r.field);
            const dataType = fInfo?.dataType;
            const isNumeric = isNumericLikeType(dataType);
            const opOptions = operatorsForType(dataType);
            const inputType =
              isNumeric && !isMultiValueOperator(r.operator) ? 'number' : 'text';
            return (
              <div
                key={i}
                className="filter-modal__row"
                data-testid={`filter-modal-row-${i}`}
              >
                {/* 字段选择 — 通用模式可换字段,单字段模式只读显示 */}
                {isMulti ? (
                  <select
                    className="filter-modal__row-field"
                    data-testid={`filter-modal-row-field-${i}`}
                    value={r.field}
                    onChange={(e) => {
                      const newField = e.target.value;
                      const newInfo = fieldInfo(newField);
                      // 切字段时 operator 可能不再合法,reset
                      const validOps = operatorsForType(newInfo?.dataType).map(
                        (o) => o.value,
                      );
                      const safeOp = validOps.includes(r.operator)
                        ? r.operator
                        : (validOps[0] ?? 'Equals');
                      updateRow(i, { field: newField, operator: safeOp, value: '' });
                    }}
                  >
                    {fieldsPool.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.alias}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="filter-modal__row-op"
                  data-testid={`filter-modal-row-op-${i}`}
                  value={r.operator}
                  onChange={(e) =>
                    updateRow(i, { operator: e.target.value as BinaryOperator })
                  }
                >
                  {opOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type={inputType}
                  className="filter-modal__row-val"
                  data-testid={`filter-modal-row-val-${i}`}
                  value={formatValue(r.value)}
                  placeholder={
                    isMultiValueOperator(r.operator) ? '请输入(多个用 , 分隔)' : '请输入'
                  }
                  onChange={(e) =>
                    updateRow(i, {
                      value: parseValue(e.target.value, r.operator, isNumeric),
                    })
                  }
                />
                <button
                  type="button"
                  className="filter-modal__row-remove"
                  data-testid={`filter-modal-row-remove-${i}`}
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
            data-testid="filter-modal-add"
            onClick={addRow}
          >
            + 添加条件
          </button>
          <div className="filter-modal__actions">
            <button
              type="button"
              className="filter-modal__cancel"
              data-testid="filter-modal-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="filter-modal__apply"
              data-testid="filter-modal-apply"
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
