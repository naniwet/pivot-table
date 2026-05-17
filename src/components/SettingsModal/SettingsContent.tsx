/**
 * SettingsContent — 设置内容(无 modal chrome)
 *
 * 从 SettingsModal 抽出来,让"设置面板的 Tab"和"独立 modal"复用同一份内容。
 *
 * 内容(按行):
 *   1. 4 个布尔 checkbox(冻结列头/行头、压缩空行/空列、分页器显示总数)
 *   2. 全表总计 / 小计位置
 *   3. 空值显示文本(下拉预设 + 自定义 input)
 *   4. 面板可见性(3 个 checkbox:工具栏 / 字段面板 / 字段树)
 *   5. 翻页模式(翻页器 / 滚动加载)
 *   6. 显示模式(表格 / 树状;adhoc 下树状 disabled)
 *
 *  注意:"导出最大行数"原本在这里,2026-05-16 移到 toolbar 的"导出 ▾" popover 里
 *  (导出场景内联设置,减少在设置面板里找参数的认知成本)
 *
 * 设计:
 *   - **stateless** — 所有 state 都从 props 传入
 *   - 不持有自身 state(连 open/close 都不管,完全由父组件控制可见性)
 */
import type { Dispatch, ReactNode } from 'react';

import type { ViewConfig } from '../../types/viewConfig.js';
import type { ViewConfigAction } from '../../hooks/useViewConfig.js';
import { SelectMenu } from '../SelectMenu/SelectMenu.js';

export interface PanelVisibility {
  toolbar: boolean;
  fieldPanel: boolean;
  fieldTree: boolean;
}

export interface SettingsContentProps {
  viewConfig: ViewConfig;
  dispatch: Dispatch<ViewConfigAction>;
  /** 面板可见性 — caller 持有 state(localStorage 持久化) */
  panelVisibility: PanelVisibility;
  /** 切某面板 — caller 实现具体改 state 逻辑 */
  onTogglePanel: (key: keyof PanelVisibility, next: boolean) => void;
  /** adhoc 模式:某些选项要 disabled(如冻结行头、压缩空列、树状模式) */
  isAdhoc: boolean;
}

const EMPTY_VALUE_OPTIONS = [
  { value: '', label: '空白(默认)' },
  { value: '-', label: '-' },
  { value: '——', label: '——' },
  { value: '0', label: '0' },
  { value: '无数据', label: '无数据' },
  { value: '__custom__', label: '自定义...' },
];

function getEmptyValuePreset(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  if (value === '-' || value === '0' || value === '无数据' || value === '——') return value;
  return '__custom__';
}

export function SettingsContent({
  viewConfig,
  dispatch,
  // panelVisibility / onTogglePanel 保留(SettingsModal API 向后兼容)— UI 已删,本组件不解构
  isAdhoc,
}: SettingsContentProps): ReactNode {
  return (
    <div className="settings-modal__body" data-testid="settings-content">
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

      {/*
       * P5+ 全表总计 / 小计位置 — 跟 chip 菜单的"显示合计/小计"语义不同:
       *   - chip 菜单"合计/小计"= 某 dim field 的 per-field subtotal
       *     (后端 fields[N].DimensionField.subTotal='SHOW')
       *   - 这里的"全表总计"= 跨所有维度的总汇总行/列
       *     (后端 pageSettings.showGrandTotal)
       *   - 这里的"小计位置"= 控制小计行在每组的位置(开头 / 末尾)
       *     (后端 pageSettings.subTotalAtEnd)
       * adhoc 无合计概念 → buildAdhocQuery 强制 false,这里 disable
       */}
      <label
        className="settings-modal__row"
        data-testid="settings-showGrandTotal"
        data-disabled={isAdhoc ? 'true' : undefined}
        title={isAdhoc ? '即席查询(明细)模式下不生效' : '在表末显示跨全部维度的总汇总行/列'}
      >
        <input
          type="checkbox"
          checked={viewConfig.pageState.showGrandTotal !== false}
          disabled={isAdhoc}
          onChange={(e) =>
            dispatch({ type: 'SET_TOTALS', showGrandTotal: e.target.checked })
          }
        />
        <span>显示全表总计(行末 + 列末各一行/一列汇总)</span>
      </label>

      <div
        className="settings-modal__row settings-modal__row--input"
        data-testid="settings-subTotalAtEnd"
        data-disabled={isAdhoc ? 'true' : undefined}
        title={isAdhoc ? '即席查询(明细)模式下不生效' : '小计行在每组的位置'}
      >
        <span>小计位置</span>
        <div className="settings-modal__btn-group" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={viewConfig.pageState.subTotalAtEnd !== false}
            className="settings-modal__mode-btn"
            data-active={
              viewConfig.pageState.subTotalAtEnd !== false ? 'true' : 'false'
            }
            data-testid="settings-subTotalAtEnd-end"
            disabled={isAdhoc}
            onClick={() => dispatch({ type: 'SET_TOTALS', subTotalAtEnd: true })}
          >
            每组末尾
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={viewConfig.pageState.subTotalAtEnd === false}
            className="settings-modal__mode-btn"
            data-active={
              viewConfig.pageState.subTotalAtEnd === false ? 'true' : 'false'
            }
            data-testid="settings-subTotalAtEnd-start"
            disabled={isAdhoc}
            onClick={() => dispatch({ type: 'SET_TOTALS', subTotalAtEnd: false })}
          >
            每组开头
          </button>
        </div>
      </div>

      {/* P3+ 空值显示文本 — 下拉预设 + 自定义输入 */}
      <div
        className="settings-modal__row settings-modal__row--input"
        data-testid="settings-emptyValueText"
      >
        <span>空值显示</span>
        <div className="settings-modal__field-control settings-modal__field-control--empty-value">
          <SelectMenu
            ariaLabel="空值显示预设"
            testId="settings-emptyValueText"
            className="settings-modal__select"
            value={getEmptyValuePreset(viewConfig.pageState.emptyValueText)}
            options={EMPTY_VALUE_OPTIONS}
            onChange={(next) => {
              if (next === '__custom__') return;
              dispatch({
                type: 'SET_DISPLAY_OPTIONS',
                emptyValueText: next === '' ? '' : next,
              });
            }}
          />
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
      </div>

      {/* 2026-05-16:"面板显示"行删了 — 用户在"设置"tab 里语境上必然显示着字段面板,
          再开/关字段面板/字段树自相矛盾;工具栏/字段树各自的"×"按钮已能收起,
          隐藏后还有 edge-handle 重新展开,这个集中开关冗余。 */}

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
  );
}
