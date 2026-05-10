/**
 * SettingsModal — PivotTable 顶部"⚙ 设置"按钮触发的设置弹窗
 *
 * 内容(按行):
 *   1. 4 个布尔 checkbox(冻结列头/行头、压缩空行/空列、分页器显示总数)
 *   2. 空值显示文本(下拉预设 + 自定义 input)
 *   3. 面板可见性(3 个 checkbox:工具栏 / 字段面板 / 字段树)
 *   4. 导出最大行数(number input)
 *   5. 翻页模式(翻页器 / 滚动加载)
 *   6. 显示模式(表格 / 树状;adhoc 下树状 disabled)
 *
 * 抽出来的原因:PivotTable 之前 ~1750 行,这部分占 ~280 行。集中后 PivotTable 主流程更清楚。
 *
 * 设计:
 *   - **stateless** — 所有 state(viewConfig / panelVisibility / isAdhoc)都从 props 传入
 *   - 关闭由 caller 控制(传 onClose),点 backdrop / × 都调它
 *   - dispatch 也由 caller 注入 — 跟 useTagMenu 同模式,避免组件直接耦合 useViewConfig
 */
import type { Dispatch, ReactNode } from 'react';

import type { ViewConfig } from '../../types/viewConfig.js';
import type { ViewConfigAction } from '../../hooks/useViewConfig.js';

export interface PanelVisibility {
  toolbar: boolean;
  fieldPanel: boolean;
  fieldTree: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  viewConfig: ViewConfig;
  dispatch: Dispatch<ViewConfigAction>;
  /** 面板可见性 — caller 持有 state(localStorage 持久化) */
  panelVisibility: PanelVisibility;
  /** 切某面板 — caller 实现具体改 state 逻辑 */
  onTogglePanel: (key: keyof PanelVisibility, next: boolean) => void;
  /** adhoc 模式:某些选项要 disabled(如冻结行头、压缩空列、树状模式) */
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
        <div className="settings-modal__body">
          {(
            [
              {
                key: 'freezeHeader',
                label: '冻结列头(滚动时表头吸顶)',
                value: viewConfig.pageState.freezeHeader !== false,
                disabled: false, // adhoc 也支持
              },
              {
                key: 'freezeRowHeader',
                label: '冻结行头(横向滚动时左侧维度列吸边)',
                value: viewConfig.pageState.freezeRowHeader !== false,
                // adhoc 的 DetailRenderer 暂不支持 row header sticky-left;在透视模式下生效
                disabled: isAdhoc,
              },
              {
                key: 'compressEmptyRows',
                label: '压缩空行(隐藏全为空的行)',
                value: viewConfig.pageState.compressEmptyRows !== false,
                // adhoc DetailQuery 不走 compress(buildAdhocQuery 强制 false)
                disabled: isAdhoc,
              },
              {
                key: 'compressEmptyColumns',
                label: '压缩空列(隐藏全为空的列;关闭需 MDX 引擎)',
                value: viewConfig.pageState.compressEmptyColumns !== false,
                disabled: isAdhoc,
              },
              {
                key: 'showTotalRowCount',
                label: '分页器显示"共 N 条"总行数',
                value: viewConfig.pageState.showTotalRowCount !== false,
                disabled: false,
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.key}
              className="settings-modal__row"
              data-testid={`settings-${opt.key}`}
              data-disabled={opt.disabled ? 'true' : undefined}
              title={opt.disabled ? '即席查询(明细)模式下不生效' : undefined}
            >
              <input
                type="checkbox"
                checked={opt.value}
                disabled={opt.disabled}
                onChange={(e) =>
                  dispatch({ type: 'SET_DISPLAY_OPTIONS', [opt.key]: e.target.checked })
                }
              />
              <span>{opt.label}</span>
            </label>
          ))}

          {/* P3+ 空值显示文本 — 下拉预设 + 自定义输入 */}
          <div
            className="settings-modal__row settings-modal__row--input"
            data-testid="settings-emptyValueText"
          >
            <span>空值显示</span>
            <select
              data-testid="settings-emptyValueText-preset"
              value={(() => {
                const v = viewConfig.pageState.emptyValueText;
                if (v === undefined || v === '') return '';
                if (v === '-' || v === '0' || v === '无数据' || v === '——') return v;
                return '__custom__';
              })()}
              onChange={(e) => {
                const next = e.target.value;
                if (next === '__custom__') return; // 切到自定义模式让 input 接管
                dispatch({
                  type: 'SET_DISPLAY_OPTIONS',
                  emptyValueText: next === '' ? '' : next,
                });
              }}
            >
              <option value="">空白(默认)</option>
              <option value="-">-</option>
              <option value="——">——</option>
              <option value="0">0</option>
              <option value="无数据">无数据</option>
              <option value="__custom__">自定义…</option>
            </select>
            <input
              type="text"
              data-testid="settings-emptyValueText-input"
              className="settings-modal__inline-input"
              placeholder="自定义占位"
              value={viewConfig.pageState.emptyValueText ?? ''}
              onChange={(e) =>
                dispatch({ type: 'SET_DISPLAY_OPTIONS', emptyValueText: e.target.value })
              }
            />
          </div>

          {/* P5+ 面板可见性 — 工具栏 / 字段面板 / 字段树 各自独立开关 */}
          <div
            className="settings-modal__row settings-modal__row--input"
            data-testid="settings-panelVisibility"
          >
            <span>面板显示</span>
            <div className="settings-modal__panel-toggles">
              {(
                [
                  { key: 'toolbar', label: '工具栏' },
                  { key: 'fieldPanel', label: '字段面板' },
                  { key: 'fieldTree', label: '字段树' },
                ] as const
              ).map((p) => (
                <label
                  key={p.key}
                  className="settings-modal__panel-toggle"
                  data-testid={`settings-panel-${p.key}`}
                >
                  <input
                    type="checkbox"
                    checked={panelVisibility[p.key]}
                    onChange={(e) => onTogglePanel(p.key, e.target.checked)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* P5+ 全量导出最大行数(场景 4)— 数字输入 */}
          <div
            className="settings-modal__row settings-modal__row--input"
            data-testid="settings-exportMaxRows"
          >
            <span title="导出 Excel 时单次拉取的最大行数;> 此值的表应走后端 stream 不走前端">
              导出最大行数
            </span>
            <input
              type="number"
              className="settings-modal__inline-input"
              data-testid="settings-exportMaxRows-input"
              min={100}
              max={100000}
              step={100}
              value={viewConfig.pageState.exportMaxRows ?? 10000}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isFinite(n) || n < 100) return;
                dispatch({
                  type: 'SET_DISPLAY_OPTIONS',
                  exportMaxRows: Math.min(n, 100000),
                });
              }}
            />
          </div>

          {/* P5+ 翻页 UI 模式 — 翻页器 / 滚动加载(隐藏底部分页栏) */}
          <div
            className="settings-modal__row settings-modal__row--input"
            data-testid="settings-paginationMode"
          >
            <span>翻页模式</span>
            <div className="settings-modal__btn-group" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={(viewConfig.pageState.paginationMode ?? 'paged') === 'paged'}
                className="settings-modal__mode-btn"
                data-active={
                  (viewConfig.pageState.paginationMode ?? 'paged') === 'paged'
                    ? 'true'
                    : 'false'
                }
                data-testid="settings-paginationMode-paged"
                onClick={() =>
                  dispatch({ type: 'SET_DISPLAY_OPTIONS', paginationMode: 'paged' })
                }
              >
                翻页器
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewConfig.pageState.paginationMode === 'scroll'}
                className="settings-modal__mode-btn"
                data-active={
                  viewConfig.pageState.paginationMode === 'scroll' ? 'true' : 'false'
                }
                data-testid="settings-paginationMode-scroll"
                title="隐藏底部分页栏 — 用户在滚动条里浏览当前页所有行(可在'每页大小'里调大)"
                onClick={() =>
                  dispatch({ type: 'SET_DISPLAY_OPTIONS', paginationMode: 'scroll' })
                }
              >
                滚动加载
              </button>
            </div>
          </div>

          {/* P5 显示模式 — 表格模式 / 树状模式并列(树状走 lazy-load) */}
          <div
            className="settings-modal__row settings-modal__row--input"
            data-testid="settings-displayMode"
          >
            <span>显示模式</span>
            <div className="settings-modal__btn-group" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={(viewConfig.pageState.displayMode ?? 'table') !== 'tree'}
                className="settings-modal__mode-btn"
                data-active={
                  (viewConfig.pageState.displayMode ?? 'table') !== 'tree' ? 'true' : 'false'
                }
                data-testid="settings-mode-table"
                onClick={() =>
                  dispatch({ type: 'SET_DISPLAY_MODE', displayMode: 'table' })
                }
              >
                表格模式
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewConfig.pageState.displayMode === 'tree'}
                className="settings-modal__mode-btn"
                data-active={
                  viewConfig.pageState.displayMode === 'tree' ? 'true' : 'false'
                }
                data-testid="settings-mode-tree"
                disabled={isAdhoc}
                title={
                  isAdhoc
                    ? '即席查询(明细)模式不支持树状显示 — 切回透视模式后可用'
                    : '树状模式:多 dim 行轴 lazy 钻取(Hierarchy 行不支持)'
                }
                onClick={() =>
                  dispatch({ type: 'SET_DISPLAY_MODE', displayMode: 'tree' })
                }
              >
                树状模式
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
