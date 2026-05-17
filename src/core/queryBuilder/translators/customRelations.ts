import type { Metadata } from '../../../types/metadata.js';
import type { CustomElement } from '../../../types/query.js';
import type { CustomRelationConfig } from '../../../types/viewConfig.js';

type RelationExpr =
  | {
      _enum: 'ColumnRef';
      view: string;
      column: string;
    }
  | {
      // 2026-05-17 backend probe 实测:字段名是 `op` 不是 `operator`;值用 SQL 风格 '='
      _enum: 'BinaryExpr';
      op: '=';
      left: RelationExpr;
      right: RelationExpr;
    }
  | {
      _enum: 'And';
      left: RelationExpr;
      right: RelationExpr;
    };

function findViewName(metadata: Metadata, viewId: string): string | null {
  return metadata.views.find((view) => view.id === viewId)?.name ?? null;
}

function findFieldColumn(
  metadata: Metadata,
  fieldIdOrName: string,
): { viewId: string; column: string } | null {
  const field = metadata.fields.find((item) => item.id === fieldIdOrName || item.name === fieldIdOrName);
  if (field?.viewId) {
    return { viewId: field.viewId, column: field.sqlColumnName || field.name };
  }

  const level = metadata.levels.find((item) => item.id === fieldIdOrName || item.name === fieldIdOrName);
  if (level?.viewId) {
    return { viewId: level.viewId, column: level.sqlColumnName || level.name };
  }

  const measure = metadata.measures.find((item) => item.id === fieldIdOrName || item.name === fieldIdOrName);
  if (measure?.viewId) {
    return { viewId: measure.viewId, column: measure.aliasFromDb || measure.name };
  }

  return null;
}

function combineAnd(exprs: RelationExpr[]): RelationExpr | null {
  if (exprs.length === 0) return null;
  if (exprs.length === 1) return exprs[0]!;
  return {
    _enum: 'And',
    left: exprs[0]!,
    right: combineAnd(exprs.slice(1))!,
  };
}

function buildCondition(
  relation: CustomRelationConfig,
  metadata: Metadata,
  leftViewName: string,
  rightViewName: string,
): RelationExpr | null {
  const exprs: RelationExpr[] = [];
  for (const condition of relation.conditions) {
    const leftField = findFieldColumn(metadata, condition.leftFieldId);
    const rightField = findFieldColumn(metadata, condition.rightFieldId);
    if (!leftField || !rightField) return null;
    if (leftField.viewId !== relation.leftViewId || rightField.viewId !== relation.rightViewId) {
      return null;
    }
    // 2026-05-17 backend probe 实测:
    //   - BinaryExpr 字段名是 `op`(不是 `operator`);schema 文档过期/不准
    //   - `op` 值用 SQL 风格 '='(不是 'EQUALS'/'Equals'/'Eq')
    //   错的字段名 → backend 拿 null operator → NPE(无具体错误)
    //   错的值 → "暂不支持的二元操作符:XXX"(可定位)
    exprs.push({
      _enum: 'BinaryExpr',
      op: '=',
      left: { _enum: 'ColumnRef', view: leftViewName, column: leftField.column },
      right: { _enum: 'ColumnRef', view: rightViewName, column: rightField.column },
    });
  }
  return combineAnd(exprs);
}

export function translateCustomRelations(
  relations: CustomRelationConfig[] | undefined,
  metadata: Metadata,
): CustomElement[] {
  const out: CustomElement[] = [];
  for (const relation of relations ?? []) {
    if (!relation.enabled) continue;
    const leftViewName = findViewName(metadata, relation.leftViewId);
    const rightViewName = findViewName(metadata, relation.rightViewId);
    if (!leftViewName || !rightViewName) continue;
    const condition = buildCondition(relation, metadata, leftViewName, rightViewName);
    if (!condition) continue;

    out.push({
      _enum: 'CustomRelation',
      relation: {
        left: leftViewName,
        right: rightViewName,
        leftCardinality: relation.leftCardinality,
        rightCardinality: relation.rightCardinality,
        direction: relation.direction,
        condition,
        isWeak: relation.isWeak ?? true,
        isFilter: relation.isFilter ?? false,
        extensions: {
          source: 'pivot-table',
          relationId: relation.id,
          relationName: relation.name,
        },
      },
    });
  }
  return out;
}
