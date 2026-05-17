/**
 * ContextMenu — 通用右键菜单组件
 *
 * 范围:
 *   - 在 (x, y) 处绝对定位弹出
 *   - 渲染 items（支持 disabled / separator / 子菜单(任意嵌套深度)）
 *   - 点击 enabled item → onClick + onClose；disabled item 不触发
 *   - 父项(children 非空)→ hover/click 展开子菜单(递归 MenuList,任意深度)
 *   - 点击外部 / Esc → onClose
 *   - **边缘自动翻转**(2026-05-06):菜单/子菜单超出右侧或底部时,自动翻到左侧/上方
 *
 * 设计：
 *   - 不引第三方 menu lib，原生 div + 简单事件监听足够（Unix 哲学）
 *   - 嵌套通过递归 <MenuList> 自然支持(每层独立 openSubmenuKey state)
 *   - flip 检测用 useLayoutEffect + getBoundingClientRect 测一次,避免闪烁
 *   - 不做键盘上下选中（鼠标足够;真有可达性需求再加)
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

// 2026-05-17:ContextMenuItem 类型迁到 core/menuBuilder/menuItem.ts,本文件 re-export 保兼容
import type { ContextMenuItem } from '../../core/menuBuilder/menuItem.js';
export type { ContextMenuItem };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * 单层菜单 ul 渲染器 — 内部管理 hover state,递归渲染嵌套 submenu。
 * 顶层和 submenu 共用同一个组件,只是 className/role 不同。
 *
 * Flip 检测:挂载/items 变化后测 bounding rect,如果超出 viewport 右/底边,
 * 给 ul 加 data-flip-x/y='true',CSS 翻到反方向(顶层用 transform,submenu 用 left↔right)
 */
function MenuList({
  items,
  onClose,
  className,
  style,
  testId,
}: {
  items: ContextMenuItem[];
  onClose: () => void;
  className: string;
  style?: CSSProperties;
  testId?: string;
}) {
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  const [flip, setFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const hasMeasuredRef = useRef(false);

  useLayoutEffect(() => {
    // 只测一次:mount 时元素处于"自然位置"(没 flip),measure 出 rect 是真实的。
    //
    // 为什么不能 re-measure:
    //   - 顶层 menu 用 transform → measure 后的 rect 含 transform 偏移
    //   - 子菜单用 left↔right 位置 swap → measure 后的 rect 是 swap 后位置
    //   - 两种 flip 应用后 rect.right 都"看起来不超出"了 → setFlip(false)
    //     → 取消 flip → 又超出 → setFlip(true) → 死循环
    //
    // 子菜单是独立 MenuList 实例(state 控制 mount/unmount),它有自己的"首次 measure"。
    // 同实例 items 内容在生命周期内基本不变(用户右键 → 弹菜单 → 选项即关),
    // 不需要 re-measure。
    if (hasMeasuredRef.current) return;
    const el = ulRef.current;
    if (!el) return;
    hasMeasuredRef.current = true;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const SAFE = 4;
    const flipX = rect.right > vw - SAFE;
    const flipY = rect.bottom > vh - SAFE;
    if (flipX || flipY) setFlip({ x: flipX, y: flipY });
  });

  return (
    <ul
      ref={ulRef}
      role="menu"
      className={className}
      style={style}
      data-testid={testId}
      data-flip-x={flip.x ? 'true' : 'false'}
      data-flip-y={flip.y ? 'true' : 'false'}
    >
      {items.map((item) => {
        if (item.separator) {
          return (
            <li
              key={item.key}
              className="context-menu__separator"
              data-testid={`context-menu-separator-${item.key}`}
              role="separator"
            />
          );
        }
        const disabled = !!item.disabled;
        const hasChildren = !!item.children && item.children.length > 0;
        const submenuOpen = openSubmenuKey === item.key;

        if (hasChildren) {
          return (
            <li
              key={item.key}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={submenuOpen}
              aria-disabled={disabled}
              className={
                disabled
                  ? 'context-menu__item context-menu__item--has-children context-menu__item--disabled'
                  : 'context-menu__item context-menu__item--has-children'
              }
              data-testid={`context-menu-item-${item.key}`}
              onMouseEnter={() => {
                if (!disabled) setOpenSubmenuKey(item.key);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                // 触屏 / 键盘可达性:点击父项 toggle 子菜单
                setOpenSubmenuKey(submenuOpen ? null : item.key);
              }}
            >
              <span className="context-menu__item-label">{item.label}</span>
              <span className="context-menu__item-arrow" aria-hidden>
                ▶
              </span>
              {submenuOpen && (
                <MenuList
                  items={item.children!}
                  onClose={onClose}
                  className="context-menu__submenu"
                  testId={`context-menu-submenu-${item.key}`}
                />
              )}
            </li>
          );
        }

        // 普通 leaf 项
        return (
          <li
            key={item.key}
            role="menuitem"
            className={
              disabled
                ? 'context-menu__item context-menu__item--disabled'
                : 'context-menu__item'
            }
            aria-disabled={disabled}
            data-testid={`context-menu-item-${item.key}`}
            onMouseEnter={() => setOpenSubmenuKey(null)}
            onClick={() => {
              if (disabled) return;
              item.onClick?.();
              onClose();
            }}
          >
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

export function ContextMenu({ x, y, items, onClose, className, style }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      // 简化:Esc 直接关整个菜单(不再按层级关闭 — 嵌套深 + 多 submenu 同时展开时层级追踪复杂)
      // 用户体验上"一键关菜单"更直观
      if (e.key === 'Escape') {
        // capture 阶段 + stopImmediatePropagation:让"菜单 Esc 优先于其它全局 Esc 监听器"
        // (例如浏览模式的 Esc 退出)— 否则 Esc 会一次同时关菜单 + 退出浏览模式
        e.stopImmediatePropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    // capture=true:确保此 handler 在其他冒泡阶段 Esc 监听器之前执行
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [onClose]);

  const finalStyle: CSSProperties = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    ...style,
  };

  // 用 div 包裹 MenuList — outer ref 用来检测 outside click;ul 已是 MenuList 内部
  return (
    <div ref={ref}>
      <MenuList
        items={items}
        onClose={onClose}
        className={className ? `context-menu ${className}` : 'context-menu'}
        style={finalStyle}
        testId="context-menu"
      />
    </div>
  );
}
