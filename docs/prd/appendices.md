# 附录

> 工程实现的参考样例。完整 ViewConfig schema 以 [2-architecture.md](2-architecture.md) 第 1.2 节锁定的字段命名为准，本附录的样例必须与之严格一致。

---

## 附录 A：场景 B 的 ViewConfig 示例

完整反映 P0 默认视图（行：发货区域 hierarchy 默认展开"江苏"；值：销售额；按销售额降序）。

```json
{
  "rows": [
    {
      "fieldName": "custom1624587732438",
      "type": "Hierarchy",
      "expandedMembers": [
        ["江苏"]
      ]
    }
  ],
  "columns": [],
  "values": [
    {
      "measureName": "销售额_1624531356707",
      "aggregator": null,
      "quickCalc": null
    }
  ],
  "filters": [],
  "rowSorts": [
    {
      "type": "ByMeasure",
      "measureName": "销售额_1624531356707",
      "direction": "DESC"
    }
  ],
  "columnSorts": [],
  "pageState": {
    "rowPageNo": 1,
    "rowPageSize": 50,
    "columnPageNo": 1,
    "columnPageSize": 50
  },
  "customFields": [],
  "extensions": null
}
```

---

## 附录 B：场景 B 的 Query 输出示例

把附录 A 的 ViewConfig 经 QueryBuilder 翻译后的 query。

```json
{
  "modelId": "Iff808081017e71197119e7d2017e7124d5b70006",
  "queryType": "PivotQuery",
  "rows": ["custom1624587732438"],
  "columns": [],
  "fields": [
    {
      "_enum": "DimensionField",
      "name": "custom1624587732438",
      "dimension": "custom1624587732438",
      "subTotal": "HIERARCHY_SHOW"
    },
    {
      "_enum": "MeasureField",
      "name": "销售额_1624531356707",
      "measure": "销售额_1624531356707"
    }
  ],
  "filters": [
    {
      "_enum": "FieldFilter",
      "field": "ShipProvince2",
      "filter": { "_enum": "ByValue", "operator": "In", "value": ["江苏"] }
    }
  ],
  "measureFilters": [],
  "rowSorts": [
    {
      "_enum": "MeasureSortEx",
      "measure": {
        "_enum": "ByMeasure",
        "name": "销售额_1624531356707"
      },
      "direction": "DESC"
    }
  ],
  "columnSorts": [],
  "pageSettings": {
    "compressEmptyRows": true,
    "compressEmptyColumns": false,
    "rowPageNo": 1,
    "rowPageSize": 50,
    "columnPageNo": 1,
    "columnPageSize": 50,
    "showGrandTotal": true,
    "subTotalAtEnd": true,
    "isCrossTable": true,
    "totalAtEnd": "true,true",
    "useFormat": true,
    "useDataType": true,
    "useTransform": true,
    "handleSpecial": true,
    "isAsyncQueryColumnHeader": false
  },
  "engineType": "MDX",
  "customElements": []
}
```

⚠️ filters 中追加"江苏"的 In 筛选用于实现 hierarchy 部分展开 — 这部分待和后端确认实际工作机制（见 [phase-p0.md](phase-p0.md) 第 3.1 节）。

---

## 附录 C：字段表达式语法 BNF（P2）

⚠️ P2 仅"计算度量"模式。所有样例均为"计算度量"模式。"计算字段"模式延 P3 评估。

```bnf
expression  ::= term (("+"|"-") term)*
term        ::= factor (("*"|"/") factor)*
factor      ::= number
              | field_ref
              | aggregate
              | "(" expression ")"
              | "-" factor

field_ref   ::= "[" identifier "]"
aggregate   ::= ("SUM"|"AVG"|"COUNT"|"MAX"|"MIN") "(" field_ref ")"
number      ::= [0-9]+ ("." [0-9]+)?
identifier  ::= [一-龥a-zA-Z_][一-龥a-zA-Z0-9_]*
```

### 典型表达式样例（全部为"计算度量"模式）

| 业务意图 | 表达式 |
|---|---|
| 利润 | `[销售额] - [成本]` |
| 利润率 | `([销售额] - [成本]) / [销售额]` |
| 客单价 | `[销售额] / [订单量]` |
| 单位换算（万元） | `[销售额] / 10000` |
| 显式聚合控制 | `SUM([销售额]) - SUM([成本])` |

### 反例（必须拒绝，工程必须有对应单测）

| 表达式 | 拒绝原因 |
|---|---|
| `IF([销售额] > 100, 1, 0)` | 不支持条件表达式 |
| `[销售额] + [产品名]` | 类型不匹配（数值 + 字符串） |
| `CONCAT([姓], [名])` | 不支持字符串函数 |
| `SUM([不存在的字段])` | 字段引用校验失败 |
| `[销售额] +` | 语法错误 |
| `[折扣后单价] = [单价] * (1 - [折扣])` | 行级表达式（"计算字段"模式），P2 不开放 |

---

## 附录 D：维度分组示例（P2）

> ## ⚠️ 后端 schema 待确认
>
> 本附录中所有"翻译为后端 customElements"代码块里的 `EnumGroupColumn` / `RangeGroupColumn` 字段（如 `baseColumn` / `groups` / `ranges` / `otherHandling` / `minInclusive` / `maxExclusive` 等）**均为推测**。Smartbi `query-schema.json` 中只有 `EnumGroupColumn` / `RangeGroupColumn` / `TimeLevelColumn` 三个 enum 名，未展开 `ColumnDef` 子类型的实际字段。
>
> **P2 启动前必须和后端同事对齐这些 schema 的实际形态**（见 [1-product.md](1-product.md) 阻塞项 8）。本附录仅供讨论起点，不能作为实现依据。
>
> **字段名映射说明**：ViewConfig 内部用简短形式（`min`/`max`），后端 schema（推测）用明确形式（`minInclusive`/`maxExclusive`）。映射在 QueryBuilder 内部完成，工程实现时不要混用。

### D.1 枚举分组：把省份归为大区

**输入**

- 基准字段：`ShipProvince`（省份）
- 分组：
  - "沿海" → [广东, 福建, 浙江]
  - "长三角" → [江苏, 上海]
  - "京津冀" → [北京, 天津, 河北]
- 未分组成员处理：归为"其他"组

**ViewConfig**（锁定字段命名）

```json
{
  "id": "ug_region_001",
  "name": "大区分组",
  "kind": "enum_group",
  "baseField": "ShipProvince",
  "groups": [
    { "label": "沿海", "members": ["广东", "福建", "浙江"] },
    { "label": "长三角", "members": ["江苏", "上海"] },
    { "label": "京津冀", "members": ["北京", "天津", "河北"] }
  ],
  "ungroupedHandling": "merge_as_other",
  "ungroupedLabel": "其他"
}
```

**翻译为后端 customElements**（⚠️ schema 推测）

```json
{
  "_enum": "CustomColumn",
  "viewName": "<inferred>",
  "column": {
    "name": "ug_region_001",
    "alias": "大区分组",
    "valueType": "STRING",
    "columnType": "STRING",
    "dataFormat": "<字符串-默认值>",
    "visible": true,
    "maskRules": "",
    "define": {
      "_enum": "EnumGroupColumn",
      "baseColumn": "ShipProvince",
      "groups": [
        { "label": "沿海", "values": ["广东", "福建", "浙江"] },
        { "label": "长三角", "values": ["江苏", "上海"] },
        { "label": "京津冀", "values": ["北京", "天津", "河北"] }
      ],
      "otherHandling": "MERGE",
      "otherLabel": "其他"
    }
  }
}
```

### D.2 范围分组：年龄分段

**输入**

- 基准字段：`Age`（数值类型）
- 区间：
  - `[-∞, 18)` → "未成年"
  - `[18, 60)` → "青壮年"
  - `[60, +∞)` → "老年"

**ViewConfig**（锁定字段命名 `min`/`max`）

```json
{
  "id": "ug_age_001",
  "name": "年龄段",
  "kind": "range_group",
  "baseField": "Age",
  "ranges": [
    { "min": null, "max": 18, "label": "未成年" },
    { "min": 18, "max": 60, "label": "青壮年" },
    { "min": 60, "max": null, "label": "老年" }
  ]
}
```

**翻译为后端 customElements**（⚠️ schema 推测，注意字段名变化为 `minInclusive`/`maxExclusive`）

```json
{
  "_enum": "CustomColumn",
  "column": {
    "name": "ug_age_001",
    "alias": "年龄段",
    "valueType": "STRING",
    "define": {
      "_enum": "RangeGroupColumn",
      "baseColumn": "Age",
      "ranges": [
        { "minInclusive": null, "maxExclusive": 18, "label": "未成年" },
        { "minInclusive": 18, "maxExclusive": 60, "label": "青壮年" },
        { "minInclusive": 60, "maxExclusive": null, "label": "老年" }
      ]
    }
  }
}
```

### D.3 计算度量：利润率

**输入**

- 字段名：`利润率`
- 类型：计算度量（P2 仅支持的模式）
- 表达式：`([销售额] - [成本]) / [销售额]`
- 数据格式：`百分比-保留一位小数`

**ViewConfig**

```json
{
  "id": "uf_profit_ratio",
  "name": "利润率",
  "kind": "calc_measure",
  "dataFormat": "百分比-保留一位小数",
  "expression": "([销售额] - [成本]) / [销售额]",
  "ast": {
    "op": "/",
    "left": { "op": "-", "left": { "ref": "销售额" }, "right": { "ref": "成本" } },
    "right": { "ref": "销售额" }
  }
}
```

**翻译为后端 customElements**

```json
{
  "_enum": "CustomCalcMeasure",
  "measure": {
    "name": "uf_profit_ratio",
    "alias": "利润率",
    "category": "user_defined",
    "dataType": "DOUBLE",
    "dataFormat": "百分比-保留一位小数",
    "maskRule": "",
    "desc": "用户自建：([销售额] - [成本]) / [销售额]",
    "expr": "([Measures].[销售额] - [Measures].[成本]) / [Measures].[销售额]"
  }
}
```
