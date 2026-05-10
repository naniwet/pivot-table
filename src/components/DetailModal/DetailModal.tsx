/**
 * DetailModal — 明细查看 modal(P3+)
 *
 * 设计:
 *   - 接收 detailQuery(已 build 好) + onQuery(同 PivotTable 的 query 通道)
 *   - 内部 fetch 一次,渲染清单视图(无聚合的明细行表格)
 *   - 简单 table:列 = cellSet.columns 推断的字段名;行 = cellSet.rows tuple 的 member.name
 *   - 状态:loading / error / 空数据 / 数据
 *   - 关闭:点 overlay 空白处 / × 按钮 / Esc(modal 通用)
 *
 * 不做(MVP):
 *   - 列宽调整 / 排序 / 翻页 / CSV 导出(沿用 PivotTable 主表的 csv 即可,但明细数据
 *     形态后端联调后再加)
 *   - 复杂的 dataFormat / 脱敏渲染(等真实联调数据形态确认)
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { CellSet } from '../../types/cellSet.js';
import type { Query } from '../../types/query.js';

export interface DetailModalProps {
  /** 已 build 好的 DetailQuery(由 buildDetailQuery 输出) */
  query: Query;
  /** 数据通道 — 通常复用 PivotTable 的同一个 onQuery */
  onQuery: (query: Query, ctx: { signal: AbortSignal }) => Promise<CellSet>;
  onClose: () => void;
  /**
   * P3+ 当前查询条件摘要(chip 数组),在标题下方显示让用户知道"我在看哪个切片"
   *   - 单元格右键场景:行/列成员路径 chip(如 "销售_年: 2023")
   *   - 维度过滤非空:加一条"维度过滤(N 条)"chip 提示
   *   - 不传 / 空数组 → 不渲染 chip 行(整体明细无条件)
   */
  contextChips?: string[];
  className?: string;
  style?: CSSProperties;
}

/** 把 cellSet 推一个简易的列名数组(用 columnMetadataArray 的 alias 作头) */
function deriveDetailColumns(cellSet: CellSet | null): string[] {
  if (!cellSet) return [];
  // 后端 DetailQuery 返回:columnMetadataArray 含所有要显示的字段
  return cellSet.columnMetadataArray.map((c) => c.alias || c.name);
}

/** 把 cellSet.rows 的 Member tuple 转成"该行各字段值"列表(对齐 columns) */
function deriveDetailRows(cellSet: CellSet | null): string[][] {
  if (!cellSet) return [];
  // 假设每个 row tuple 的 member 顺序对应 columnMetadataArray
  return cellSet.rows.map((tuple) => tuple.map((m) => m.name));
}

export function DetailModal({
  query,
  onQuery,
  onClose,
  contextChips,
  className,
  style,
}: DetailModalProps): ReactNode {
  const [cellSet, setCellSet] = useState<CellSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // fetch 一次(query 来自 props,通常 modal 生命周期内不变)
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    onQuery(query, { signal: controller.signal })
      .then((cs) => {
        if (controller.signal.aborted) return;
        setCellSet(cs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => controller.abort();
  }, [query, onQuery]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const columns = deriveDetailColumns(cellSet);
  const rows = deriveDetailRows(cellSet);

  return (
    <div
      ref={overlayRef}
      className={
        className ? `detail-modal-overlay ${className}` : 'detail-modal-overlay'
      }
      role="dialog"
      aria-modal="true"
      data-testid="detail-modal"
      style={style}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="detail-modal">
        <div className="detail-modal__header">
          <span className="detail-modal__title">
            明细数据
            {!loading && !error && cellSet && (
              <span className="detail-modal__count">
                ({rows.length.toLocaleString('en-US')} 行)
              </span>
            )}
          </span>
          <button
            type="button"
            className="detail-modal__close"
            data-testid="detail-modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {contextChips && contextChips.length > 0 && (
          <div className="detail-modal__chips" data-testid="detail-modal-chips">
            <span className="detail-modal__chips-label">条件:</span>
            {contextChips.map((chip, i) => (
              <span
                key={`chip-${i}`}
                className="detail-modal__chip"
                data-testid={`detail-modal-chip-${i}`}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="detail-modal__body">
          {loading && (
            <div className="detail-modal__state" data-testid="detail-modal-loading">
              加载中…
            </div>
          )}
          {!loading && error && (
            <div className="detail-modal__state detail-modal__state--error" data-testid="detail-modal-error">
              ⚠️ {error.message}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="detail-modal__state" data-testid="detail-modal-empty">
              暂无明细数据
            </div>
          )}
          {!loading && !error && rows.length > 0 && (
            <table className="detail-modal__table" data-testid="detail-modal-table">
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={`col-${i}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr key={`row-${r}`}>
                    {row.map((cell, c) => (
                      <td key={`cell-${r}-${c}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
