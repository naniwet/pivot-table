/**
 * normalizeMetadata 测试 — 核心不变量:
 *   I1. nodes[] 里 valueType=null 的 leaf,从同 id 的 levels/measures/fields/calcMeasures 补全
 *   I2. 没有匹配 source(folder / root)的节点保持原样
 *   I3. 已有非 null 值不被覆盖(优先尊重 nodes 上已存在的值)
 *   I4. 树结构(parentId / children)不变
 *   I5. 真实 probe 样本里所有 leaf 节点 valueType 都能被填上
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { orderModelMetadata } from '../../fixtures/metadata/orderModel.js';
import type { Metadata } from '../../types/metadata.js';

import { normalizeMetadata } from './normalizeMetadata.js';

describe('normalizeMetadata', () => {
  it('I1: leaf 节点 valueType=null → 从 levels/measures/fields 补全', () => {
    const meta: Metadata = {
      ...orderModelMetadata,
      // 把第一个 level 节点的 valueType 强制设为 null,模拟后端响应
      nodes: orderModelMetadata.nodes.map((n) => {
        // 递归找 ShipProvince2(levels[0])对应的节点并清空
        function clear(node: typeof n): typeof n {
          if (node.name === 'ShipProvince2') {
            return { ...node, valueType: null, dataFormat: null, children: node.children.map(clear) };
          }
          return { ...node, children: node.children.map(clear) };
        }
        return clear(n);
      }),
    };

    const out = normalizeMetadata(meta);

    // 找到这个节点 — 应被填回 STRING(levels[0].valueType)
    function find(nodes: typeof out.nodes, name: string): (typeof out.nodes)[number] | null {
      for (const n of nodes) {
        if (n.name === name) return n;
        const child = find(n.children, name);
        if (child) return child;
      }
      return null;
    }
    const node = find(out.nodes, 'ShipProvince2');
    expect(node?.valueType).toBe('STRING');
    expect(node?.dataFormat).toBe('<字符串-默认值>');
  });

  it('I2: folder / root 节点(无 source 匹配)保持原样', () => {
    const out = normalizeMetadata(orderModelMetadata);
    // dimensionRoot / measureRoot / namedsetRoot 等 folder 是 group 节点,没有 flat 对应
    const folderNodes = out.nodes.filter((n) => n.parentId === null);
    expect(folderNodes.length).toBeGreaterThan(0);
    for (const f of folderNodes) {
      expect(f.valueType).toBeNull(); // folder 类型本来就是 null,不被瞎填
    }
  });

  it('I3: 已有非 null 值不被覆盖', () => {
    // 给 measure 节点造一个跟 measures[] 不同的 valueType,验证 nodes 上的值被尊重
    const altered: Metadata = {
      ...orderModelMetadata,
      nodes: orderModelMetadata.nodes.map(function walk(n): typeof n {
        if (n.name === '销售额_1624531356707') {
          return { ...n, valueType: 'INTEGER', children: n.children.map(walk) };
        }
        return { ...n, children: n.children.map(walk) };
      }),
    };
    const out = normalizeMetadata(altered);
    function find(nodes: typeof out.nodes, name: string): (typeof out.nodes)[number] | null {
      for (const n of nodes) {
        if (n.name === name) return n;
        const c = find(n.children, name);
        if (c) return c;
      }
      return null;
    }
    expect(find(out.nodes, '销售额_1624531356707')?.valueType).toBe('INTEGER');
  });

  it('I4: 树结构不变(parentId / children 计数)', () => {
    const out = normalizeMetadata(orderModelMetadata);
    function count(nodes: typeof out.nodes): number {
      return nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    }
    expect(count(out.nodes)).toBe(count(orderModelMetadata.nodes));
  });

  it('I5: 真实 probe 样本所有 leaf 节点 valueType 被填上', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const probePath = resolve(here, '../../fixtures/augmentedDataSet.real.json');
    const raw = JSON.parse(readFileSync(probePath, 'utf8')) as Metadata;
    // 进 normalize 前:确认 leaf 节点 valueType 几乎都是 null
    function leafs(
      nodes: Metadata['nodes'],
    ): Array<{ name: string; type: string; valueType: string | null }> {
      const out: Array<{ name: string; type: string; valueType: string | null }> = [];
      function walk(n: Metadata['nodes'][number]): void {
        if (n.children.length === 0) out.push({ name: n.name, type: n.type, valueType: n.valueType });
        else n.children.forEach(walk);
      }
      nodes.forEach(walk);
      return out;
    }
    const before = leafs(raw.nodes);
    const beforeNullCount = before.filter((l) => l.valueType === null).length;
    expect(beforeNullCount).toBeGreaterThan(0); // 修复前确实是 null

    const after = leafs(normalizeMetadata(raw).nodes);
    // 排除 FOLDER 等没有 flat record 的 leaf(罕见,但允许)
    const stillNull = after.filter(
      (l) =>
        l.valueType === null &&
        !['FOLDER', 'DIMENSION_FOLDER', 'MEASURE_FOLDER', 'NAMEDSET_FOLDER'].includes(l.type),
    );
    expect(stillNull).toEqual([]);
  });
});
