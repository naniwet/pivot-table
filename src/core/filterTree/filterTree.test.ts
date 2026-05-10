/**
 * filterTree — 操作 ClientFilter / ClientMeasureFilter 树的纯函数
 *
 * 把 viewConfig.filters / measureFilters(数组,语义=隐式根 AND group)
 * 视为一棵树,提供 immutable 操作 helper 给 FilterTree 编辑器组件用。
 *
 * 路径用 number[] 表示:
 *   - [] 表示根(整棵树)
 *   - [0] 第 0 个顶层节点
 *   - [0, 1] 第 0 个顶层节点(group)的第 1 个 child
 */
import { describe, expect, it } from 'vitest';

import type { ClientFilter } from '../../types/viewConfig.js';

import {
  addLeaf,
  moveNode,
  removeAt,
  setGroupOp,
  wrapLeafInGroup,
} from './filterTree.js';

const leaf = (field: string, value: string): ClientFilter => ({
  kind: 'leaf',
  field,
  operator: 'Equals',
  value,
});

describe('addLeaf', () => {
  it('append 到根 group(顶层数组末尾)', () => {
    const tree: ClientFilter[] = [];
    const next = addLeaf(tree, [], leaf('A', '1'));
    expect(next).toEqual([leaf('A', '1')]);
  });

  it('append 到指定 group 的 children', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1')] },
    ];
    const next = addLeaf(tree, [0], leaf('B', '2'));
    expect((next[0] as { children: ClientFilter[] }).children).toEqual([
      leaf('A', '1'),
      leaf('B', '2'),
    ]);
  });

  it('append 到嵌套 group', () => {
    const tree: ClientFilter[] = [
      {
        kind: 'group',
        op: 'And',
        children: [
          { kind: 'group', op: 'Or', children: [leaf('A', '1')] },
        ],
      },
    ];
    const next = addLeaf(tree, [0, 0], leaf('B', '2'));
    const innerChildren = (
      (next[0] as { children: ClientFilter[] }).children[0] as {
        children: ClientFilter[];
      }
    ).children;
    expect(innerChildren).toEqual([leaf('A', '1'), leaf('B', '2')]);
  });
});

describe('removeAt', () => {
  it('删除顶层第 i 个节点', () => {
    const tree = [leaf('A', '1'), leaf('B', '2'), leaf('C', '3')];
    const next = removeAt(tree, [1]);
    expect(next).toEqual([leaf('A', '1'), leaf('C', '3')]);
  });

  it('删除 group 内子节点(剩 ≥ 2 个 → group 不降级)', () => {
    const tree: ClientFilter[] = [
      {
        kind: 'group',
        op: 'And',
        children: [leaf('A', '1'), leaf('B', '2'), leaf('C', '3')],
      },
    ];
    const next = removeAt(tree, [0, 1]);
    expect((next[0] as { children: ClientFilter[] }).children).toEqual([
      leaf('A', '1'),
      leaf('C', '3'),
    ]);
  });

  it('删除后 group 只剩 1 child → 自动 unwrap 为 leaf(可选行为,降低嵌套深度)', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
    ];
    const next = removeAt(tree, [0, 1]);
    // group 只剩 1 child,降级为 leaf
    expect(next[0]).toEqual(leaf('A', '1'));
  });

  it('删除空路径 [] → 原数组不变(无操作)', () => {
    const tree = [leaf('A', '1')];
    expect(removeAt(tree, [])).toEqual(tree);
  });
});

describe('setGroupOp', () => {
  it('切换顶层根 op(没意义,因为根是隐式 AND;但接口允许)', () => {
    // 路径 [] 操作根 — 当前实现默认根是隐式 AND,setGroupOp([]) noop
    const tree = [leaf('A', '1'), leaf('B', '2')];
    expect(setGroupOp(tree, [], 'Or')).toBe(tree);
  });

  it('切换 group 的 op:And ↔ Or', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'And', children: [leaf('A', '1'), leaf('B', '2')] },
    ];
    const next = setGroupOp(tree, [0], 'Or');
    expect((next[0] as { op: string }).op).toBe('Or');
  });
});

describe('wrapLeafInGroup', () => {
  it('把顶层 leaf 升格为 group,默认 op=Or(用户常见场景:加同字段 OR 兄弟)', () => {
    const tree = [leaf('A', '1')];
    const next = wrapLeafInGroup(tree, [0], 'Or');
    expect(next).toEqual([
      { kind: 'group', op: 'Or', children: [leaf('A', '1')] },
    ]);
  });

  it('把嵌套 leaf 升格为 group', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'And', children: [leaf('A', '1'), leaf('B', '2')] },
    ];
    const next = wrapLeafInGroup(tree, [0, 1], 'Or');
    const inner = (next[0] as { children: ClientFilter[] }).children[1];
    expect(inner).toEqual({ kind: 'group', op: 'Or', children: [leaf('B', '2')] });
  });

  it('对 group 节点调用 wrap → 原对象返回(noop;只对 leaf 生效)', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'And', children: [leaf('A', '1')] },
    ];
    expect(wrapLeafInGroup(tree, [0], 'Or')).toBe(tree);
  });
});

describe('moveNode', () => {
  it('根 leaf 移到 group 末尾(外→内)', () => {
    const tree: ClientFilter[] = [
      leaf('A', '1'),
      { kind: 'group', op: 'Or', children: [leaf('B', '2'), leaf('C', '3')] },
    ];
    const next = moveNode(tree, [0], [1]);
    expect(next).toEqual([
      {
        kind: 'group',
        op: 'Or',
        children: [leaf('B', '2'), leaf('C', '3'), leaf('A', '1')],
      },
    ]);
    // [1] → [0] 因为 [0] 删了之后索引前移;append 后 group 还是 group(3 child),不降级
  });

  it('group 内 leaf 移到根(内→外)+ 父 group 自动降级', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
    ];
    const next = moveNode(tree, [0, 0], []);
    // group 删除 child[0] 后只剩 1 child → 自动降级为 leaf B
    // 然后根末尾 append leaf A
    expect(next).toEqual([leaf('B', '2'), leaf('A', '1')]);
  });

  it('group 内 leaf 移到隔壁 group 末尾(跨 group)', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
      { kind: 'group', op: 'And', children: [leaf('C', '3'), leaf('D', '4')] },
    ];
    const next = moveNode(tree, [0, 0], [1]);
    // [0,0] 删除 → [0] 剩 1 child(B) 但 unwrap 在最后做(after append),
    // 这里 [1] 索引 不变(因为 fromParent=[0] 不是 [1] 的前缀)
    // 等效:from 删除 → tree=[group([B]), group([C,D])];append A 到 [1] children → [group([B]), group([C,D,A])]
    // 最后 unwrap → [B(降级), group([C,D,A])]
    expect(next).toEqual([
      leaf('B', '2'),
      { kind: 'group', op: 'And', children: [leaf('C', '3'), leaf('D', '4'), leaf('A', '1')] },
    ]);
  });

  it('group 整个移到另一 group 内部(嵌套)', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
      { kind: 'group', op: 'And', children: [leaf('C', '3'), leaf('D', '4')] },
    ];
    const next = moveNode(tree, [0], [1]);
    // [0] 删 → tree = [原 [1]];adjust [1] = [0]([0] 之前的索引前移)
    // append 原 group 到 [0] 末尾 → 嵌套
    expect(next).toEqual([
      {
        kind: 'group',
        op: 'And',
        children: [
          leaf('C', '3'),
          leaf('D', '4'),
          { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
        ],
      },
    ]);
  });

  it('防环:节点移到自己 → noop(返回原 tree 引用)', () => {
    const tree: ClientFilter[] = [
      { kind: 'group', op: 'Or', children: [leaf('A', '1'), leaf('B', '2')] },
    ];
    expect(moveNode(tree, [0], [0])).toBe(tree);
  });

  it('防环:节点移到自己 descendant → noop', () => {
    const tree: ClientFilter[] = [
      {
        kind: 'group',
        op: 'Or',
        children: [
          { kind: 'group', op: 'And', children: [leaf('A', '1'), leaf('B', '2')] },
          leaf('C', '3'),
        ],
      },
    ];
    // 移 [0] → [0,0](自己内部) → 拒绝
    expect(moveNode(tree, [0], [0, 0])).toBe(tree);
  });

  it('fromPath=[] → noop(根不能移)', () => {
    const tree: ClientFilter[] = [leaf('A', '1')];
    expect(moveNode(tree, [], [0])).toBe(tree);
  });

  it('fromPath 不存在 → noop', () => {
    const tree: ClientFilter[] = [leaf('A', '1')];
    expect(moveNode(tree, [99], [])).toBe(tree);
  });

  it('to 不是 group(指向 leaf)→ updateNodeAt 无变化,leaf 仍删除并 unwrap', () => {
    // 这是个 corner case:UI 层应保证 to 是 group,但纯函数允许;
    // 行为:from 删除,append 到 leaf 失败(updateNodeAt 找到非 group 直接 return),
    // 结果 = "节点凭空消失" 不是 noop。这里固化当前行为以便回归。
    const tree: ClientFilter[] = [leaf('A', '1'), leaf('B', '2'), leaf('C', '3')];
    const next = moveNode(tree, [0], [1]);
    // [0] 删 → [B, C];adjust [1] → [0];append 到 [0](是 leaf,不是 group)→ 不变
    // 结果:A 丢了。这是设计上 UI 不该触发的场景,由 UI 层保证不发生。
    expect(next).toEqual([leaf('B', '2'), leaf('C', '3')]);
  });
});
