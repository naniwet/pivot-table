/**
 * FilterPanel — 顶部过滤条件区(P3 重构:树编辑器)
 *
 * 维度筛选 (WHERE) + 度量筛选 (HAVING) 两段,各自一棵 FilterTree:
 *   - 拖维度字段 → 维度树根追加 leaf
 *   - 拖度量字段 → 度量树根追加 leaf
 *   - 顶层数组语义 = 隐式 AND group
 *   - 用户在 leaf 上点"拆分"→ 升格为 group(默认 OR),再点"+ 加子条件"加同级 leaf
 *   - 任意 group 上可切 AND/OR
 *
 * 设计取舍(对比旧 chip + modal):
 *   - 收益:AND/OR 嵌套关系直接在树上可见,不再藏在 modal 后;统一交互(都是树编辑器)
 *   - 代价:简单单条件场景 UI 比一行 chip 高一点
 *   - 何时翻案:用户反馈"扁平场景嫌树太重"→ 加 inline collapse(单 leaf 时折叠为一行)
 *
 * Unix:本组件只做布局编排,树操作委派 FilterTree(它委派 filterTree.ts 纯函数)
 * DDD:维度树/度量树共用 FilterTree 模板,通过 renderLeaf 注入领域差异
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { buildMetadataIndex } from '../../core/metadata/fieldIndex.js';
import {
  isNumericLikeType,
  operatorsForType,
} from '../../core/filterOperators/operatorsForType.js';
import { canDrop, type FieldType } from '../../core/dropRules/dropRules.js';
import { computeViewMode } from '../../core/viewMode/viewMode.js';
import type { FieldNode, Metadata } from '../../types/metadata.js';
import type { BinaryOperator, FilterLiteral } from '../../types/query.js';
import type {
  ClientFilter,
  ClientMeasureFilter,
  MeasureFilter,
  MeasureFilterOperator,
  ViewConfig,
} from '../../types/viewConfig.js';
import type { TreeNode } from '../../core/filterTree/filterTree.js';
import { FilterTree } from '../FilterTree/FilterTree.js';
import { MemberSelector } from '../MemberSelector/MemberSelector.js';

type DimLeaf = Extract<ClientFilter, { kind: 'leaf' }>;
type MeasureLeaf = MeasureFilter;

export interface FilterPanelProps {
  viewConfig: ViewConfig;
  metadata: Metadata;
  onChangeFilters: (filters: ClientFilter[]) => void;
  /** 度量筛选树改写回调;不传则度量段只读 */
  onChangeMeasureFilters?: (measureFilters: ClientMeasureFilter[]) => void;
  /**
   * 拖入字段进 FilterPanel 时触发(已废弃 — 树编辑器自己处理 drop;
   * 保留 prop 仅为向后兼容,host 不需要再传)
   * @deprecated
   */
  onFieldDrop?: (fieldName: string, fieldType: FieldType) => void;
  /**
   * P3 旧 chip+modal UI 的 prop(已废弃 — 树编辑器直接拖字段即可)
   * @deprecated
   */
  dimensionFieldsForAdvanced?: unknown;
  /** @deprecated 同上 */
  measuresForAdvanced?: unknown;
  /**
   * 异步加载某字段的全部 distinct 成员(用于 In/NotIn operator 的成员选择器)。
   * 不传则成员选择器入口隐藏,用户回退到手输入逗号分隔。
   */
  loadMembers?: (field: string) => Promise<string[]>;
  className?: string;
  style?: CSSProperties;
}

/** 度量 filter 可用 operator — 数值/比较类 + Between 伪 operator */
const MEASURE_OPERATOR_OPTIONS: { value: MeasureFilterOperator; label: string }[] = [
  { value: 'GreaterThan', label: '大于' },
  { value: 'GreaterThanOrEqual', label: '大于等于' },
  { value: 'LessThan', label: '小于' },
  { value: 'LessThanOrEqual', label: '小于等于' },
  { value: 'Equals', label: '等于' },
  { value: 'NotEquals', label: '不等于' },
  { value: 'Between', label: '区间' },
];

/** In/NotIn 是多值 operator,其他都是单值 */
function isMultiValueOperator(op: BinaryOperator): boolean {
  return op === 'In' || op === 'NotIn';
}

/** 数值 operator + 字段是数值类 → input 类型 number;否则 text */
function inputTypeFor(op: BinaryOperator, field: FieldNode | undefined): 'number' | 'text' {
  if (!field) return 'text';
  if (!isNumericLikeType(field.valueType ?? undefined)) return 'text';
  if (isMultiValueOperator(op)) return 'text';
  return 'number';
}

/** value 输入字符串解析为 FilterLiteral */
function parseValue(
  text: string,
  operator: BinaryOperator,
  inputType: 'number' | 'text',
): FilterLiteral {
  const trimmed = text.trim();
  if (trimmed === '') return inputType === 'number' ? '' : [];
  if (isMultiValueOperator(operator)) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (inputType === 'number') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }
  return trimmed;
}

function formatValue(value: FilterLiteral): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(String).join(',');
  return String(value);
}

function valueCompatibleAcrossOperators(prev: BinaryOperator, next: BinaryOperator): boolean {
  return isMultiValueOperator(prev) === isMultiValueOperator(next);
}

function parseMeasureValue(text: string): FilterLiteral {
  const t = text.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

function formatMeasureValue(v: FilterLiteral): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(',');
  return String(v);
}

export function FilterPanel({
  viewConfig,
  metadata,
  onChangeFilters,
  onChangeMeasureFilters,
  onFieldDrop: _onFieldDrop, // deprecated; FilterTree 自己处理 drop
  loadMembers,
  className,
  style,
}: FilterPanelProps): ReactNode {
  const idx = buildMetadataIndex(metadata);
  // 成员选择器 popup 状态:记录正在编辑的 leaf path(字符串化)
  const [memberPickPath, setMemberPickPath] = useState<string | null>(null);
  const [memberPickField, setMemberPickField] = useState<string | null>(null);
  const [memberPickValue, setMemberPickValue] = useState<string[]>([]);
  const [memberPickApply, setMemberPickApply] = useState<((next: string[]) => void) | null>(
    null,
  );

  const reset = () => {
    onChangeFilters([]);
    if (onChangeMeasureFilters) onChangeMeasureFilters([]);
  };

  // ===== 维度树 leaf 渲染 =====
  const renderDimLeaf = (
    leaf: DimLeaf,
    path: number[],
    onLeafChange: (next: DimLeaf) => void,
  ): ReactNode => {
    const fieldNode = idx.findByName(leaf.field) ?? undefined;
    const fieldLabel = fieldNode?.alias ?? leaf.field;
    const opOptions = operatorsForType(fieldNode?.valueType ?? undefined);
    const inputType = inputTypeFor(leaf.operator, fieldNode);
    const valueText = formatValue(leaf.value);
    const valuePlaceholder = isMultiValueOperator(leaf.operator)
      ? '请输入(多个用 , 分隔)'
      : '请输入';
    const pathKey = path.join('-');

    return (
      <>
        <span
          className="filter-tree__leaf-field"
          data-testid={`filter-leaf-field-${pathKey}`}
          title={leaf.field}
        >
          {fieldLabel}
        </span>
        <select
          className="filter-tree__leaf-op"
          value={leaf.operator}
          data-testid={`filter-leaf-op-${pathKey}`}
          onChange={(e) => {
            const nextOp = e.target.value as BinaryOperator;
            const compat = valueCompatibleAcrossOperators(leaf.operator, nextOp);
            onLeafChange({
              ...leaf,
              operator: nextOp,
              value: compat ? leaf.value : '',
            });
          }}
        >
          {opOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type={inputType}
          className="filter-tree__leaf-value"
          placeholder={valuePlaceholder}
          value={valueText}
          data-testid={`filter-leaf-val-${pathKey}`}
          onChange={(e) =>
            onLeafChange({
              ...leaf,
              value: parseValue(e.target.value, leaf.operator, inputType),
            })
          }
        />
        {loadMembers && isMultiValueOperator(leaf.operator) && (
          <button
            type="button"
            className="filter-tree__leaf-pick"
            data-testid={`filter-leaf-pick-${pathKey}`}
            aria-label={`选择 ${fieldLabel} 成员`}
            title="从成员列表选择"
            onClick={() => {
              setMemberPickPath(pathKey);
              setMemberPickField(leaf.field);
              setMemberPickValue(Array.isArray(leaf.value) ? leaf.value.map(String) : []);
              setMemberPickApply(() => (next: string[]) => onLeafChange({ ...leaf, value: next }));
            }}
          >
            ▾
          </button>
        )}
      </>
    );
  };

  // ===== 度量树 leaf 渲染 =====
  const renderMeasureLeaf = (
    leaf: MeasureLeaf,
    path: number[],
    onLeafChange: (next: MeasureLeaf) => void,
  ): ReactNode => {
    const fieldNode = idx.findByName(leaf.measureName) ?? undefined;
    const fieldLabel = fieldNode?.alias ?? leaf.measureName;
    const isBetween = leaf.operator === 'Between';
    const tuple: [unknown, unknown] = isBetween && Array.isArray(leaf.value)
      ? [leaf.value[0] ?? '', leaf.value[1] ?? '']
      : ['', ''];
    const numFmt = (v: unknown) =>
      v === '' || v === null || v === undefined ? '' : String(v);
    const pathKey = path.join('-');

    return (
      <>
        <span
          className="filter-tree__leaf-field"
          data-testid={`filter-measure-leaf-field-${pathKey}`}
          title={leaf.measureName}
        >
          {fieldLabel}
        </span>
        <select
          className="filter-tree__leaf-op"
          value={leaf.operator}
          data-testid={`filter-measure-leaf-op-${pathKey}`}
          onChange={(e) => {
            const nextOp = e.target.value as MeasureFilterOperator;
            const wasBetween = leaf.operator === 'Between';
            const willBeBetween = nextOp === 'Between';
            const nextValue: FilterLiteral =
              wasBetween === willBeBetween ? leaf.value : willBeBetween ? [] : '';
            onLeafChange({ ...leaf, operator: nextOp, value: nextValue });
          }}
        >
          {MEASURE_OPERATOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isBetween ? (
          <>
            <input
              type="number"
              className="filter-tree__leaf-value filter-tree__leaf-value--between"
              placeholder="最小值"
              value={numFmt(tuple[0])}
              data-testid={`filter-measure-leaf-min-${pathKey}`}
              onChange={(e) => {
                const min = parseMeasureValue(e.target.value);
                onLeafChange({ ...leaf, value: [min, tuple[1]] as FilterLiteral });
              }}
            />
            <span className="filter-tree__between-sep">~</span>
            <input
              type="number"
              className="filter-tree__leaf-value filter-tree__leaf-value--between"
              placeholder="最大值"
              value={numFmt(tuple[1])}
              data-testid={`filter-measure-leaf-max-${pathKey}`}
              onChange={(e) => {
                const max = parseMeasureValue(e.target.value);
                onLeafChange({ ...leaf, value: [tuple[0], max] as FilterLiteral });
              }}
            />
          </>
        ) : (
          <input
            type="number"
            className="filter-tree__leaf-value"
            placeholder="请输入数值"
            value={formatMeasureValue(leaf.value)}
            data-testid={`filter-measure-leaf-val-${pathKey}`}
            onChange={(e) => onLeafChange({ ...leaf, value: parseMeasureValue(e.target.value) })}
          />
        )}
      </>
    );
  };

  // P5+ adhoc 模式标志(走 viewMode 派生 — 单源):
  //   - dim 段允许 Measure 拖入(作为原始列值过滤,等价 SQL `WHERE sale_amount > 500`,见 dropRules.canDropInAdhoc)
  //   - 度量段不渲染(measureFilters/HAVING 在 adhoc 下被 buildAdhocQuery 强制清空,渲染只会迷惑用户)
  const isAdhoc = computeViewMode(viewConfig).isAdhoc;

  // 拖维度字段 → 维度 leaf(adhoc 模式额外接受 Measure 当作原始列过滤)
  const dimFieldDropToLeaf = (fieldName: string, fieldType: FieldType): DimLeaf | null => {
    if (fieldType === 'CalcMeasure') return null; // adhoc/pivot 下都不支持
    if (!isAdhoc && fieldType === 'Measure') return null; // pivot 下 Measure → 度量段
    const adhocMode: 'pivot' | 'adhoc' = isAdhoc ? 'adhoc' : 'pivot';
    if (!canDrop(fieldType, 'filter', adhocMode)) return null;
    const fieldNode = idx.findByName(fieldName);
    const isText = fieldNode && !isNumericLikeType(fieldNode.valueType ?? undefined);
    // Measure 一律按数值类处理(它本来就是数值列)
    const isNumeric = fieldType === 'Measure' || !isText;
    return {
      kind: 'leaf',
      field: fieldName,
      operator: isNumeric ? 'GreaterThan' : 'In',
      value: isNumeric ? '' : [],
    };
  };

  // 拖度量字段 → 度量 leaf(仅 pivot 模式可用;adhoc 下度量段整段不渲染)
  const measureFieldDropToLeaf = (fieldName: string, fieldType: FieldType): MeasureLeaf | null => {
    if (fieldType !== 'Measure' && fieldType !== 'CalcMeasure') return null;
    return {
      kind: 'leaf',
      measureName: fieldName,
      operator: 'GreaterThan',
      value: '',
    };
  };

  const hasAnyFilter = viewConfig.filters.length > 0 || viewConfig.measureFilters.length > 0;

  return (
    <div
      className={className ? `filter-panel ${className}` : 'filter-panel'}
      data-testid="filter-panel"
      style={style}
    >
      {/* 维度筛选 (WHERE) — adhoc 模式下也接受 Measure(原始列过滤),
          标题相应改成"筛选";拖入提示也变得更包容 */}
      <div className="filter-panel__section" data-testid="filter-panel-section-dimension">
        <span
          className="filter-panel__title"
          title={
            isAdhoc
              ? '筛选 — 等价 SQL WHERE,可拖维度或度量(Measure 当原始列过滤)'
              : '维度筛选 — 等价 SQL WHERE,在聚合前限定行'
          }
        >
          {isAdhoc ? '筛选' : '维度筛选'}
        </span>
        <FilterTree<DimLeaf>
          tree={viewConfig.filters}
          onChange={onChangeFilters}
          renderLeaf={renderDimLeaf}
          fieldDropToLeaf={dimFieldDropToLeaf}
          emptyHint={isAdhoc ? '拖字段到这里(维度或度量都行)' : '拖维度字段到这里'}
          testidPrefix="filter-tree-dim"
        />
      </div>

      {/* 度量筛选 (HAVING) — 仅 pivot 模式渲染。
          adhoc 下 buildAdhocQuery 强制 measureFilters: [],UI 上整段隐藏避免迷惑用户 */}
      {!isAdhoc && (
        <div className="filter-panel__section" data-testid="filter-panel-section-measure">
          <span
            className="filter-panel__title"
            title="度量筛选 — 等价 SQL HAVING,在聚合后限定"
          >
            度量筛选
          </span>
          {onChangeMeasureFilters ? (
            <FilterTree<MeasureLeaf>
              tree={viewConfig.measureFilters as TreeNode<MeasureLeaf>[]}
              onChange={(next) => onChangeMeasureFilters(next as ClientMeasureFilter[])}
              renderLeaf={renderMeasureLeaf}
              fieldDropToLeaf={measureFieldDropToLeaf}
              emptyHint="拖度量字段到这里"
              testidPrefix="filter-tree-measure"
            />
          ) : (
            <div className="filter-tree filter-tree--readonly">
              <div className="filter-tree__empty">拖度量字段到这里</div>
            </div>
          )}
        </div>
      )}

      {hasAnyFilter && (
        <button
          type="button"
          className="filter-panel__reset"
          data-testid="filter-reset"
          onClick={reset}
        >
          重置
        </button>
      )}

      {/* 成员选择器 popup */}
      {memberPickPath !== null && memberPickField !== null && memberPickApply !== null && loadMembers && (
        <MemberSelector
          loadMembers={() => loadMembers(memberPickField)}
          selected={memberPickValue}
          onApply={(next) => {
            memberPickApply(next);
          }}
          onClose={() => {
            setMemberPickPath(null);
            setMemberPickField(null);
            setMemberPickValue([]);
            setMemberPickApply(null);
          }}
        />
      )}
    </div>
  );
}
