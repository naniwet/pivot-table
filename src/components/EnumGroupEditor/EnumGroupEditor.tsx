/**
 * EnumGroupEditor — 枚举分组编辑器（P2 §10.1）
 *
 * 最小可用版本（不引入拖序库）：
 *   - 左侧"未分组"区：成员复选 + 搜索
 *   - 右侧"分组"区：每个组显示成员；新建组按钮在底部
 *   - 选中成员后输入组名 + 点击"加入新组" → 创建组并把选中成员加入
 *   - 应用时输出 CustomEnumGroupField + ungroupedHandling
 *
 * 不做（YAGNI / 留 P3+）：
 *   - 单成员拖动到不同组
 *   - 内联组重命名
 *   - 组之间排序
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import type { CustomEnumGroupField } from '../../types/viewConfig.js';

export interface EnumGroupEditorProps {
  baseField: string;
  baseFieldAlias: string;
  loadMembers: () => Promise<string[]>;
  initialField?: CustomEnumGroupField;
  onApply: (field: CustomEnumGroupField) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

interface GroupRow {
  label: string;
  members: string[];
}

function genId(): string {
  return `eg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function EnumGroupEditor({
  baseField,
  baseFieldAlias,
  loadMembers,
  initialField,
  onApply,
  onClose,
  className,
  style,
}: EnumGroupEditorProps): ReactNode {
  const [name, setName] = useState(initialField?.name ?? '');
  const [allMembers, setAllMembers] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>(initialField?.groups ?? []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [ungroupedHandling, setUngroupedHandling] = useState<
    'show_individually' | 'merge_as_other'
  >(initialField?.ungroupedHandling ?? 'show_individually');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMembers()
      .then((list) => {
        if (!cancelled) setAllMembers(list);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [loadMembers]);

  // 已分组成员集合
  const groupedMembersSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const m of g.members) s.add(m);
    return s;
  }, [groups]);

  const ungroupedMembers = useMemo(() => {
    if (!allMembers) return [];
    const filtered = allMembers.filter((m) => !groupedMembersSet.has(m));
    if (!search.trim()) return filtered;
    const q = search.trim().toLowerCase();
    return filtered.filter((m) => m.toLowerCase().includes(q));
  }, [allMembers, groupedMembersSet, search]);

  const toggleSelected = (m: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const addGroup = () => {
    const label = newGroupName.trim();
    if (!label) return;
    if (groups.some((g) => g.label === label)) return;
    const members = Array.from(selected);
    setGroups((prev) => [...prev, { label, members }]);
    setSelected(new Set());
    setNewGroupName('');
    setError(null);
  };

  const removeGroup = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const apply = () => {
    if (!name.trim()) {
      setError('请输入字段名称');
      return;
    }
    if (groups.length === 0) {
      setError('至少创建 1 个组');
      return;
    }
    const cf: CustomEnumGroupField = {
      id: initialField?.id ?? genId(),
      name: name.trim(),
      kind: 'enum_group',
      baseField,
      groups,
      ungroupedHandling,
    };
    onApply(cf);
    onClose();
  };

  return (
    <div
      className={className ? `enum-editor-overlay ${className}` : 'enum-editor-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="enum-editor"
      style={style}
    >
      <div className="enum-editor">
        <div className="enum-editor__header">
          <span className="enum-editor__title">新建枚举分组</span>
          <span className="enum-editor__base">基于：{baseFieldAlias}</span>
        </div>
        <div className="enum-editor__name-row">
          <label>字段名称</label>
          <input
            type="text"
            data-testid="enum-editor-name"
            placeholder="例如：区域分组"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="enum-editor__body">
          <div className="enum-editor__col">
            <div className="enum-editor__col-title">未分组成员</div>
            <input
              type="search"
              className="enum-editor__search"
              placeholder="搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="enum-editor__list">
              {!allMembers && !loadError && (
                <div className="enum-editor__loading">加载中...</div>
              )}
              {loadError && (
                <div className="enum-editor__error" data-testid="enum-editor-load-error">
                  加载失败：{loadError.message}
                </div>
              )}
              {allMembers &&
                ungroupedMembers.map((m) => (
                  <label key={m} className="enum-editor__item">
                    <input
                      type="checkbox"
                      checked={selected.has(m)}
                      onChange={() => toggleSelected(m)}
                    />
                    {m}
                  </label>
                ))}
              {allMembers && ungroupedMembers.length === 0 && (
                <div className="enum-editor__empty">
                  {search ? '无匹配成员' : '所有成员已分组'}
                </div>
              )}
            </div>
          </div>
          <div className="enum-editor__col">
            <div className="enum-editor__col-title">已建分组</div>
            <div className="enum-editor__list">
              {groups.map((g, idx) => (
                <div
                  key={g.label}
                  className="enum-editor__group"
                  data-testid={`enum-editor-group-${g.label}`}
                >
                  <div className="enum-editor__group-header">
                    <span className="enum-editor__group-label">{g.label}</span>
                    <button
                      type="button"
                      className="enum-editor__group-remove"
                      data-testid={`enum-editor-group-remove-${g.label}`}
                      onClick={() => removeGroup(idx)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="enum-editor__group-members">
                    {g.members.map((m) => (
                      <span key={m} className="enum-editor__member-chip">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div className="enum-editor__empty">还没有分组</div>
              )}
            </div>
            <div className="enum-editor__add-group">
              <input
                type="text"
                placeholder="新分组名称"
                data-testid="enum-editor-new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <button
                type="button"
                data-testid="enum-editor-add-group"
                onClick={addGroup}
                disabled={!newGroupName.trim()}
                title={
                  selected.size === 0
                    ? '可创建空组（之后再添加成员）'
                    : `把选中的 ${selected.size} 个成员加入新组`
                }
              >
                + 加入新组
              </button>
            </div>
          </div>
        </div>
        <div className="enum-editor__handling">
          <span className="enum-editor__handling-label">未分组成员处理：</span>
          <label>
            <input
              type="radio"
              name="ungroupedHandling"
              checked={ungroupedHandling === 'show_individually'}
              onChange={() => setUngroupedHandling('show_individually')}
            />
            各自显示
          </label>
          <label>
            <input
              type="radio"
              name="ungroupedHandling"
              checked={ungroupedHandling === 'merge_as_other'}
              onChange={() => setUngroupedHandling('merge_as_other')}
            />
            归为"其他"组
          </label>
        </div>
        {error && (
          <div className="enum-editor__error" data-testid="enum-editor-error">
            ⚠️ {error}
          </div>
        )}
        <div className="enum-editor__footer">
          <button
            type="button"
            className="enum-editor__cancel"
            data-testid="enum-editor-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="enum-editor__apply"
            data-testid="enum-editor-apply"
            onClick={apply}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
