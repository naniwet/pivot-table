/**
 * ContextMenuItem — 通用上下文菜单 item 数据结构(纯 TS,无 React/DOM 依赖)
 *
 * 2026-05-17:从 components/ContextMenu/ContextMenu.tsx 迁到 core,让 core 的
 *   menuBuilder 模块可以产出 ContextMenuItem[] 而不反向依赖组件层。
 *   组件层 components/ContextMenu/ContextMenu.tsx 仍 re-export 保持向后兼容。
 *
 * 设计:
 *   - leaf 项必传 onClick(顶级菜单);父项(有 children)可省 onClick
 *   - separator:特殊形态,只有 key + separator: true
 *   - children 可递归任意深度(子菜单)
 */
export type ContextMenuItem =
  | {
      key: string;
      label: string;
      /** leaf 项:必传 onClick;父项(有 children)可省 */
      onClick?: () => void;
      /** 父项:hover/click 展开此子菜单(子项可继续带 children,递归任意深度) */
      children?: ContextMenuItem[];
      disabled?: boolean;
      separator?: false;
    }
  | { key: string; separator: true; label?: undefined; onClick?: undefined; children?: undefined };
