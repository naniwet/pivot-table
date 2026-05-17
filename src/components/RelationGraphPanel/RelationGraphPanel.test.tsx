import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Metadata } from '../../types/metadata.js';

import { RelationGraphPanel } from './RelationGraphPanel.js';

const metadata: Metadata = {
  id: 'model',
  name: 'Model',
  alias: 'Model',
  desc: '',
  providerName: 'AUGMENTED',
  views: [
    {
      id: 'product',
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
      id: 'sales',
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
      id: 'product-id',
      name: 'product_id',
      alias: '产品ID',
      aliasFromDb: '产品ID',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      valueType: 'INTEGER',
      dataFormat: '<整型-默认值>',
      sqlColumnName: 'product_id',
      viewId: 'product',
      viewAlias: null,
      visible: 1,
      maskingRule: '',
      referenceFieldId: '',
      extended: null,
      transformRule: '',
      needExtract: true,
    },
    {
      id: 'sales-product-id',
      name: 'product_id2',
      alias: '销售产品ID',
      aliasFromDb: '销售产品ID',
      desc: '',
      descFromDb: '',
      useFromDb: false,
      valueType: 'INTEGER',
      dataFormat: '<整型-默认值>',
      sqlColumnName: 'product_id',
      viewId: 'sales',
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
  relationGraph: {
    relations: [
      {
        srcViewId: 'product',
        destViewId: 'sales',
        fieldRelations: [{ srcFieldId: 'product-id', destFieldId: 'sales-product-id' }],
        cardinalityType: 'ONE2MANY',
        filterDirection: 'SINGLE',
      },
    ],
  },
};

describe('RelationGraphPanel', () => {
  it('窄栏只展示摘要,完整关系图在 SVG 编辑器里打开', () => {
    render(<RelationGraphPanel metadata={metadata} customRelations={[]} onChange={vi.fn()} />);

    expect(screen.getByTestId('relation-graph-panel')).toHaveTextContent('2 张表');
    expect(screen.queryByTestId('relation-editor-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('relation-open-editor'));

    expect(screen.getByTestId('relation-editor-modal')).toBeInTheDocument();
    expect(screen.getByTestId('relation-svg-node-product')).toHaveTextContent('产品表');
    expect(screen.getByTestId('relation-svg-node-sales')).toHaveTextContent('销售表');
    expect(screen.getByTestId('relation-svg-edge-base-product-sales')).toBeInTheDocument();
    expect(screen.getByTestId('relation-cardinality-base-product-sales-left')).toHaveAttribute('data-cardinality', 'one');
    expect(screen.getByTestId('relation-cardinality-base-product-sales-right')).toHaveAttribute('data-cardinality', 'many');
    expect(screen.getByTestId('relation-svg-edge-line-base-product-sales')).not.toHaveAttribute('marker-end');
    expect(screen.getByTestId('relation-direction-base-product-sales')).toHaveAttribute(
      'data-direction',
      'one-to-many',
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('在 SVG 编辑器里新增本次分析自定义关系', () => {
    const onChange = vi.fn();
    render(<RelationGraphPanel metadata={metadata} customRelations={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('relation-open-editor'));
    fireEvent.click(screen.getByTestId('relation-add'));
    fireEvent.click(screen.getByTestId('relation-save'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        enabled: true,
        leftViewId: 'product',
        rightViewId: 'sales',
        leftCardinality: 'ONE',
        rightCardinality: 'MANY',
        direction: 'Single',
        conditions: [
          { leftFieldId: 'product-id', rightFieldId: 'sales-product-id', operator: 'EQUALS' },
        ],
      }),
    ]);
  });

  it('支持选中自定义关系后修改和删除', () => {
    const onChange = vi.fn();
    render(
      <RelationGraphPanel
        metadata={metadata}
        customRelations={[
          {
            id: 'custom-1',
            name: '产品表-销售表',
            enabled: true,
            leftViewId: 'product',
            rightViewId: 'sales',
            leftCardinality: 'ONE',
            rightCardinality: 'MANY',
            direction: 'Single',
            conditions: [
              { leftFieldId: 'product-id', rightFieldId: 'sales-product-id', operator: 'EQUALS' },
            ],
            isWeak: true,
            isFilter: false,
          },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('relation-open-editor'));
    fireEvent.click(screen.getByTestId('relation-svg-edge-custom-custom-1'));
    fireEvent.click(screen.getByTestId('relation-direction-trigger'));
    fireEvent.click(screen.getByRole('option', { name: /双向/ }));
    fireEvent.click(screen.getByTestId('relation-save'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'custom-1', direction: 'Both' }),
    ]);

    fireEvent.click(screen.getByTestId('relation-delete'));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('SVG 节点可以拖拽调整位置,避免关系线和节点覆盖', () => {
    render(<RelationGraphPanel metadata={metadata} customRelations={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('relation-open-editor'));
    const node = screen.getByTestId('relation-svg-node-product');

    expect(node).toHaveAttribute('transform', 'translate(108 78)');

    fireEvent.mouseDown(node, { clientX: 120, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 130 });
    fireEvent.mouseUp(window);

    expect(node).toHaveAttribute('transform', 'translate(168 118)');
  });
});
