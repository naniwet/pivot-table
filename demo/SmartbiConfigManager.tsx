/**
 * Smartbi 配置管理 UI — 仅 demo 用(GitHub-style picker)
 *
 * 范围:
 *   - 顶部"上下文条":单个组合按钮"🌐 <当前配置名> ⌄"显示当前激活的环境
 *   - 点击 → 弹出 popover:
 *       · 配置列表(每条:radio + 名字 + 编辑/删除图标)
 *       · 分隔线
 *       · "+ 新增配置" 按钮
 *       · 底部小字:当前激活的 baseUrl(用户确认连对了哪)
 *   - 新增/编辑 → 弹出表单 modal(name/baseUrl/token/modelId 4 字段)
 *   - 点外部 / Esc 关 popover
 *
 * 设计:
 *   - bar 高度 32px,跟 PivotTable toolbar 风格统一(浅灰底,bottom border)
 *   - 全部样式走 index.html 的 .config-bar* / .config-popover* class,组件不用内联 style
 *   - popover 用 absolute 定位贴在按钮下方;不引第三方 popover lib
 *   - 表单 modal 仍是 backdrop + dialog
 */
import { useEffect, useRef, useState } from 'react';

export interface SmartbiConfig {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  modelId: string;
  /** 选模型时记下的展示名(aliasPath),只为 UI 显示,不参与请求 */
  modelName?: string;
}

type DraftConfig = Omit<SmartbiConfig, 'id'>;

const EMPTY_DRAFT: DraftConfig = { name: '', baseUrl: '', token: '', modelId: '', modelName: '' };

interface Props {
  configs: SmartbiConfig[];
  activeId: string | null;
  onActiveChange: (id: string) => void;
  onConfigsChange: (next: SmartbiConfig[]) => void;
}

export function SmartbiConfigManager({
  configs,
  activeId,
  onActiveChange,
  onConfigsChange,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  // form modal:editingId 为 null = 新增;为 id = 编辑该 config
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftConfig>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const active = configs.find((c) => c.id === activeId) ?? null;

  // popover 外部点击 / Esc 关闭
  useEffect(() => {
    if (!popoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
        setPopoverOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  // form modal:Esc 关闭(form 优先)
  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFormOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [formOpen]);

  async function refreshConfigs(): Promise<SmartbiConfig[]> {
    const res = await fetch('/api/configs');
    if (!res.ok) throw new Error(`GET /api/configs ${res.status}`);
    const list = (await res.json()) as SmartbiConfig[];
    onConfigsChange(list);
    return list;
  }

  function openCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setPopoverOpen(false);
    setFormOpen(true);
  }

  function openEdit(c: SmartbiConfig) {
    setEditingId(c.id);
    setDraft({
      name: c.name,
      baseUrl: c.baseUrl,
      token: c.token,
      modelId: c.modelId,
      modelName: c.modelName ?? '',
    });
    setError(null);
    setPopoverOpen(false);
    setFormOpen(true);
  }

  async function submitDraft() {
    setError(null);
    if (!draft.name.trim()) return setError('请填写名称');
    if (!draft.baseUrl.trim()) return setError('请填写 Base URL');

    setBusy(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/configs/${editingId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`PUT /api/configs/${editingId} ${res.status}`);
      } else {
        const res = await fetch('/api/configs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`POST /api/configs ${res.status}`);
        const created = (await res.json()) as SmartbiConfig;
        onActiveChange(created.id); // 新建后自动激活
      }
      await refreshConfigs();
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteConfig(id: string) {
    if (!confirm('确认删除这个配置?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/configs/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        throw new Error(`DELETE /api/configs/${id} ${res.status}`);
      }
      const list = await refreshConfigs();
      if (id === activeId && list.length > 0) onActiveChange(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-bar" ref={wrapperRef}>
      <button
        type="button"
        className="config-bar__current"
        data-testid="smartbi-config-trigger"
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        onClick={() => setPopoverOpen((v) => !v)}
      >
        <span className="config-bar__icon" aria-hidden>
          🌐
        </span>
        <span className="config-bar__name" data-testid="smartbi-config-active-name">
          {active ? active.name : '未配置'}
        </span>
        <span className="config-bar__chevron" aria-hidden>
          ⌄
        </span>
      </button>

      {popoverOpen && (
        <div
          className="config-popover"
          role="menu"
          data-testid="smartbi-config-popover"
        >
          <ul className="config-popover__list">
            {configs.length === 0 && (
              <li className="config-popover__empty">暂无配置,点击下方"新增"创建</li>
            )}
            {configs.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li
                  key={c.id}
                  className="config-popover__item"
                  data-active={isActive ? 'true' : 'false'}
                  data-testid={`config-row-${c.id}`}
                >
                  <button
                    type="button"
                    className="config-popover__item-pick"
                    onClick={() => {
                      onActiveChange(c.id);
                      setPopoverOpen(false);
                    }}
                    title={c.baseUrl}
                  >
                    <span className="config-popover__check" aria-hidden>
                      {isActive ? '✓' : ''}
                    </span>
                    <span className="config-popover__item-text">
                      <span className="config-popover__item-name">{c.name}</span>
                      <span className="config-popover__item-meta">{c.baseUrl}</span>
                    </span>
                  </button>
                  <div className="config-popover__item-actions">
                    <button
                      type="button"
                      className="config-popover__icon-btn"
                      onClick={() => openEdit(c)}
                      title="编辑"
                      aria-label="编辑"
                      data-testid={`config-edit-${c.id}`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="config-popover__icon-btn config-popover__icon-btn--danger"
                      onClick={() => deleteConfig(c.id)}
                      disabled={busy}
                      title="删除"
                      aria-label="删除"
                      data-testid={`config-delete-${c.id}`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="config-popover__divider" />
          <button
            type="button"
            className="config-popover__add"
            onClick={openCreate}
            data-testid="smartbi-config-add"
          >
            <span aria-hidden>+</span> 新增配置
          </button>
          {active && (
            <div className="config-popover__footer" title={active.baseUrl}>
              连到 → {active.baseUrl}
              {active.modelName && (
                <div className="config-popover__model" title={active.modelId}>
                  📊 {active.modelName}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div
          className="config-modal__backdrop"
          onMouseDown={() => setFormOpen(false)}
          role="presentation"
        >
          <div
            className="config-modal__dialog"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-testid="smartbi-config-form"
          >
            <h3 className="config-modal__title">{editingId ? '编辑配置' : '新增配置'}</h3>
            {error && <div className="config-modal__error">{error}</div>}
            <FormField label="名称">
              <input
                type="text"
                className="config-modal__input"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="如: 测试环境 1"
                data-testid="form-name"
                autoFocus
              />
            </FormField>
            <FormField
              label="Base URL"
              hint="只到 Smartbi context root,后面的 /smartbix 由代码自动拼"
            >
              <input
                type="text"
                className="config-modal__input"
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                placeholder="http://host:port/smartbi"
                data-testid="form-baseurl"
              />
            </FormField>
            <FormField label="Token">
              <input
                type="text"
                className="config-modal__input"
                value={draft.token}
                onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
                placeholder="st_xxx"
                data-testid="form-token"
              />
            </FormField>
            <FormField
              label="数据模型 ID"
              hint="可留空 — 保存后在主界面顶部的 📊 按钮里浏览资源目录选模型"
            >
              <input
                type="text"
                className="config-modal__input"
                value={draft.modelId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, modelId: e.target.value, modelName: '' }))
                }
                placeholder="(可选)I8a8aa3ed018ff..."
                data-testid="form-modelid"
              />
              {draft.modelName && (
                <div className="config-modal__model-name" data-testid="form-modelname">
                  当前已选:{draft.modelName}
                </div>
              )}
            </FormField>
            <div className="config-modal__footer">
              <button
                type="button"
                className="config-modal__btn"
                onClick={() => setFormOpen(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className="config-modal__btn config-modal__btn--primary"
                onClick={submitDraft}
                disabled={busy}
                data-testid="form-submit"
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="config-modal__field">
      <label className="config-modal__label">{label}</label>
      <div className="config-modal__field-body">
        {children}
        {hint && <div className="config-modal__hint">{hint}</div>}
      </div>
    </div>
  );
}
