/**
 * ContextMenu — 通用右键菜单组件
 *
 * 范围:
 *   - 在 (x, y) 处弹出菜单（绝对定位）
 *   - 渲染传入的 items（label / disabled / separator / 子菜单)
 *   - 点击 item → 触发 item.onClick + onClose
 *   - 点击 item 但 disabled → 不触发 onClick，也不触发 onClose
 *   - 父项(children 非空)→ hover/click 展开子菜单
 *   - 点子项 → 子项 onClick + 整个菜单关闭
 *   - 点击外部 / 按 Esc → 触发 onClose(Esc 优先关子菜单)
 *
 * 不支持(故意):
 *   - 多级嵌套子菜单(>1 级)— 真有需求再扩
 *   - 键盘上下选中 — 鼠标足够
 *   - 自动定位避开屏幕边缘 — 次要 UX,等真有问题再加
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextMenu } from './ContextMenu.js';

describe('ContextMenu', () => {
  it('renders items at given (x, y)', () => {
    render(
      <ContextMenu
        x={100}
        y={200}
        items={[
          { key: 'add-row', label: '添加到行区', onClick: vi.fn() },
          { key: 'add-col', label: '添加到列区', onClick: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('添加到行区')).toBeInTheDocument();
    expect(screen.getByText('添加到列区')).toBeInTheDocument();
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
  });

  it('clicking an enabled item triggers onClick and onClose', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ key: 'k', label: '添加到行区', onClick }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('添加到行区'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a disabled item does NOT trigger onClick or onClose', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ key: 'k', label: '添加到数值区', onClick, disabled: true }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('添加到数值区'));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders separator items', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          { key: 'a', label: '添加到行区', onClick: vi.fn() },
          { key: 'sep1', separator: true },
          { key: 'b', label: '添加到列区', onClick: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('context-menu-separator-sep1')).toBeInTheDocument();
  });

  it('Esc key triggers onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ key: 'a', label: 'X', onClick: vi.fn() }]}
        onClose={onClose}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click outside the menu triggers onClose', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ContextMenu
          x={0}
          y={0}
          items={[{ key: 'a', label: 'X', onClick: vi.fn() }]}
          onClose={onClose}
        />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ContextMenu — 子菜单(children)', () => {
  it('父项渲染 ▶ 箭头(aria-haspopup=menu),子菜单初始未展开', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [
              { key: 'asc', label: '升序', onClick: vi.fn() },
              { key: 'desc', label: '降序', onClick: vi.fn() },
            ],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    const parent = screen.getByTestId('context-menu-item-sort');
    expect(parent).toHaveAttribute('aria-haspopup', 'menu');
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    // 子菜单未渲染(closed by default)
    expect(screen.queryByTestId('context-menu-submenu-sort')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-menu-item-asc')).not.toBeInTheDocument();
  });

  it('hover 父项 → 子菜单展开,可见子项', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [
              { key: 'asc', label: '升序', onClick: vi.fn() },
              { key: 'desc', label: '降序', onClick: vi.fn() },
            ],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    expect(screen.getByTestId('context-menu-submenu-sort')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-asc')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-desc')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-sort')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('点击父项 → toggle 子菜单(再点关闭)', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    const parent = screen.getByTestId('context-menu-item-sort');
    fireEvent.click(parent);
    expect(screen.getByTestId('context-menu-submenu-sort')).toBeInTheDocument();
    fireEvent.click(parent);
    expect(screen.queryByTestId('context-menu-submenu-sort')).not.toBeInTheDocument();
  });

  it('点击子项 → 触发子项 onClick 并关闭整个菜单(onClose)', () => {
    const childClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: childClick }],
          },
        ]}
        onClose={onClose}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    fireEvent.click(screen.getByTestId('context-menu-item-asc'));
    expect(childClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disabled 子项 → 点击不触发 onClick,也不关闭菜单', () => {
    const childClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [
              { key: 'clear', label: '取消排序', onClick: childClick, disabled: true },
            ],
          },
        ]}
        onClose={onClose}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    fireEvent.click(screen.getByTestId('context-menu-item-clear'));
    expect(childClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disabled 父项 → hover 不展开子菜单', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            disabled: true,
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    expect(screen.queryByTestId('context-menu-submenu-sort')).not.toBeInTheDocument();
  });

  it('hover 兄弟 leaf 项 → 关闭已打开的子菜单(避免双层共存)', () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
          { key: 'remove', label: '从此区域移除', onClick: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    expect(screen.getByTestId('context-menu-submenu-sort')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-remove'));
    expect(screen.queryByTestId('context-menu-submenu-sort')).not.toBeInTheDocument();
  });

  it('Esc 一键关闭整个菜单(包括展开的 submenu)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
        ]}
        onClose={onClose}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-sort'));
    expect(screen.getByTestId('context-menu-submenu-sort')).toBeInTheDocument();
    // Esc → 直接关整个菜单(简化:不再分级关闭,因多 submenu 同时展开时层级追踪复杂)
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('溢出右侧 viewport → ul 标记 data-flip-x="true"(CSS 翻到左侧)', () => {
    // mock 一个很小的 viewport 宽度,让默认 (x, y) 触发溢出
    const origInner = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 200, writable: true, configurable: true });
    // mock getBoundingClientRect 返回宽 180 的 menu(右边超 200-4)
    const origGet = HTMLUListElement.prototype.getBoundingClientRect;
    HTMLUListElement.prototype.getBoundingClientRect = function () {
      return { left: 50, top: 10, right: 230, bottom: 60, width: 180, height: 50, x: 50, y: 10, toJSON: () => ({}) } as DOMRect;
    };
    try {
      render(
        <ContextMenu
          x={50}
          y={10}
          items={[{ key: 'a', label: 'X', onClick: vi.fn() }]}
          onClose={vi.fn()}
        />,
      );
      // useLayoutEffect 同步执行后,data-flip-x 已经 'true'
      expect(screen.getByTestId('context-menu')).toHaveAttribute('data-flip-x', 'true');
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: origInner, writable: true, configurable: true });
      HTMLUListElement.prototype.getBoundingClientRect = origGet;
    }
  });

  it('未溢出时 data-flip-x="false"(默认右侧不翻转)', () => {
    // jsdom 默认 innerWidth 1024,getBoundingClientRect 返回全 0 → 不溢出
    render(
      <ContextMenu
        x={50}
        y={10}
        items={[{ key: 'a', label: 'X', onClick: vi.fn() }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('context-menu')).toHaveAttribute('data-flip-x', 'false');
  });

  it('支持任意深度嵌套(2 级+)— hover 父项 → 展开子,hover 孙项 → 展开孙子', () => {
    const grandClick = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'level1',
            label: '快速计算',
            children: [
              {
                key: 'level2',
                label: '同期值',
                children: [
                  { key: 'level3', label: '按 销售_年', onClick: grandClick },
                ],
              },
            ],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-level1'));
    expect(screen.getByTestId('context-menu-submenu-level1')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('context-menu-item-level2'));
    expect(screen.getByTestId('context-menu-submenu-level2')).toBeInTheDocument();
    // 点孙项 → 触发 onClick
    fireEvent.click(screen.getByTestId('context-menu-item-level3'));
    expect(grandClick).toHaveBeenCalledTimes(1);
  });

  it('父项点击不触发 onClose(纯展开 toggle,不关菜单)', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
        ]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('context-menu-item-sort'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ============================================================
// 边缘翻转(viewport overflow)— 防"flip → re-measure → unflip → 死循环"回归
// ============================================================
describe('ContextMenu — 边缘翻转防死循环', () => {
  it('靠右边缘 → flip.x=true,稳定不抖(测量补偿 transform)', () => {
    // jsdom 默认 innerWidth=1024。把菜单放靠右边触发 flipX。
    // 关键不变量:渲染挂载完成后 React 不报"Maximum update depth exceeded"。
    // 如果 useLayoutEffect 死循环,渲染会抛 — 这里能正常 render 即说明 fix 生效。
    expect(() =>
      render(
        <ContextMenu
          x={1000}
          y={10}
          items={[{ key: 'a', label: 'A', onClick: vi.fn() }]}
          onClose={vi.fn()}
        />,
      ),
    ).not.toThrow();
    // 菜单应该挂上 data-flip-x="true"(或 false — 看 jsdom 给的 offsetWidth;
    // 两者都不抛即可,不强测具体属性,因为 jsdom layout 跟真实浏览器有差异)
    const menu = screen.getByTestId('context-menu');
    expect(menu).toBeInTheDocument();
  });

  it('靠下边缘 → flip.y 决策稳定', () => {
    expect(() =>
      render(
        <ContextMenu
          x={10}
          y={750}
          items={[{ key: 'a', label: 'A', onClick: vi.fn() }]}
          onClose={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });

  it('items 变化(submenu 展开)→ 重测后仍稳定', async () => {
    render(
      <ContextMenu
        x={1000}
        y={750}
        items={[
          {
            key: 'sort',
            label: '排序',
            children: [{ key: 'asc', label: '升序', onClick: vi.fn() }],
          },
        ]}
        onClose={vi.fn()}
      />,
    );
    // 展开 submenu → 触发 ContextMenu 重渲 → useLayoutEffect 跑;不应死循环
    expect(() =>
      fireEvent.click(screen.getByTestId('context-menu-item-sort')),
    ).not.toThrow();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });
});
