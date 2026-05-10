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
      sortBy?: unknown | null;
      priority?: number;
    };

export type FieldOrNameSet =
  | { _enum: 'Field'; name: string }
  | { _enum: 'NameSet'; name: string };

/** quickCalc 50+ 种枚举的简化建模：P0 不实做，P1+ 按需扩展 */
export type QuickCalculation =
  | { _enum: 'GlobalPercent' }
  | { _enum: 'GroupPercent' }
  | { _enum: 'TotalPercent' }
  | { _enum: 'ColumnGlobalPercent' }
  | { _enum: 'RowGlobalPercent' }
  | { _enum: 'CumulativeValue' }
  | { _enum: 'GlobalRankAscending' }
  | { _enum: 'GlobalRankDescending' }
  // P2 起加时间智能等其他
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
