/**
 * ModelPickerButton — 工具栏按钮:显示当前数据模型名,点击弹出 ModelPicker
 *
 * 放在主界面工具栏 trailing 槽(挨着 SmartbiConfigManager),让"切模型"成为高频主路径,
 * 不必每次进 编辑配置 表单。
 *
 * 联动:
 *   - 用 active config 构造的 client(走 /proxy/<configId>/smartbix,同源,无 401)
 *   - 选完调 onPick → 父组件 PUT /api/configs/:id 更新 modelId/modelName → metadata 自动重拉
 *
 * 边界状态:
 *   - 没 active config(client=null)→ 按钮 disabled,提示"请先选配置"
 *   - active config 还没填 modelId → 按钮显示"📊 选择数据模型…"
 */
import { useState } from 'react';

import { ModelPicker, type PickedModel } from './ModelPicker.js';
import type { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';

export interface ModelPickerButtonProps {
  client: SmartbiClient | null;
  currentModelId: string;
  currentModelName?: string;
  onPick: (model: PickedModel) => void;
  /** UI 提示:没 client 时 hover 显示 */
  noClientHint?: string;
}

export function ModelPickerButton({
  client,
  currentModelId,
  currentModelName,
  onPick,
  noClientHint = '请先选一个 Smartbi 配置',
}: ModelPickerButtonProps) {
  const [open, setOpen] = useState(false);

  // 只显示别名;没别名(老 config / 手填 ID)显示占位"未命名模型",绝不暴露 id
  const display = currentModelName
    ? `📊 ${currentModelName}`
    : currentModelId
      ? '📊 未命名模型'
      : '📊 选择数据模型…';

  return (
    <>
      <button
        type="button"
        className="model-picker-btn"
        onClick={() => client && setOpen(true)}
        disabled={!client}
        title={
          !client
            ? noClientHint
            : currentModelName || (currentModelId ? '未命名模型(点击重新选择以获取别名)' : '选择数据模型')
        }
        data-testid="model-picker-button"
      >
        <span className="model-picker-btn__label">{display}</span>
        <span className="model-picker-btn__chevron" aria-hidden>
          ⌄
        </span>
      </button>
      {open && client && (
        <ModelPicker
          client={client}
          initialModelId={currentModelId || undefined}
          onPick={(m) => {
            onPick(m);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
