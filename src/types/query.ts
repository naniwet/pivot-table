/**
 * 后端 Query 接口类型
 *
 * **Source of truth**: [schemas/query-schema.json](../../schemas/query-schema.json)
 * 修改原则：后端 schema 变了才改；前端不允许"为了好用"裁剪。
 * 任何字段命名/枚举值不一致都按 schema 为准。
 */

export type QueryType = 'DetailQuery' | 'PivotQuery';
export type EngineType = 'MDX' | 'SQL';
export type CacheType = 'CACHE' | 'UNCACHE' | 'CLEAR';
export type ExportType = 'EXPORT' | 'REFRESH';

export type Aggregator =
  | 'SUM'
  | 'AVG'
  | 'MIN'
  | 'MAX'
  | 'COUNT'
  | 'COUNT_DISTINCT'
  | 'ATTR'
  | 'MEDIAN'
  | 'STDDEV_POP'
  | 'STDDEV_SAMP'
  | 'VAR_POP'
  | 'VAR_SAMP'
  | 'LIST'
  | 'LIST_DISTINCT'
  | 'LAST'
  | 'FIRST';

export type DimensionAggregator =
  | { _enum: 'COUNT' }
  | { _enum: 'COUNT_DISTINCT' }
  | { _enum: 'MAX' }
  | { _enum: 'MIN' }
  | { _enum: 'ATTR' }
  | { _enum: 'FIRST_MEMBER' }
  | { _enum: 'LAST_MEMBER' }
  | {
      _enum: 'SUMMARY';
      zeroMessage: string;
      limit: number;
      summary: string;
      summaryAlways?: boolean;
    };

export type SubTotal = 'HIDDEN' | 'SHOW' | 'HIERARCHY_SHOW';

export type BinaryOperator =
  | 'Equals'
  | 'NotEquals'
  | 'In'
  | 'NotIn'
  | 'Like'
  | 'StartsWith'
  | 'EndsWith'
  | 'Contains'
  | 'GreaterThan'
  | 'GreaterThanOrEqual'
  | 'LessThan'
  | 'LessThanOrEqual'
  | 'NotLike'
  | 'NotLikeStart'
  | 'NotLikeEnd';

export type FilterLiteral =
  | boolean
  | number
  | string
  | number[]
  | string[]
  | boolean[]
  | null;

export type MeasureContext = 'InGlobal' | 'InGroup';

export type Filter =
  | { _enum: 'ByValue'; operator: BinaryOperator; value: FilterLiteral }
  | { _enum: 'ByLevel'; level: string; operator: BinaryOperator; value: FilterLiteral }
  | {
      _enum: 'ByMeasure';
      measure: string;
      measureContext: MeasureContext;
      operator: BinaryOperator;
      value: FilterLiteral;
    }
  | { _enum: 'And'; left: Filter; right: Filter }
  | { _enum: 'Or'; left: Filter; right: Filter }
  | { _enum: 'Not'; expr: Filter }
  /** 把无关维度的 filter 替换为 1=1 / 0=1 占位（后端用） */
  | {
      _enum: 'NoneFilter';
      value: FilterLiteral;
      operator?: BinaryOperator;
      value2?: FilterLiteral;
    };

export interface FieldFilter {
  _enum: 'FieldFilter';
  field: string;
  filter: Filter;
}

export interface TupleFilter {
  _enum: 'TupleFilter';
  filter: Filter;
}

export type SortDirection = 'ASC' | 'DESC' | 'BASC' | 'BDESC';

export type MeasureSortBy =
  | { _enum: 'ByMeasure'; name: string; sortField?: string | null }
  | { _enum: 'ByMdxExpression'; expr: string[] }
  | { _enum: 'DimensionAttr'; sortField: string; dimension: string }
  | { _enum: 'Customize'; sortField: string; customCaption: string[] }
  | {
      _enum: 'SortDimensionByMeasure';
      name: string;
      sortField: string;
      includePreDimension: boolean;
    };

/** P5+ DimensionSort 的 sortBy 字段 — 维度排序方式联合(后端 schema) */
export type DimensionSortBy =
  | { _enum: 'ByCaption' }
  | { _enum: 'ByMeasure'; measure: string; context: MeasureContext }
  | { _enum: 'ByCustomCaption'; customCaption: string[] };

export type FieldSort =
  | { _enum: 'MeasureSortEx'; measure: MeasureSortBy; direction: SortDirection }
  | { _enum: 'DimensionSortEx'; dimension: string; direction: SortDirection }
  | {
      _enum: 'MeasureSort';
      measure: string;
      direction: SortDirection;
      priority?: number;
    }
  | {
      _enum: 'DimensionSort';
      dimension: string;
      direction: SortDirection;
      sortBy?: DimensionSortBy | null;
      priority?: number;
    };

export type FieldOrNameSet =
  | { _enum: 'Field'; name: string }
  | { _enum: 'NameSet'; name: string };

/**
 * quickCalc — 后端约定:
 *
 *  ## 简单形式(裸字符串):无参数的 quickCalc 直接用 string,**不要**包成 `{_enum: 'X'}`!
 *  ```json
 *  "quickCalc": "GroupRankDescending"      ✓ 工作
 *  "quickCalc": {"_enum":"GroupRankDescending"}   ✗ 后端 422 或 echo 转译错路径
 *  ```
 *  2026-05-16 实测:简单形式用对象包装会被后端转译成 DataDimensionPercent/Rank
 *  且 fields:[] 是空的,quickCalc 实际不计算 — 数据返回原值。
 *
 *  ## 带参数形式(对象):time intelligence + 显式 axis 的用 `{_enum, ...params}`
 *  ```json
 *  "quickCalc": {"_enum":"SamePeriodValue","dateDimension":"X","dateLevel":"Y","offset":1}
 *  ```
 */
export type QuickCalculation =
  // ─── 简单形式 — 用裸字符串,实测在 backend pivot 上 work ✓
  | 'GlobalPercent'
  | 'GroupPercent'
  | 'GlobalRankAscending'
  | 'GlobalRankDescending'
  | 'GroupRankAscending'
  | 'GroupRankDescending'
  // ─── 简单形式 — schema 列了但实测后端 *不工作*(echo 转译路径有 bug):
  //   TotalPercent / RowGlobalPercent / ColumnGlobalPercent
  //   RowGroupPercent + basic / ColumnGroupPercent + basic
  //   RowGroupRank/RowGlobalRank/ColumnGroupRank/ColumnGlobalRank/TotalRank + sort
  // 这些类型字面值不在 union 里,P1_QUICK_CALCS 也不暴露,等后端修复
  // ─── 带参数形式(time intelligence 等)— 用对象
  | { _enum: 'CumulativeValue'; dateDimension: string; dateLevel: string; offset: number }
  // 通用扩展位 — P2 时间智能(SamePeriodValue / PrevPeriodValue 等)走这条
  | { _enum: string; [key: string]: unknown };

export type QueryField =
  | {
      _enum: 'DimensionField';
      name: string;
      dimension: string;
      level?: string | null;
      aggregator?: DimensionAggregator | null;
      dataFormat?: string | null;
      showCalcMembers?: boolean;
      showEmptyMembers?: boolean;
      subTotal?: SubTotal;
      showAsToolTip?: boolean;
      hide?: boolean;
      extensions?: Record<string, unknown> | null;
    }
  | {
      _enum: 'MeasureField';
      name: string;
      measure: string;
      aggregator?: Aggregator | null;
      dataFormat?: string | null;
      quickCalc?: QuickCalculation | null;
      hide?: boolean;
      extensions?: Record<string, unknown> | null;
    };

export interface PageSettings {
  compressEmptyRows?: boolean;
  compressEmptyColumns?: boolean;
  rowPageNo?: number;
  rowPageSize?: number;
  columnPageNo?: number;
  columnPageSize?: number;
  showGrandTotal?: boolean;
  subTotalAtEnd?: boolean;
  mergeNamedSet?: boolean;
  isCrossTable?: boolean;
  totalAtEnd?: string;
  factViewNames?: string[];
  isPreviewView?: boolean;
  useFormat?: boolean;
  useDataType?: boolean;
  useTransform?: boolean;
  handleSpecial?: boolean;
  isAsyncQueryColumnHeader?: boolean;
}

/** P0 不实做 customElements，仅占位类型 */
export type CustomElement =
  | { _enum: 'CustomColumn'; column: unknown; viewName: string }
  | { _enum: 'CustomDimension'; dimension: unknown; levelBindings: unknown[] }
  | { _enum: 'CustomMeasure'; measure: unknown; measureBinding: unknown }
  | { _enum: 'CustomCalcMeasure'; measure: unknown }
  | { _enum: 'CustomNamedSet'; namedSet: unknown }
  | { _enum: 'CustomCalcMember'; calcMember: unknown }
  | { _enum: 'CustomRelation'; relation: unknown };

export interface Query {
  modelId: string;
  queryType: QueryType;
  rows: Array<string | FieldOrNameSet>;
  columns: Array<string | FieldOrNameSet>;
  fields: QueryField[];
  filters: Array<FieldFilter | TupleFilter>;
  dimensionFilter?: { filter: Filter } | null;
  measureFilters: TupleFilter[];
  rowSorts: FieldSort[];
  columnSorts: FieldSort[];
  pageSettings: PageSettings;
  customElements: CustomElement[];
  engineType?: EngineType | null;
  cacheType?: CacheType | null;
  exportType?: ExportType | null;
}
