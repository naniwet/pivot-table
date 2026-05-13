/**
 * ConditionalFormatModal — 条件格式化规则编辑器(per-measure)
 *
 * 设计:
 *   - 单 measure scope:modal 显示该 measure 当前所有 rule(threshold + dataBar 各 N 条)
 *   - 增 / 改 / 删:onApply 回 callback,父组件 dispatch ADD/UPDATE/REMOVE
 *   - 草稿 state:用户编辑过程中存在 modal 内,点"确定"才一次性 apply 全部 rule diff
 *     (避免每改一行都触发 query refetch — viewConfig.pageState 变化会让 useMemo 重算)
 *   - "+ 添加规则"分两路:阈值规则 / 数据条
 *
 * 不做:
 *   - 颜色拾取器(用浏览器原生 <input type="color">,够用)
 *   - drag 排序条件(把"+ 加条件" / "× 删条件"做出来即可)
 *   - 实时预览(P2 加,先做基础闭环)
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import type {
  ConditionalFormatMode,
  ConditionalFormatRule,
  ConditionalFormatScope,
  ConditionalFormatThresholdCondition,
} from '../../types/viewConfig.js';

/** 可复用的 scope 下拉(threshold + topN/bottomN 共用) */
function ScopeSelect({
  scope,
  onChange,
  testIdPrefix,
}: {
  scope: ConditionalFormatScope;
  onChange: (next: ConditionalFormatScope) => void;
  testIdPrefix: string;
}): ReactNode {
  return (
    <>
      <span className="cond-fmt-cond-row__label">应用</span>
      <select
        className="cond-fmt-cond-row__op"
        data-testid={`${testIdPrefix}-scope`}
        value={scope}
        onChange={(e) => onChange(e.target.value as ConditionalFormatScope)}
        title="cell=仅命中单元格;row=命中行整行高亮"
      >
        <option value="cell">单元格</option>
        <option value="row">整行</option>
      </select>
    </>
  );
}

export interface ConditionalFormatModalProps {
  /** 该 modal 编辑的 measure name(透视)或 fieldName(明细) */
  measure: string;
  /** measure 的展示别名(中文,UI 标题) */
  measureAlias?: string;
  /**
   * P5+ 模式:'pivot' 编辑透视规则,'adhoc' 编辑明细规则。
   * 新增 rule 时打 mode 标签,父组件按 mode 过滤显示。缺省 'pivot' 保持兼容。
   */
  mode?: ConditionalFormatMode;
  /** 当前 viewConfig 里该 measure 的所有 rule(已按 mode 过滤好,modal 内不再二次过滤) */
  rules: ConditionalFormatRule[];
  /** 用户点确定后,把最终 rules 一次性回传(增/改/删 diff 由父组件算) */
  onApply: (rules: ConditionalFormatRule[]) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

const OP_LABELS: Record<ConditionalFormatThresholdCondition['op'], string> = {
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  eq: '等于',
  between: '介于',
};

const DEFAULT_THRESHOLD_BG = '#fee2e2'; // 浅红
const DEFAULT_DATABAR_COLOR = '#3b82f6'; // 蓝
const DEFAULT_TOPN_BG = '#fde68a'; // 浅金(top)
const DEFAULT_BOTTOMN_BG = '#fecaca'; // 浅红(bottom)
const DEFAULT_TOP_BOTTOM_N = 3;

function genRuleId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function ConditionalFormatModal({
  measure,
  measureAlias,
  mode = 'pivot',
  rules,
  onApply,
  onClose,
  className,
  style,
}: ConditionalFormatModalProps): ReactNode {
  // 草稿:复制传入 rules 给 modal 内部编辑;关闭/取消不动外部
  const [draft, setDraft] = useState<ConditionalFormatRule[]>(() => rules.map((r) => ({ ...r })));

  const updateRule = (idx: number, next: ConditionalFormatRule) => {
    setDraft((prev) => {
      const out = [...prev];
      out[idx] = next;
      return out;
    });
  };
  const removeRule = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };
  const addThreshold = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: genRuleId('th'),
        mode,
        measure,
        kind: 'threshold',
        conditions: [{ op: 'gt', value: 0, style: { bg: DEFAULT_THRESHOLD_BG } }],
      },
    ]);
  };
  const addDataBar = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: genRuleId('db'),
        mode,
        measure,
        kind: 'dataBar',
        color: DEFAULT_DATABAR_COLOR,
        range: 'auto',
      },
    ]);
  };
  const addTopN = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: genRuleId('tn'),
        mode,
        measure,
        kind: 'topN',
        n: DEFAULT_TOP_BOTTOM_N,
        style: { bg: DEFAULT_TOPN_BG },
      },
    ]);
  };
  const addBottomN = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: genRuleId('bn'),
        mode,
        measure,
        kind: 'bottomN',
        n: DEFAULT_TOP_BOTTOM_N,
        style: { bg: DEFAULT_BOTTOMN_BG },
      },
    ]);
  };

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const titleSuffix = measureAlias && measureAlias !== measure ? ` · ${measureAlias}` : '';

  return (
    <div
      className={className ? `cond-fmt-overlay ${className}` : 'cond-fmt-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="cond-fmt-modal"
      style={style}
    >
      <div className="cond-fmt-modal">
        <div className="cond-fmt-modal__header">
          <span className="cond-fmt-modal__title">条件格式化{titleSuffix}</span>
          <button
            type="button"
            className="cond-fmt-modal__close"
            data-testid="cond-fmt-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="cond-fmt-modal__body">
          {draft.length === 0 && (
            <div className="cond-fmt-modal__empty" data-testid="cond-fmt-empty">
              还没有规则。点下方按钮添加。
            </div>
          )}
          {draft.map((rule, idx) => {
            if (rule.kind === 'threshold') {
              return (
                <ThresholdRuleEditor
                  key={rule.id}
                  rule={rule}
                  onChange={(next) => updateRule(idx, next)}
                  onRemove={() => removeRule(idx)}
                />
              );
            }
            if (rule.kind === 'dataBar') {
              return (
                <DataBarRuleEditor
                  key={rule.id}
                  rule={rule}
                  onChange={(next) => updateRule(idx, next)}
                  onRemove={() => removeRule(idx)}
                />
              );
            }
            // topN / bottomN
            return (
              <TopBottomNRuleEditor
                key={rule.id}
                rule={rule}
                onChange={(next) => updateRule(idx, next)}
                onRemove={() => removeRule(idx)}
              />
            );
          })}
        </div>

        <div className="cond-fmt-modal__add-row">
          <button
            type="button"
            className="cond-fmt-modal__add-btn"
            data-testid="cond-fmt-add-threshold"
            onClick={addThreshold}
          >
            + 阈值规则
          </button>
          <button
            type="button"
            className="cond-fmt-modal__add-btn"
            data-testid="cond-fmt-add-databar"
            onClick={addDataBar}
          >
            + 数据条
          </button>
          <button
            type="button"
            className="cond-fmt-modal__add-btn"
            data-testid="cond-fmt-add-topn"
            onClick={addTopN}
          >
            + Top N
          </button>
          <button
            type="button"
            className="cond-fmt-modal__add-btn"
            data-testid="cond-fmt-add-bottomn"
            onClick={addBottomN}
          >
            + Bottom N
          </button>
        </div>

        <div className="cond-fmt-modal__footer">
          <button
            type="button"
            className="cond-fmt-modal__cancel"
            data-testid="cond-fmt-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="cond-fmt-modal__apply"
            data-testid="cond-fmt-apply"
            onClick={apply}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Threshold rule 编辑器(N 个 condition + 删除按钮)
// ============================================================
function ThresholdRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: Extract<ConditionalFormatRule, { kind: 'threshold' }>;
  onChange: (next: Extract<ConditionalFormatRule, { kind: 'threshold' }>) => void;
  onRemove: () => void;
}): ReactNode {
  const updateCondition = (idx: number, next: ConditionalFormatThresholdCondition) => {
    const conditions = [...rule.conditions];
    conditions[idx] = next;
    onChange({ ...rule, conditions });
  };
  const removeCondition = (idx: number) => {
    onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== idx) });
  };
  const addCondition = () => {
    onChange({
      ...rule,
      conditions: [
        ...rule.conditions,
        { op: 'gt', value: 0, style: { bg: DEFAULT_THRESHOLD_BG } },
      ],
    });
  };

  return (
    <div className="cond-fmt-rule cond-fmt-rule--threshold" data-testid={`rule-${rule.id}`}>
      <div className="cond-fmt-rule__head">
        <span className="cond-fmt-rule__kind">阈值规则</span>
        <button
          type="button"
          className="cond-fmt-rule__remove"
          data-testid={`rule-remove-${rule.id}`}
          aria-label="删除规则"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div className="cond-fmt-rule__hint">多条件按从上到下顺序匹配,第一条命中即生效</div>
      {/* P5+ scope 选择器 — 整行 vs 仅 cell;放在 rule 级别(同 rule 内多条件共用 scope) */}
      <div className="cond-fmt-cond-row">
        <ScopeSelect
          scope={rule.scope ?? 'cell'}
          onChange={(scope) => onChange({ ...rule, scope })}
          testIdPrefix={`rule-${rule.id}`}
        />
      </div>
      {rule.conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          onChange={(next) => updateCondition(i, next)}
          onRemove={() => removeCondition(i)}
          canRemove={rule.conditions.length > 1}
        />
      ))}
      <button
        type="button"
        className="cond-fmt-rule__add-cond"
        data-testid={`rule-add-cond-${rule.id}`}
        onClick={addCondition}
      >
        + 加条件
      </button>
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: ConditionalFormatThresholdCondition;
  onChange: (next: ConditionalFormatThresholdCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}): ReactNode {
  const isBetween = condition.op === 'between';
  const value = condition.value;
  return (
    <div className="cond-fmt-cond-row">
      <select
        className="cond-fmt-cond-row__op"
        data-testid="cond-row-op"
        value={condition.op}
        onChange={(e) => {
          const op = e.target.value as ConditionalFormatThresholdCondition['op'];
          // 切到 between → value 变 [min, max];切回单数 → 取数组第一个或 0
          const nextValue: number | [number, number] =
            op === 'between'
              ? Array.isArray(value)
                ? value
                : [typeof value === 'number' ? value : 0, typeof value === 'number' ? value : 0]
              : Array.isArray(value)
                ? value[0]
                : value;
          onChange({ ...condition, op, value: nextValue });
        }}
      >
        {(Object.keys(OP_LABELS) as ConditionalFormatThresholdCondition['op'][]).map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {isBetween ? (
        <>
          <input
            type="number"
            className="cond-fmt-cond-row__value"
            data-testid="cond-row-value-min"
            value={Array.isArray(value) ? value[0] : 0}
            onChange={(e) => {
              const min = Number(e.target.value);
              const max = Array.isArray(value) ? value[1] : 0;
              onChange({ ...condition, value: [min, max] });
            }}
          />
          <span className="cond-fmt-cond-row__sep">~</span>
          <input
            type="number"
            className="cond-fmt-cond-row__value"
            data-testid="cond-row-value-max"
            value={Array.isArray(value) ? value[1] : 0}
            onChange={(e) => {
              const max = Number(e.target.value);
              const min = Array.isArray(value) ? value[0] : 0;
              onChange({ ...condition, value: [min, max] });
            }}
          />
        </>
      ) : (
        <input
          type="number"
          className="cond-fmt-cond-row__value"
          data-testid="cond-row-value"
          value={Array.isArray(value) ? value[0] : value}
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
        />
      )}
      <input
        type="color"
        className="cond-fmt-cond-row__color"
        data-testid="cond-row-color"
        title="背景色"
        value={condition.style.bg ?? DEFAULT_THRESHOLD_BG}
        onChange={(e) =>
          onChange({ ...condition, style: { ...condition.style, bg: e.target.value } })
        }
      />
      <label className="cond-fmt-cond-row__bold" title="加粗">
        <input
          type="checkbox"
          data-testid="cond-row-bold"
          checked={!!condition.style.bold}
          onChange={(e) =>
            onChange({ ...condition, style: { ...condition.style, bold: e.target.checked } })
          }
        />
        粗体
      </label>
      {canRemove && (
        <button
          type="button"
          className="cond-fmt-cond-row__remove"
          data-testid="cond-row-remove"
          aria-label="删除条件"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ============================================================
// DataBar rule 编辑器(颜色 + range)
// ============================================================
function DataBarRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: Extract<ConditionalFormatRule, { kind: 'dataBar' }>;
  onChange: (next: Extract<ConditionalFormatRule, { kind: 'dataBar' }>) => void;
  onRemove: () => void;
}): ReactNode {
  const isAuto = rule.range === 'auto';
  return (
    <div className="cond-fmt-rule cond-fmt-rule--databar" data-testid={`rule-${rule.id}`}>
      <div className="cond-fmt-rule__head">
        <span className="cond-fmt-rule__kind">数据条</span>
        <button
          type="button"
          className="cond-fmt-rule__remove"
          data-testid={`rule-remove-${rule.id}`}
          aria-label="删除规则"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div className="cond-fmt-cond-row">
        <span className="cond-fmt-cond-row__label">颜色</span>
        <input
          type="color"
          className="cond-fmt-cond-row__color"
          data-testid="databar-color"
          value={rule.color}
          onChange={(e) => onChange({ ...rule, color: e.target.value })}
        />
        <span className="cond-fmt-cond-row__label">范围</span>
        <select
          className="cond-fmt-cond-row__op"
          data-testid="databar-range-mode"
          value={isAuto ? 'auto' : 'fixed'}
          onChange={(e) =>
            onChange({
              ...rule,
              range: e.target.value === 'auto' ? 'auto' : { min: 0, max: 100 },
            })
          }
        >
          <option value="auto">自动(列实际 min/max)</option>
          <option value="fixed">固定值</option>
        </select>
        {!isAuto && rule.range !== 'auto' && (
          <>
            <input
              type="number"
              className="cond-fmt-cond-row__value"
              data-testid="databar-min"
              value={rule.range.min}
              onChange={(e) =>
                onChange({ ...rule, range: { min: Number(e.target.value), max: rule.range === 'auto' ? 100 : rule.range.max } })
              }
            />
            <span className="cond-fmt-cond-row__sep">~</span>
            <input
              type="number"
              className="cond-fmt-cond-row__value"
              data-testid="databar-max"
              value={rule.range.max}
              onChange={(e) =>
                onChange({ ...rule, range: { min: rule.range === 'auto' ? 0 : rule.range.min, max: Number(e.target.value) } })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TopN / BottomN rule 编辑器(单 N + 颜色 + 粗体)
// 范围 = 当前页 — UI 用 hint 提示用户跨页排名会变
// ============================================================
function TopBottomNRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: Extract<ConditionalFormatRule, { kind: 'topN' | 'bottomN' }>;
  onChange: (next: Extract<ConditionalFormatRule, { kind: 'topN' | 'bottomN' }>) => void;
  onRemove: () => void;
}): ReactNode {
  const label = rule.kind === 'topN' ? 'Top N' : 'Bottom N';
  const defaultBg = rule.kind === 'topN' ? DEFAULT_TOPN_BG : DEFAULT_BOTTOMN_BG;
  return (
    <div
      className={`cond-fmt-rule cond-fmt-rule--${rule.kind}`}
      data-testid={`rule-${rule.id}`}
    >
      <div className="cond-fmt-rule__head">
        <span className="cond-fmt-rule__kind">{label}</span>
        <button
          type="button"
          className="cond-fmt-rule__remove"
          data-testid={`rule-remove-${rule.id}`}
          aria-label="删除规则"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div className="cond-fmt-rule__hint">
        排名范围 = 当前页(跟"数据条"一致),换页时排名会重算
      </div>
      <div className="cond-fmt-cond-row">
        <span className="cond-fmt-cond-row__label">N</span>
        <input
          type="number"
          min={1}
          step={1}
          className="cond-fmt-cond-row__value"
          data-testid={`topbottom-n-${rule.id}`}
          value={rule.n}
          onChange={(e) => {
            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
            onChange({ ...rule, n });
          }}
        />
        <span className="cond-fmt-cond-row__label">背景</span>
        <input
          type="color"
          className="cond-fmt-cond-row__color"
          data-testid={`topbottom-color-${rule.id}`}
          title="背景色"
          value={rule.style.bg ?? defaultBg}
          onChange={(e) =>
            onChange({ ...rule, style: { ...rule.style, bg: e.target.value } })
          }
        />
        <label className="cond-fmt-cond-row__bold" title="加粗">
          <input
            type="checkbox"
            data-testid={`topbottom-bold-${rule.id}`}
            checked={!!rule.style.bold}
            onChange={(e) =>
              onChange({ ...rule, style: { ...rule.style, bold: e.target.checked } })
            }
          />
          粗体
        </label>
        <ScopeSelect
          scope={rule.scope ?? 'cell'}
          onChange={(scope) => onChange({ ...rule, scope })}
          testIdPrefix={`rule-${rule.id}`}
        />
      </div>
    </div>
  );
}
