import { describe, expect, it } from 'vitest';

import type { Metadata } from '../../../types/metadata.js';
import type { CustomRelationConfig } from '../../../types/viewConfig.js';

import { translateCustomRelations } from './customRelations.js';

const metadata: Metadata = {
  id: 'model',
  name: 'Model',
  alias: 'Model',
  desc: '',
  providerName: 'AUGMENTED',
  views: [
    {
      id: 'view-product',
      name: 'product',
      alias: '产品表',
      aliasFromDb: '产品表',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      type: 'BASIC_TABLE',
      storeType: 'DIRECT',
      define: {
        dbtype: 'MYSQL',
        dataSource: 'DS',
        catalog: null,
        schema: null,
        tableId: 'TAB.product',
        tableName: 'product',
      },
      fields: [],
      parameters: [],
      dataSource: '',
    },
    {
      id: 'view-sales',
      name: 'sales_fact',
      alias: '销售表',
      aliasFromDb: '销售表',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      type: 'BASIC_TABLE',
      storeType: 'DIRECT',
      define: {
        dbtype: 'MYSQL',
        dataSource: 'DS',
        catalog: null,
        schema: null,
        tableId: 'TAB.sales_fact',
        tableName: 'sales_fact',
      },
      fields: [],
      parameters: [],
      dataSource: '',
    },
  ],
  fields: [
    {
      id: 'field-product-id',
      name: 'product_id',
      alias: '产品ID',
      aliasFromDb: '产品ID',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      valueType: 'INTEGER',
      dataFormat: '<整型-默认值>',
      sqlColumnName: 'product_id',
      viewId: 'view-product',
      viewAlias: null,
      visible: 1,
      maskingRule: '',
      referenceFieldId: '',
      extended: null,
      transformRule: '',
      needExtract: true,
    },
    {
      id: 'field-sales-product-id',
      name: 'product_id2',
      alias: '产品ID',
      aliasFromDb: 'product_id',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      valueType: 'INTEGER',
      dataFormat: '<整型-默认值>',
      sqlColumnName: 'product_id',
      viewId: 'view-sales',
      viewAlias: null,
      visible: 1,
      maskingRule: '',
      referenceFieldId: '',
      extended: null,
      transformRule: '',
      needExtract: true,
    },
  ],
  levels: [],
  measures: [],
  calcMeasures: [],
  namedSets: [],
  nodes: [],
};

function relation(overrides: Partial<CustomRelationConfig> = {}): CustomRelationConfig {
  return {
    id: 'rel-1',
    name: '产品-销售',
    enabled: true,
    leftViewId: 'view-product',
    rightViewId: 'view-sales',
    leftCardinality: 'ONE',
    rightCardinality: 'MANY',
    direction: 'Single',
    conditions: [
      {
        leftFieldId: 'field-product-id',
        rightFieldId: 'field-sales-product-id',
        operator: 'EQUALS',
      },
    ],
    isWeak: true,
    isFilter: false,
    ...overrides,
  };
}

describe('translateCustomRelations', () => {
  it('把启用的手动连线翻译成 query-level CustomRelation', () => {
    const elements = translateCustomRelations([relation()], metadata);

    expect(elements).toEqual([
      {
        _enum: 'CustomRelation',
        relation: {
          left: 'product',
          right: 'sales_fact',
          leftCardinality: 'ONE',
          rightCardinality: 'MANY',
          direction: 'Single',
          condition: {
            _enum: 'BinaryExpr',
            op: '=',
            left: { _enum: 'ColumnRef', view: 'product', column: 'product_id' },
            right: { _enum: 'ColumnRef', view: 'sales_fact', column: 'product_id' },
          },
          isWeak: true,
          isFilter: false,
          extensions: {
            source: 'pivot-table',
            relationId: 'rel-1',
            relationName: '产品-销售',
          },
        },
      },
    ]);
  });

  it('跳过禁用或字段不完整的连线', () => {
    expect(translateCustomRelations([relation({ enabled: false })], metadata)).toEqual([]);
    expect(
      translateCustomRelations([
        relation({ conditions: [{ leftFieldId: 'missing', rightFieldId: 'field-sales-product-id', operator: 'EQUALS' }] }),
      ], metadata),
    ).toEqual([]);
  });
});
