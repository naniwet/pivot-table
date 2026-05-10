/**
 * MemberSelector — 成员选择器（P1.5）
 *
 * 用途：In/NotIn operator 的多选 value 输入。
 *
 * 设计要点：
 *   - DI loadMembers — 组件不感知 Smartbi、不感知 metadata 字段名
 *     宿主在 PivotTable.props.loadMembers 里把 field → 调 executeQuery 转换
 *   - 加载/错误/重试自管，UX 一致（与 usePivotQuery 错误 banner 风格类似）
 *   - 搜索是前端过滤；成员集 < 1k 时浏览器原生足够
 *
 * 不做：
 *   - 虚拟滚动（成员集小）
 *   - 服务端搜索（成员集小）
 *   - 多列分组（YAGNI）
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

export interface MemberSelectorProps {
  /** 异步加载该字段的全部 distinct 成员（host-injected） */
  loadMembers: () => Promise<string[]>;
  /** 初始已选成员名列表 */
  selected: string[];
  onApply: (selected: string[]) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export function MemberSelector({
  loadMembers,
  selected: initialSelected,
  onApply,
  onClose,
  className,
  style,
}: MemberSelectorProps): ReactNode {
  const [members, setMembers] = useState<string[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  // 重试用 token：递增触发 effect 重新跑
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMembers(null);
    setError(null);
    loadMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [loadMembers, reloadToken]);

  const filtered = useMemo(() => {
    if (!members) return [];
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter((m) => m.toLowerCase().includes(q));
  }, [members, search]);

  const toggle = (m: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const selectAll = () => {
    if (!members) return;
    setSelected(new Set(members));
  };
  const clearAll = () => setSelected(new Set());

  const apply = () => {
    // 保留原始顺序：以 members 顺序输出，避免 Set 迭代顺序的歧义
    const ordered = (members ?? []).filter((m) => selected.has(m));
    onApply(ordered);
    onClose();
  };

  return (
    <div
      className={className ? `member-selector-overlay ${className}` : 'member-selector-overlay'}
      role="dialog"
      aria-modal="true"
      data-testid="member-selector"
      style={style}
    >
      <div className="member-selector">
        <div className="member-selector__header">
          <input
            type="search"
            className="member-selector__search"
            data-testid="member-selector-search"
            placeholder="搜索成员..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="member-selector__quick">
            <button
              type="button"
              data-testid="member-selector-select-all"
              onClick={selectAll}
            >
              全选
            </button>
            <button type="button" data-testid="member-selector-clear-all" onClick={clearAll}>
              清空
            </button>
          </div>
        </div>
        <div className="member-selector__body">
          {members === null && error === null && (
            <div className="member-selector__loading" data-testid="member-selector-loading">
              加载中...
            </div>
          )}
          {error !== null && (
            <div className="member-selector__error" data-testid="member-selector-error">
              加载失败：{error.message}
              <button
                type="button"
                className="member-selector__retry"
                data-testid="member-selector-retry"
                onClick={() => setReloadToken((t) => t + 1)}
              >
                重试
              </button>
            </div>
          )}
          {members !== null && error === null && (
            <ul className="member-selector__list">
              {filtered.map((m) => (
                <li key={m} className="member-selector__item">
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(m)}
                      onChange={() => toggle(m)}
                    />
                    {m}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="member-selector__empty">无匹配成员</li>
              )}
            </ul>
          )}
        </div>
        <div className="member-selector__footer">
          <span className="member-selector__count">已选 {selected.size}</span>
          <div className="member-selector__actions">
            <button
              type="button"
              className="member-selector__cancel"
              data-testid="member-selector-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="member-selector__apply"
              data-testid="member-selector-apply"
              onClick={apply}
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
