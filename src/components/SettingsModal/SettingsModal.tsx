/**
 * SettingsModal — PivotTable 的设置弹窗(modal 形式)
 *
 * 2026-05-16 重构:内容抽到 SettingsContent 复用;PivotTable 默认把设置嵌进
 * 字段面板的 Tab(inline 路径),不再走 modal — modal 入口保留给宿主自行调用 / 测试。
 *
 * 设计:
 *   - **stateless** — 所有 state(viewConfig / panelVisibility / isAdhoc)都从 props 传入
 *   - 关闭由 caller 控制(传 onClose),点 backdrop / × 都调它
 *   - dispatch 也由 caller 注入 — 跟 useTagMenu 同模式,避免组件直接耦合 useViewConfig
 */
import type { Dispatch, ReactNode } from 'react';

import type { ViewConfig } from '../../types/viewConfig.js';
import type { ViewConfigAction } from '../../hooks/useViewConfig.js';
import { SettingsContent, type PanelVisibility } from './SettingsContent.js';

// 重新 export 让旧调用方继续从 SettingsModal 拿 PanelVisibility 类型(不破坏 import 路径)
export type { PanelVisibility } from './SettingsContent.js';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  viewConfig: ViewConfig;
  dispatch: Dispatch<ViewConfigAction>;
  panelVisibility: PanelVisibility;
  onTogglePanel: (key: keyof PanelVisibility, next: boolean) => void;
  isAdhoc: boolean;
}

export function SettingsModal({
  open,
  onClose,
  viewConfig,
  dispatch,
  panelVisibility,
  onTogglePanel,
  isAdhoc,
}: SettingsModalProps): ReactNode {
  if (!open) return null;
  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      data-testid="settings-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-modal">
        <div className="settings-modal__header">
          <span className="settings-modal__title">显示设置</span>
          <button
            type="button"
            className="settings-modal__close"
            data-testid="settings-modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <SettingsContent
          viewConfig={viewConfig}
          dispatch={dispatch}
          panelVisibility={panelVisibility}
          onTogglePanel={onTogglePanel}
          isAdhoc={isAdhoc}
        />
      </div>
    </div>
  );
}
