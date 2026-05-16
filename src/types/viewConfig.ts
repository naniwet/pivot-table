/**
 * 前端 ViewConfig 类型 — 组件 ↔ 宿主交互的核心数据结构
 *
 * 锁定字段命名（参见 docs/prd/2-architecture.md 第 1.2 节）：
 * - 字段标识统一用 `fieldName`，禁止 `field`/`name`/`id`
 * - 度量标识统一用 `measureName`，禁止 `measure`/`metric`
 * - Hierarchy 当前轴深度统一用 `drillDepth`（[docs/adr-004-hierarchy-drill.md](../../docs/adr-004-hierarchy-drill.md) C2 策略）
 *   - 由 v0.0.1 的 `expandedMembers: string[][]` 替换；后者已废弃
 *
 * 修订原则：几乎不可逆（影响序列化兼容）。修改前必须 PR 评审 + 更新 docs/prd/2-architecture.md。
 */

import type {
  Aggregator,
  BinaryOperator,
  FilterLiteral,
  MeasureContext,
  QuickCalculation,
  SortDirection,
} from './query.js';

// re-export SortDirection 让 viewConfig 消费方有一致入口
export type { SortDirection };

// ===== 字段类型枚举 =====

export type RowColFieldType =
  | 'Hierarchy'
  | 'Dimension'
  | 'CalcGroup'
  | 'NamedSet'
  | 'EnumGroup'
  | 'RangeGroup'
  | 'MeasureGroupName';

export type ValueFieldType =
  | 'Measure'
  | 'CalcMeasure'
  | 'UserCalcMeasure'
  | 'MeasureGroupValue';

// ===== 行/列字段 =====

export interface RowField {
  fieldName: string;
  type: RowColFieldType;
  /**
   * Hierarchy 当前轴深度，仅 type=Hierarchy 时有意义。1=仅顶层 level；2=顶+次层；以此类推。
   * 缺省按 1 处理。
   * Drill ▶ 增 1，drill ▼ 减 1，每次 drill 都重发 query（[docs/adr-004-hierarchy-drill.md](../../docs/adr-004-hierarchy-drill.md) C2）。
   */
  drillDepth?: number;
  /**
   * P3: 该维度小计显示模式(对应 query.fields[].DimensionField.subTotal)
   *   - undefined / 'HIDDEN':不显示小计(默认)
   *   - 'SHOW':每个值末尾一行小计
   *   - 'HIERARCHY_SHOW':层级嵌套显示小计(hierarchy 多 level 用)
   *
   * 注:仅当此值非空时,buildQuery 才会发 DimensionField 控制后端;否则后端默认 HIDDEN
   */
  subTotal?: 'SHOW' | 'HIERARCHY_SHOW' | 'HIDDEN';
}

export type ColumnField = RowField;

// ===== 数值字段 =====

export interface ValueField {
  measureName: string;
  /** 显式覆盖 metadata 默认聚合方式；null 表示使用默认 */
  aggregator: Aggregator | null;
  /** 快速计算（P1+） */
  quickCalc: QuickCalculation | null;
}

// ===== 筛选 — 前端嵌套树结构 =====

export type ClientFilter =
  | { kind: 'leaf'; field: string; operator: BinaryOperator; value: FilterLiteral }
  | { kind: 'group'; op: 'And' | 'Or'; children: ClientFilter[] };

// ===== 度量筛选（P1.0：top-N / GreaterThan/LessThan/Equals 等）=====

/**
 * 度量筛选 — 与维度筛选(ClientFilter)分开存放：
 *   - schema 不一样：query.measureFilters 用 TupleFilter + ByMeasure
 *   - UI 不一样：度量 filter 没有"成员选择器"，只有数值输入
 *
 * P1.0 仅支持单条件 leaf 形式（无嵌套）。Between 暂未做（schema 无原生 enum；
 * 用户可以拖同一度量两次分别配 >= 和 <= 达到等价效果）。
 */
/**
 * 度量 filter operator — BinaryOperator + 'Between' 伪 operator
 *
 * 'Between' 在 schema 层无原生 enum，translateMeasureFilters 翻译时拆为
 * `TupleFilter { filter: And(GTE, LTE) }`。
 * 'Between' 时 value 必须是 [min, max] 两元素数组。
 */
export type MeasureFilterOperator = BinaryOperator | 'Between';

/**
 * 度量过滤 leaf 节点 — 跟 P1.0 形态保持一致,kind 字段可选(向后兼容旧序列化)
 */
export interface MeasureFilter {
  /** 缺省视为 leaf;P3 起 union 引入,旧数据不需要迁移 */
  kind?: 'leaf';
  measureName: string;
  operator: MeasureFilterOperator;
  value: FilterLiteral;
  /** P1.0 默认 InGlobal；P3 才用 InGroup */
  context?: MeasureContext;
}

/**
 * 度量过滤 group 节点 — P3 引入,跨度量 AND/OR 嵌套
 */
export interface MeasureFilterGroup {
  kind: 'group';
  op: 'And' | 'Or';
  children: ClientMeasureFilter[];
}

/**
 * 度量过滤树节点(对称 ClientFilter)
 *   - leaf:单度量条件
 *   - group:And/Or 嵌套(可跨度量)
 *
 * ViewConfig.measureFilters: ClientMeasureFilter[] — 顶层多棵,数组级 AND
 * (跟维度过滤的 ClientFilter union 镜像)
 */
export type ClientMeasureFilter = MeasureFilter | MeasureFilterGroup;

// ===== 排序 =====

/**
 * Sort direction（复用 query.SortDirection）：
 *   - ASC / DESC：全局升/降序（场景 B 默认）
 *   - BASC / BDESC：分组内升/降序（P2，分层 hierarchy 内部排序，跨组不打乱）
 */
export type Sort =
  | { type: 'ByMeasure'; measureName: string; direction: SortDirection }
  | { type: 'ByDimension'; fieldName: string; direction: SortDirection }
  /**
   * P5+ 自定义排序顺序 — 用户为某个维度指定成员的显示顺序(JD/小米/华为/苹果)。
   * customCaption 数组里的顺序就是 ASC 时的显示顺序;DESC 反序。
   * 后端用 DimensionSort + sortBy: ByCustomCaption。
   * 工具函数:setCustomSortOrder / removeCustomSortOrder(`core/viewConfig/cycleRowSort.ts`)
   */
  | { type: 'ByCustomCaption'; fieldName: string; direction: SortDirection; customCaption: string[] };

// ===== 分页状态 =====

export interface PageState {
  rowPageNo: number;
  rowPageSize: number;
  columnPageNo: number;
  columnPageSize: number;
  /**
   * P2: 列轴异步加载 — true 时后端先返回行数据，列头流式补齐。
   * 场景 E（月份/产品多时）能显著缩短首屏时间；普通场景维持 false 避免引入额外协议。
   * 默认 false。
   */
  asyncColumnHeader?: boolean;
  /**
   * P3: 全表总计开关(query.pageSettings.showGrandTotal)。默认 true。
   *
   * 语义:跨**所有**维度做汇总,后端在表末额外返回 1 行(行轴)+ 1 列(列轴)合计。
   * 跟 chip 菜单"合计/小计"无关 — 后者是 per-field subTotal(field-level)。
   * UI 入口:**SettingsModal**(P5+ 起统一在设置面板,chip 菜单不暴露此项)。
   */
  showGrandTotal?: boolean;
  /**
   * P3: 小计行位置(query.pageSettings.subTotalAtEnd)。默认 true(每组末尾)。
   *
   * 注意:这是**位置**开关,不是显示开关。是否显示某 dim 的小计 → RowField.subTotal。
   * UI 入口:SettingsModal。
   */
  subTotalAtEnd?: boolean;
  /**
   * P3 设置面板:压缩空行 — 把全为空的行删掉(query.pageSettings.compressEmptyRows)。默认 true
   */
  compressEmptyRows?: boolean;
  /**
   * P3 设置面板:压缩空列 — 把全为空的列删掉(query.pageSettings.compressEmptyColumns)。默认 true
   * ⚠ 设 false 时后端要求 engineType: 'MDX',否则 406(probe 实测)
   */
  compressEmptyColumns?: boolean;
  /**
   * P3 设置面板:冻结列头(thead sticky-top)。默认 true
   * 关掉时滚动会让表头滚走(打印场景)
   */
  freezeHeader?: boolean;
  /**
   * P3 设置面板:冻结行头列(左侧维度列 sticky-left)。默认 true
   */
  freezeRowHeader?: boolean;
  /**
   * P3 设置面板:分页器是否显示"共 N 条"总行数。默认 true
   */
  showTotalRowCount?: boolean;
  /**
   * P5+ 导出全量行数上限(场景 4)— Excel/CSV 全量导出时,临时把 rowPageSize 调到此值
   * 重发 query 拉一次"大页",再写文件。默认 10000;场景上限可调到 50000(行数大于此值的表
   * 应该走后端 stream endpoint,纯前端会爆内存)。
   *
   * 注意:这只影响"导出"动作,不影响日常浏览的 pageSize(viewConfig.pageState.rowPageSize)。
   */
  exportMaxRows?: number;
  /**
   * P5+ 行翻页 UI 模式 — 影响表格底部分页栏是否渲染:
   *   - 'paged'(默认):渲染传统分页器(上一页/页码/下一页/页大小/总数)
   *   - 'scroll':**不渲染**底部分页栏 — 用户在滚动条里浏览当前页所有行(典型场景:
   *     pageSize 设大一点,例如 500/1000,一次拉全),省视觉空间。
   *
   * 注意:这只是 UI 层面的开关,底层仍走 page 协议;后端 pageSize 仍生效。
   * 真正"触底自动加载下一页"的无限滚动 = 后续单独 feature(需 useViewConfig 累积态)。
   */
  paginationMode?: 'paged' | 'scroll';
  /**
   * P3+ 显示模式:'table'(默认 透视表) / 'chart'(图表) / 'tree'(树状,P5 lazy-load)
   * 同 viewConfig 持久化,view 保存自动带上
   *
   * tree 模式:行 dim 转 OLAP 钻取树,展开/折叠各起独立 query,branch cache 命中秒出。
   * 走完全独立的 pipeline:buildBranchQuery + useTreeQueries + TreeRenderer。
   */
  displayMode?: 'table' | 'chart' | 'tree';
  /**
   * P3+ 图表类型:'bar' / 'line' / 'pie';仅 displayMode='chart' 时生效。默认 'bar'
   */
  chartType?: 'bar' | 'line' | 'pie';
  /**
   * P3+ 空值显示文本 — cell.isEmpty 时渲染什么。
   *   - undefined / 空串:渲染空 cell(默认,跟旧行为一致)
   *   - '-' / '0' / '无数据' / '——' 等:用户自定义占位符
   * 仅前端渲染层用,不发后端
   */
  emptyValueText?: string;
  /**
   * P3+ 行表头模式:
   *   - 'merge'(默认):同 prefix 行用 rowSpan 合并(当前传统表格)
   *   - 'tree':每个层级独立一行,parent 行可展开/折叠下级
   */
  rowHeaderMode?: 'merge' | 'tree';
  /**
   * P3+ 列表头模式:同 rowHeaderMode 镜像
   */
  columnHeaderMode?: 'merge' | 'tree';
  /**
   * P5+ 条件格式化规则数组(per-measure scope)。
   *   - 每条 rule 绑定一个 measure(measureName 或 customField id)
   *   - threshold 类:多条件按 conditions 数组顺序匹配,第一命中生效
   *   - dataBar 类:cell 内画横向 bar,长度 = (value-min)/(max-min);range='auto' 用当前列实际 min/max
   *   - 同 measure 可叠多 rule(threshold 决定颜色 + dataBar 决定长度,各管各)
   *
   * 缺省 / undefined → 不应用任何条件格式化
   */
  conditionalFormats?: ConditionalFormatRule[];
}

// ===== 条件格式化(P5+) =====

/** threshold 单条件:operator + value(between 用 [min,max]) + 命中后样式 */
export interface ConditionalFormatThresholdCondition {
  op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';
  value: number | [number, number];
  style: {
    /** 背景色,CSS color 字符串 — 不指定不改背景 */
    bg?: string;
    /** 文字色 */
    fg?: string;
    /** 加粗 */
    bold?: boolean;
  };
}

/**
 * 条件格式化规则(union by kind)。
 *
 * 设计:
 *   - measure 字段绑定:
 *       - pivot 模式 → measureName(metadata 度量)或 customField id
 *       - adhoc 模式 → metadata.fields[].name(物理字段名;仅数值类 valueType 适合)
 *     evaluator 内部只做字符串匹配,不区分。同一字符串在两种模式语义不同 — 用 mode 隔离。
 *   - mode 字段(P5+ 引入)用于在 pivot/adhoc 视图间隔离规则:
 *       - 'pivot' / undefined(向后兼容旧序列化默认)→ 仅在透视模式生效
 *       - 'adhoc' → 仅在即席模式生效
 *     渲染前 renderer 按 mode 过滤,evaluator 不感知 mode。
 *   - threshold 多条件按数组顺序,第一个命中的 style 生效(类似 CSS first-match)。
 *   - dataBar 跟 threshold 不冲突 — 同 measure 可同时挂 dataBar(画 bar)+ threshold(着色)。
 *   - topN/bottomN 高亮当前页内该 measure 前/后 N 名 cell:
 *       范围 = 当前页(跟 dataBar range='auto' 一致,跨页不一致 — README 已说明);
 *       样式 = 单色(统一,不做渐变);
 *       并列名次:严格按 N 截断(>= 第 N 名 value 即入选,可能多于 N 行);
 *       跟 threshold 同时挂时:threshold 先匹配,没命中再看 topN/bottomN。
 */
export type ConditionalFormatMode = 'pivot' | 'adhoc';

/**
 * 作用范围:
 *   - 'cell'(默认,向后兼容旧 rule 数据)— 只装饰 trigger 列那一个 cell
 *   - 'row' — 命中条件 → 整行所有 cell 都套样式(含行表头)
 * dataBar 没有 scope — bar 是 cell 内部的进度条,无"整行"语义
 */
export type ConditionalFormatScope = 'cell' | 'row';

export type ConditionalFormatRule =
  | {
      id: string;
      /** P5+:作用模式;undefined 视为 'pivot'(向后兼容旧 rule 数据) */
      mode?: ConditionalFormatMode;
      /** P5+:作用范围;undefined 视为 'cell'(向后兼容旧 rule 数据) */
      scope?: ConditionalFormatScope;
      measure: string;
      kind: 'threshold';
      conditions: ConditionalFormatThresholdCondition[];
    }
  | {
      id: string;
      mode?: ConditionalFormatMode;
      measure: string;
      kind: 'dataBar';
      /** bar 颜色,CSS color */
      color: string;
      /**
       * range:
       *   - 'auto':用当前查询返回的该列实际 min/max(常用)
       *   - { min, max }:固定值(用于跨查询保持视觉一致,如百分比 [0,1])
       */
      range: 'auto' | { min: number; max: number };
    }
  | {
      id: string;
      mode?: ConditionalFormatMode;
      scope?: ConditionalFormatScope;
      measure: string;
      kind: 'topN' | 'bottomN';
      /** 取前/后 N 名;N>=1,UI 默认 3 */
      n: number;
      /** 命中后样式(同 threshold 的 style)— 至少给一个 bg/fg/bold,否则视觉无效 */
      style: {
        bg?: string;
        fg?: string;
        bold?: boolean;
      };
    };

/**
 * 按当前 mode 过滤 rules — 渲染层用。
 * rule.mode === undefined 视为 'pivot'(向后兼容旧序列化)。
 */
export function filterConditionalFormatsByMode(
  rules: ConditionalFormatRule[],
  mode: ConditionalFormatMode,
): ConditionalFormatRule[] {
  return rules.filter((r) => (r.mode ?? 'pivot') === mode);
}

// ===== 用户自建字段（P2 引入；P0 必须支持空数组序列化） =====

/**
 * 计算度量(MDX 度量级)— 表达式跑在已聚合的 measure 之上。
 * 语义 = `SUM(a)/SUM(b)` 等(先聚合再算),不可再被外层聚合。
 *
 * - 表达式引用 **measure name**(`[销售额_m]`)
 * - 后端 1 个 `CustomCalcMeasure`(expr=astToMdx(ast))
 * - 适合:`比率 = 销售额/销售成本`(本身是聚合值的比)
 *
 * 想做 row-level 然后再聚合(`SUM(a/b)` / `AVG(a/b)`)→ 用 `CustomCalcColumnField`(kind='calc_column')。
 */
export interface CustomCalcMeasureField {
  id: string;
  name: string;
  kind: 'calc_measure';
  dataFormat: string;
  expression: string;
  /** 解析后的 AST，P2 才用真实值；P0 序列化时是 null */
  ast: unknown | null;
}

/**
 * 计算列(SQL 行级)— 表达式跑在物理列上,每行算一次,**作维度使用**。
 * 跟 `enum_group` / `range_group` 同构:都是 `CustomColumn` + `CustomDimension` 双元素。
 *
 * - 表达式引用 **物理列名**(`[销售额]/[数量]`,**非 measure name**!)
 * - 后端 2 个元素:
 *   1) `CustomColumn(define=CalcColumn(expr))` — 行级表达式列
 *   2) `CustomDimension` — 把列包装成维度(query.rows/columns 引用)
 * - 拖到行/列区:作分组维度用(同 EnumGroup/RangeGroup 的 drop rules)
 * - 想做"均价再求和/平均"等用法:走 **维度转度量** 机制(独立于此 kind 的另一个路径,
 *   通过 DimensionField/MeasureField 桥接,后续单独实现)
 * - **限制**:expr 引用的所有列必须在 SAME view(无 SQL JOIN 上下文)
 *
 * 2026-05-07 probe(scripts/probe-calc-column.ts)实测:
 *   - `[col_name]/[col_name]` 形态后端接受 ✓
 *   - measure name 形态 `[销售成本_m]/[销售额_m]` 报"列不存在"(那是 calc_measure 的事)
 */
export interface CustomCalcColumnField {
  id: string;
  name: string;
  kind: 'calc_column';
  dataFormat: string;
  /** 用户输入的原表达式字符串(物理列名形式 `[col_name]`) */
  expression: string;
  /** 解析后的 AST(field.name = 物理列名);老序列化可能 null,翻译时跳过 */
  ast: unknown | null;
}

export interface CustomEnumGroupField {
  id: string;
  name: string;
  kind: 'enum_group';
  baseField: string;
  groups: Array<{ label: string; members: string[] }>;
  ungroupedHandling: 'show_individually' | 'merge_as_other';
  ungroupedLabel?: string;
}

export interface CustomRangeGroupField {
  id: string;
  name: string;
  kind: 'range_group';
  baseField: string;
  ranges: Array<{ min: number | null; max: number | null; label: string }>;
}

/**
 * 维度转度量(右键菜单"转度量"产生)— 把已有维度/列包装成 measure。
 *
 * 跟 calc_measure / calc_column 的区别:
 *   - calc_measure(MDX 度量级):用户写表达式,引用其他 measure
 *   - calc_column(SQL 行级列):用户写表达式,引用物理列;产出维度
 *   - **dim_as_measure**:**不写表达式**,直接对已有 dim/列加 aggregator(SUM/AVG/...)
 *
 * sourceField 可以指向:
 *   - **物理列名**(metadata.fields[].name)— 普通字段转度量,如 SUM([订单ID])
 *   - **另一 customField 的 id**(calc_column / enum_group / range_group)
 *     — 此时 backend 引用的是该 customField 翻译产生的 `${id}_col` 列。
 *
 * 后端翻译:1 个 `CustomMeasure { measure, measureBinding: { measure, view, column } }`。
 *
 * 业务场景:
 *   - 场景 6"对均价再求和/平均":先建 calc_column"均价",再 dim_as_measure 包成 SUM(均价)
 *   - 普通 dim 转度量:右键"销售员姓名" → 转度量(COUNT_DISTINCT) → 唯一销售员数
 */
export interface CustomDimAsMeasureField {
  id: string;
  name: string;
  kind: 'dim_as_measure';
  /** 来源:物理列名 或 另一 customField 的 id(calc_column / enum_group / range_group) */
  sourceField: string;
  /** wrapper 度量的聚合方式 — SUM/AVG/MIN/MAX/COUNT/COUNT_DISTINCT 等 */
  aggregator: Aggregator;
  dataFormat: string;
}

export type CustomField =
  | CustomCalcMeasureField
  | CustomCalcColumnField
  | CustomEnumGroupField
  | CustomRangeGroupField
  | CustomDimAsMeasureField;

// ===== ViewConfig 顶层 =====

export interface ViewConfig {
  rows: RowField[];
  columns: ColumnField[];
  values: ValueField[];
  filters: ClientFilter[];
  /** 度量筛选(P1.0 起;P3 升级为树形支持跨度量 AND/OR)。空数组表示无 */
  measureFilters: ClientMeasureFilter[];
  rowSorts: Sort[];
  columnSorts: Sort[];
  pageState: PageState;
  /** P2 引入；P0/P1 必须能正确序列化为 [] */
  customFields: CustomField[];
  /**
   * P5+ 查询模式:
   *   - 'pivot'(默认):多维透视,用 PivotQuery,支持度量/聚合/快算/树状/图表
   *   - 'adhoc':即席明细,用 DetailQuery,SQL 直连无聚合,只查行字段
   *
   * 切到 'adhoc' 时:
   *   - column/value 字段被迁移到 row(因为 adhoc 只有 row + filter 两个区)
   *   - measureFilters / customFields(calc_measure)状态保留但 UI 灰显,buildAdhocQuery 忽略
   *   - rowSorts 中 BASC/BDESC 不支持 — buildAdhocQuery 自动降级到 ASC/DESC
   */
  queryMode?: 'pivot' | 'adhoc';
  /** 向后兼容扩展位 */
  extensions: Record<string, unknown> | null;
}
