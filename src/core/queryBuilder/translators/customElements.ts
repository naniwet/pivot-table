/**
 * translateCustomElements — 用户自建字段 → query.customElements (P2)
 *
 * 三种自建字段的翻译策略(2026-05-06 用户实测确认):
 *
 * 1. **calc_measure** → 1 个 `CustomCalcMeasure`
 *
 * 2. **enum_group / range_group** → **2 个** customElements:
 *    a) `CustomColumn` — 产生一个新列(承载 EnumGroupColumn/RangeGroupColumn 表达式)
 *       - viewName 字段是 **baseField 所在表的 name**(从 metadata 字段 fieldId 解析)
 *       - column.name = `${cf.id}_col`(独立 id 避免跟 dimension 冲突)
 *       - column.define = { _enum: 'EnumGroupColumn'/'RangeGroupColumn', ... 业务字段 }
 *    b) `CustomDimension` — 把这个 column 包装成维度,query.rows/columns 才能引用
 *       - dimension.name = cf.id(viewConfig.rows[].fieldName 是这个 id,所以 query.rows 引用对得上)
 *       - levelBindings[0].column = cf.id + '_col'(指向上面 CustomColumn)
 *
 *    query.rows / query.columns 引用的是 **CustomDimension 的 name(= cf.id)**,
 *    不是 CustomColumn.column.name。
 *
 * **后端 schema 联调注意**(PRD 阻塞项 8):
 *   - viewName 提取:从 fieldId 模式 `AUGMENTED_DATASET_*.{modelId}.Field-{view}-...` 拿第一段;
 *     联调如果后端期望真实表名而非数据库 schema 名,需要调整解析
 *   - EnumGroupColumn / RangeGroupColumn 的具体字段名 schema 未定义(只列了 _enum),
 *     这里按 PRD 描述构造 — 联调时可能小幅调整
 */

import type { CustomElement } from '../../../types/query.js';
import type { Metadata } from '../../../types/metadata.js';
import type { CustomField } from '../../../types/viewConfig.js';
import { astToMdx } from '../../expression/astToMdx.js';
import { astToCalcColumnExpr } from '../../expression/astToCalcColumnExpr.js';
import type { Expr } from '../../expression/parseExpression.js';
import { buildMetadataIndex } from '../../metadata/fieldIndex.js';

/**
 * 取 baseField 所在 view 的 name(数据库表名)。
 *
 * 2026-05-07 新接口起,用 fieldIndex.getViewName 精确反查(viewId → views[].name);
 * 找不到 → fallback 到 baseField 自身。
 */
function extractViewName(metadata: Metadata, baseField: string): string {
  const idx = buildMetadataIndex(metadata);
  return idx.getViewName(baseField) ?? baseField;
}

/**
 * 收集 AST 里所有 [field] 引用的 name(去重保序)。
 * calc_measure column 模式用 — 把这些 measure name 一次性 resolve 成物理列名。
 */
/**
 * dim_as_measure source 解析 — 把用户在字段树右键的 source(可能是 metadata 字段 / level /
 * measure 任一)→ 物理 view + 物理列名,给 measureBinding 用。
 *
 * 用户场景:右键"产品类型"(level)→ "作为度量(COUNT_DISTINCT)" → 创建 dim_as_measure
 * customField,sourceField='产品类型'。但 metadata.fields 里**不一定**有 '产品类型' —
 * 它通常在 metadata.levels[];同理度量在 metadata.measures[]。
 *
 * 解析顺序:
 *   1. metadata.fields 直接命中 → 用 field.name + viewId
 *   2. metadata.levels 命中 → refDataSetFieldId 反查物理 field;兜底 sqlColumnName / level.name
 *   3. metadata.measures 命中 → 同上
 *   4. 都找不到 → null(translator 跳过该 cf)
 */
function findPhysicalColumn(
  src: string,
  metadata: Metadata,
): { viewId: string; columnName: string } | null {
  // 1. 物理 field 直接命中
  const f = metadata.fields.find((ff) => ff.name === src);
  if (f && f.viewId) return { viewId: f.viewId, columnName: f.name };

  // 2. level — 解析 refDataSetFieldId 找底层物理列
  const lv = metadata.levels.find((l) => l.name === src);
  if (lv) {
    if (lv.refDataSetFieldId) {
      const fByRef = metadata.fields.find((ff) => ff.id === lv.refDataSetFieldId);
      if (fByRef && fByRef.viewId) {
        return { viewId: fByRef.viewId, columnName: fByRef.name };
      }
    }
    // 兜底:level 自身 sqlColumnName / name(后端可能能识别)
    if (lv.viewId) {
      return { viewId: lv.viewId, columnName: lv.sqlColumnName ?? lv.name };
    }
  }

  // 3. measure — 同 level 处理
  const m = metadata.measures.find((mm) => mm.name === src);
  if (m) {
    if (m.refDataSetFieldId) {
      const fByRef = metadata.fields.find((ff) => ff.id === m.refDataSetFieldId);
      if (fByRef && fByRef.viewId) {
        return { viewId: fByRef.viewId, columnName: fByRef.name };
      }
    }
    if (m.viewId) {
      return { viewId: m.viewId, columnName: m.aliasFromDb || m.name };
    }
  }

  return null;
}

function collectFieldRefs(ast: Expr): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function walk(node: Expr): void {
    switch (node.type) {
      case 'field':
        if (!seen.has(node.name)) {
          seen.add(node.name);
          out.push(node.name);
        }
        return;
      case 'binop':
        walk(node.left);
        walk(node.right);
        return;
      case 'unary':
        walk(node.expr);
        return;
      case 'agg':
        walk(node.arg);
        return;
      case 'num':
        return;
    }
  }
  walk(ast);
  return out;
}


export function translateCustomElements(
  customFields: CustomField[],
  metadata: Metadata,
): CustomElement[] {
  const out: CustomElement[] = [];
  for (const cf of customFields) {
    if (cf.kind === 'calc_measure') {
      // 2026-05-07 probe 实测(scripts/probe-calc-measure.ts):
      //   - measure.name = cf.id(query.columns 引用的就是 cf.id,后端按 name 在 customElements 里 lookup)
      //   - measure.alias = cf.name(用户给的显示名)
      //   - measure.expr = astToMdx(ast)(MDX 字符串,不是用户业务表达式;不是 ast 对象)
      //   - 必填:desc / category / dataType / dataFormat / maskRule
      // ast 缺失(老序列化)→ 跳过该 customElement(buildQuery 上游 validate 不变,
      //   后端会报 measure not found,提示用户重存一次)
      if (!cf.ast) continue;
      const expr = astToMdx(cf.ast as Expr);
      out.push({
        _enum: 'CustomCalcMeasure',
        measure: {
          name: cf.id,
          alias: cf.name,
          desc: '',
          category: 'Measures',
          dataType: 'DOUBLE',
          dataFormat: cf.dataFormat,
          maskRule: '',
          expr,
        },
      });
      continue;
    }

    if (cf.kind === 'calc_column') {
      // 行级计算列 — 跟 enum_group / range_group 同构:都是 CustomColumn + CustomDimension
      // 表达式引用物理列名(`[销售额]/[数量]`),后端 SQL 引擎做 row-level eval
      // 2026-05-07 probe(scripts/probe-calc-column.ts)实测:
      //   - CalcColumn.expr 接受 `[col_name]/[col_name]`(物理列名,直接对应 metadata.fields[].name)
      //   - 多个列必须同 view(无 SQL JOIN 上下文)
      // 翻译流程:
      //   1) 收集 ast 里所有引用的 column name(field.name 直接就是物理列)
      //   2) 每个 column → metadata.fields 找 viewId
      //   3) 校验所有 column 同 view
      //   4) 生成 dual customElements(等同 enum_group/range_group)
      if (!cf.ast) continue;
      const refs = collectFieldRefs(cf.ast as Expr);
      if (refs.length === 0) {
        // 纯字面量 — 没列引用,无法判定 view,跳过
        continue;
      }
      const refFields = refs.map((n) => metadata.fields.find((f) => f.name === n));
      if (refFields.some((f) => !f)) continue; // 有 column 找不到 → 跳过
      const viewIds = new Set(refFields.map((f) => f!.viewId));
      if (viewIds.size > 1) continue; // 跨 view → 跳过
      const viewId = [...viewIds][0]!;
      const view = metadata.views.find((v) => v.id === viewId);
      if (!view) continue;

      const colName = `${cf.id}_col`;
      // calc_column 的 ast.field.name 已经是物理列名,resolver 用 identity
      const expr = astToCalcColumnExpr(cf.ast as Expr, (name) => name);

      // 1) CustomColumn(define = CalcColumn) — 行级表达式列
      out.push({
        _enum: 'CustomColumn',
        viewName: view.name,
        column: {
          name: colName,
          alias: cf.name,
          desc: '',
          valueType: 'DOUBLE',
          columnType: 'DOUBLE',
          dataFormat: cf.dataFormat,
          visible: true,
          maskRules: '',
          define: { _enum: 'CalcColumn', expr },
        },
      } as unknown as CustomElement);

      // 2) CustomDimension — 跟 enum_group / range_group 同构,行/列轴引用 dimension.name
      // 想作度量用:走"维度转度量"独立机制(此 kind 不内置 measure 包装)
      out.push({
        _enum: 'CustomDimension',
        dimension: {
          name: cf.id, // ← query.rows/columns 引用这个 name
          alias: cf.name,
          desc: '',
          hasAll: true,
          levels: [
            {
              name: cf.id,
              alias: cf.name,
              desc: '',
              levelType: { _enum: 'GENERIC' },
              dataFormat: cf.dataFormat,
              valueType: 'DOUBLE',
              maskRule: '',
            },
          ],
        },
        levelBindings: [
          {
            dimension: cf.id,
            level: cf.id,
            view: view.name,
            column: colName,
            isCalc: false,
          },
        ],
      } as unknown as CustomElement);
      continue;
    }

    if (cf.kind === 'enum_group' || cf.kind === 'range_group') {
      const viewName = extractViewName(metadata, cf.baseField);
      const columnName = `${cf.id}_col`;

      // 1) CustomColumn:产生新列(EnumGroupColumn / RangeGroupColumn 是 column.define)
      //
      // 2026-05-07 后端 Scala 源码 + probe 实测全部确认(scripts/probe-edge-cases.ts):
      //   case class EnumGroup(name, values: List[Option[String]])
      //   case class RangeGroup(name, min: Option[String], max: Option[String], includeMin, includeMax)
      //   enum OtherGroup:
      //     case OriginalValue                                  ← BARE STRING "OriginalValue"
      //     case SpecificValue(value, prefix: Option[String])   ← { _enum: 'SpecificValue', value, prefix? }
      //   EnumGroupColumn(column, groups, defaultGroup)
      //   RangeGroupColumn(column, groups, defaultGroup)
      //
      // 实测注意点:
      //   - Scala 3 enum 0-arg case 用 BARE STRING 字面量(不是 { _enum: ... })
      //   - SpecificValue.prefix 非空时后端 SQL 拼接漏引号(probe 实证 SQL syntax error),
      //     **当前不发 prefix**(omit ≡ None);需要前缀场景等后端修
      //   - RangeGroup.min/max 必须 STRING(Scala Option[String]),null=None;数字字面量反序列化失败
      //   - RangeGroup includeMin/Max 4 种闭开组合都通过实测;前端默认 [min, max)
      //   - 单个 RangeGroup min=max=null(全集)在多区间下被 validateRanges 间接挡住
      const defaultGroup: unknown =
        cf.kind === 'enum_group' && cf.ungroupedHandling === 'merge_as_other'
          ? { _enum: 'SpecificValue', value: cf.ungroupedLabel ?? '其他' }
          : 'OriginalValue';

      const define =
        cf.kind === 'enum_group'
          ? {
              _enum: 'EnumGroupColumn' as const,
              column: cf.baseField,
              groups: cf.groups.map((g) => ({
                name: g.label,
                values: g.members,
              })),
              defaultGroup,
            }
          : {
              _enum: 'RangeGroupColumn' as const,
              column: cf.baseField,
              groups: cf.ranges.map((r) => ({
                name: r.label,
                // Scala Option[String]:None=null,Some(s)=string
                min: r.min !== null ? String(r.min) : null,
                max: r.max !== null ? String(r.max) : null,
                includeMin: true,  // viewConfig 业务约定 [min, max):min 闭、max 开
                includeMax: false,
              })),
              defaultGroup,
            };

      out.push({
        _enum: 'CustomColumn',
        viewName,
        column: {
          name: columnName,
          alias: cf.name,
          desc: '',
          valueType: 'STRING',
          columnType: 'STRING', // schema 写 oneOf [ValueType, null];实测要给 string,null 报错
          dataFormat: '',
          visible: true,
          maskRules: '',
          define,
        },
      });

      // 2) CustomDimension:把 column 包装成维度,query.rows/columns 才能引用
      // levelType:Smartbi 后端用 `_enum` 字段做多态判别。
      // 2026-05-07 probe 实测(scripts/probe-leveltype-real.ts):
      //   cellset 普通列 levelType = { _enum: 'GENERIC', type: '' };
      //   { _enum: 'LEVEL' } 反序列化失败(无该枚举);'GENERIC' 是普通维度的合法 _enum 值。
      out.push({
        _enum: 'CustomDimension',
        dimension: {
          name: cf.id, // ← query.rows/columns 引用这个 name
          alias: cf.name,
          desc: '',
          hasAll: true,
          levels: [
            {
              name: cf.id,
              alias: cf.name,
              desc: '',
              levelType: { _enum: 'GENERIC' },
              dataFormat: '',
              valueType: 'STRING',
              maskRule: '',
            },
          ],
        },
        levelBindings: [
          {
            dimension: cf.id,
            level: cf.id,
            view: viewName,
            column: columnName,
            isCalc: false,
          },
        ],
      });
      continue;
    }

    if (cf.kind === 'dim_as_measure') {
      // 维度转度量 — 右键菜单"转度量"产生:把已有 dim/列 + aggregator 包成 measure。
      // sourceField 可能指向 4 种 source:
      //   1) 另一 customField id(calc_column / enum_group / range_group)→ `${id}_col` 列
      //   2) metadata.fields 里的物理列名 → 该 field
      //   3) metadata.levels 里的 level 名(用户右键维度字段触发)→ refDataSetFieldId 反查
      //   4) metadata.measures 里的 measure 名(右键度量字段触发)→ 同上
      const src = cf.sourceField;
      let viewName: string | null = null;
      let columnName: string | null = null;

      // 情况 1:source 是另一 customField id
      const sourceCf = customFields.find((f) => f.id === src);
      if (sourceCf) {
        if (
          sourceCf.kind === 'calc_column' ||
          sourceCf.kind === 'enum_group' ||
          sourceCf.kind === 'range_group'
        ) {
          columnName = `${sourceCf.id}_col`;
          if (sourceCf.kind === 'calc_column') {
            if (!sourceCf.ast) continue;
            const refs = collectFieldRefs(sourceCf.ast as Expr);
            const fld = refs.map((n) => metadata.fields.find((f) => f.name === n)).find((f) => !!f);
            const vid = fld?.viewId;
            const v = vid ? metadata.views.find((vw) => vw.id === vid) : null;
            viewName = v?.name ?? null;
          } else {
            viewName = extractViewName(metadata, sourceCf.baseField);
          }
        }
      } else {
        // 情况 2-4:metadata 里的字段(physical / level / measure)— 走统一 resolver
        const physical = findPhysicalColumn(src, metadata);
        if (physical) {
          const v = metadata.views.find((vw) => vw.id === physical.viewId);
          if (v) {
            columnName = physical.columnName;
            viewName = v.name;
          }
        }
      }

      if (!viewName || !columnName) continue; // 找不到 source → 防御性跳过

      out.push({
        _enum: 'CustomMeasure',
        measure: {
          name: cf.id, // ← query.columns 引用 cf.id
          alias: cf.name,
          desc: '',
          category: 'Measures',
          dataType: 'DOUBLE',
          aggregator: cf.aggregator,
          dataFormat: cf.dataFormat,
          maskRule: '',
        },
        measureBinding: {
          measure: cf.id,
          view: viewName,
          column: columnName,
        },
      } as unknown as CustomElement);
      continue;
    }

    // 未知 kind → 静默跳过(防御)
  }
  return out;
}
