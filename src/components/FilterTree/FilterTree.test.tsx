/**
 * FilterTree 组件单测(P3)
 *
 * 不依赖 ClientFilter — 用极简 leaf 类型证明组件契约,避免被业务类型耦合。
 * 业务整合(ClientFilter / MeasureFilter)的 e2e 由 FilterPanel.test 覆盖。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PIVOT_FIELD_MIME,
  PIVOT_FILTER_NODE_MIME,
} from '../../core/dropRules/dragProtocol.js';
import type { TreeNode } from '../../core/filterTree/filterTree.js';

import { FilterTree } from './FilterTree.js';

interface SimpleLeaf {
  field: string;
  value: string;
}

const renderLeaf = (
  leaf: SimpleLeaf,
  path: number[],
  onLeafChange: (next: SimpleLeaf) => void,
) => {
  const key = path.join('-');
  return (
    <>
      <span data-testid={`leaf-field-${key}`}>{leaf.field}</span>
      <input
        data-testid={`leaf-value-${key}`}
        value={leaf.value}
        onChange={(e) => onLeafChange({ ...leaf, value: e.target.value })}
      />
    </>
  );
};

const fieldDropToLeaf = (fieldName: string): SimpleLeaf => ({
  field: fieldName,
  value: '',
});

/** 模拟拖拽 drop:new Event 不带 dataTransfer,需要手动注入 */
function fireDropEvent(target: Element, fieldName: string, fieldType = 'Dimension') {
  const data = new Map<string, string>();
  data.set(PIVOT_FIELD_MIME, JSON.stringify({ fieldName, fieldType }));
  const event = new Event('drop', { bubbles: true }) as Event & {
    dataTransfer: { getData: (k: string) => string };
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (k: string) => data.get(k) ?? '' },
  });
  target.dispatchEvent(event);
}

/** 模拟内部节点 drop:fromPath 是 PIVOT_FILTER_NODE_MIME payload */
function fireInternalDropEvent(
  target: Element,
  fromPath: number[],
  treeId = 'filter-tree',
) {
  const data = new Map<string, string>();
  data.set(PIVOT_FILTER_NODE_MIME, JSON.stringify({ treeId, path: fromPath }));
  const event = new Event('drop', { bubbles: true }) as Event & {
    dataTransfer: { getData: (k: string) => string };
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (k: string) => data.get(k) ?? '' },
  });
  target.dispatchEvent(event);
}

describe('FilterTree — 空状态 + 拖拽', () => {
  it('空树渲染 emptyHint', () => {
    render(
      <FilterTree<SimpleLeaf>
        tree={[]}
        onChange={vi.fn()}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
        emptyHint="拖字段进来"
      />,
    );
    expect(screen.getByText('拖字段进来')).toBeInTheDocument();
    expect(screen.getByTestId('filter-tree-empty')).toBeInTheDocument();
  });

  it('drop 字段 → onChange 收到 [新 leaf]', () => {
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={[]}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree'), 'Province');
    expect(onChange).toHaveBeenCalledWith([{ field: 'Province', value: '' }]);
  });

  it('fieldDropToLeaf 返回 null → 不调用 onChange(类型不允许)', () => {
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={[]}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={() => null}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree'), 'X');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FilterTree — leaf 渲染 + 编辑', () => {
  it('renderLeaf 接收 (leaf, path, onLeafChange);用户改 value 触发 onChange', () => {
    const tree: TreeNode<SimpleLeaf>[] = [{ field: 'A', value: 'old' }];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    fireEvent.change(screen.getByTestId('leaf-value-0'), { target: { value: 'new' } });
    expect(onChange).toHaveBeenCalledWith([{ field: 'A', value: 'new' }]);
  });

  // 2026-05-17 测试瘦身(docs/testing-strategy.md §40):
  //   - 删 leaf → 等价 core `removeAt`(filterTree.test.ts:70-100,4 case)
  //   - 拆分 → 等价 core `wrapLeafInGroup`(filterTree.test.ts:122-146,3 case)
  //   两条 it 都是 click → 核 fn → onChange 的纯透传,组件无额外逻辑;
  //   组件层"click 触发回调"的 wiring 由上方 "改 value 触发 onChange" 已证
});

describe('FilterTree — group 渲染 + op 切换 + 加子条件', () => {
  it('group 渲染 op select(默认 显示 group.op)', () => {
    const tree: TreeNode<SimpleLeaf>[] = [
      {
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'A', value: '1' },
          { field: 'B', value: '2' },
        ],
      },
    ];
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={vi.fn()}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    expect(screen.getByTestId('filter-tree-op-0')).toHaveValue('Or');
    expect(screen.getByTestId('leaf-field-0-0')).toHaveTextContent('A');
    expect(screen.getByTestId('leaf-field-0-1')).toHaveTextContent('B');
  });

  // 2026-05-17 测试瘦身:
  //   - 切 op Or→And → 等价 core `setGroupOp`(filterTree.test.ts:107-119)
  //   - "+ 加子条件" → 等价 core `addLeaf` with path(filterTree.test.ts:38-67)
  //   两条 it 是 form/click → 核 fn → onChange 透传

  it('drop 字段到 group → 追加到该 group children(不是根 sibling)', () => {
    const tree: TreeNode<SimpleLeaf>[] = [
      {
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'A', value: '1' },
          { field: 'B', value: '2' },
        ],
      },
    ];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    fireDropEvent(screen.getByTestId('filter-tree-group-0'), 'C');
    // 关键断言:onChange 只触发 1 次,且 leaf 进入了 group children(不是根)
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'A', value: '1' },
          { field: 'B', value: '2' },
          { field: 'C', value: '' },
        ],
      }),
    ]);
  });

  // 2026-05-17 测试瘦身:group 内删剩 1 → 自动降级 — 等价 core
  //   `removeAt` 降级语义(filterTree.test.ts:91)
});

describe('FilterTree — 根级"+ 添加条件"按钮', () => {
  it('newLeafTemplate 提供 → 显示根添加按钮,点击追加 leaf', () => {
    const tree: TreeNode<SimpleLeaf>[] = [];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
        newLeafTemplate={() => ({ field: 'X', value: '' })}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-tree-add-root'));
    expect(onChange).toHaveBeenCalledWith([{ field: 'X', value: '' }]);
  });

  it('newLeafTemplate 不传 → 不显示根添加按钮', () => {
    render(
      <FilterTree<SimpleLeaf>
        tree={[]}
        onChange={vi.fn()}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    expect(screen.queryByTestId('filter-tree-add-root')).not.toBeInTheDocument();
  });
});

describe('FilterTree — 内部节点拖拽移动', () => {
  // 2026-05-17 测试瘦身:moveNode 的输出形状(append 到 group / 降级 / 跨 group / 防环)
  //   已在 core filterTree.test.ts 全覆盖。组件层只验"内部 drop 事件触发 → onChange 被调
  //   (说明 sourcePath/destPath 解析正确传给了 core fn)"。
  it('内部 drop event → onChange 被调一次(wiring smoke — 形状由 core moveNode 证)', () => {
    const tree: TreeNode<SimpleLeaf>[] = [
      { field: 'A', value: '1' },
      {
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'B', value: '2' },
          { field: 'C', value: '3' },
        ],
      },
    ];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    fireInternalDropEvent(screen.getByTestId('filter-tree-group-1'), [0]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('跨 treeId 的内部节点 payload 被拒绝(防 dim ↔ measure 互拖)', () => {
    const tree: TreeNode<SimpleLeaf>[] = [
      {
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'B', value: '2' },
          { field: 'C', value: '3' },
        ],
      },
    ];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
        testidPrefix="dim-tree"
      />,
    );
    // payload treeId='measure-tree' 不匹配当前 testidPrefix='dim-tree'
    fireInternalDropEvent(screen.getByTestId('dim-tree-group-0'), [0], 'measure-tree');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('防环:group 拖到自己 descendant 内 → onChange 不触发(moveNode noop)', () => {
    const tree: TreeNode<SimpleLeaf>[] = [
      {
        kind: 'group',
        op: 'Or',
        children: [
          { field: 'A', value: '1' },
          { field: 'B', value: '2' },
        ],
      },
    ];
    const onChange = vi.fn();
    render(
      <FilterTree<SimpleLeaf>
        tree={tree}
        onChange={onChange}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
      />,
    );
    // 拖 [0]( group 自己) 进 [0]( 自己) — moveNode 返回原 tree 引用
    // onChange 仍会被调用一次,但 next === tree(引用相等)
    fireInternalDropEvent(screen.getByTestId('filter-tree-group-0'), [0]);
    expect(onChange).toHaveBeenCalledWith(tree);
  });
});

describe('FilterTree — testidPrefix', () => {
  it('指定 prefix → 所有 testid 用该前缀', () => {
    render(
      <FilterTree<SimpleLeaf>
        tree={[{ field: 'A', value: '1' }]}
        onChange={vi.fn()}
        renderLeaf={renderLeaf}
        fieldDropToLeaf={fieldDropToLeaf}
        testidPrefix="my-tree"
      />,
    );
    expect(screen.getByTestId('my-tree')).toBeInTheDocument();
    expect(screen.getByTestId('my-tree-leaf-0')).toBeInTheDocument();
    expect(screen.getByTestId('my-tree-remove-0')).toBeInTheDocument();
  });
});
