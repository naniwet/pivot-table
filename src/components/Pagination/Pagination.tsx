/**
 * Pagination — 翻页器（P1.0：行/列两轴 + 页大小选择 + 跳转指定页）
 *
 * 设计：
 *   - 1-based 页号（与后端 pageSettings.rowPageNo / columnPageNo 对齐）
 *   - totalPages = ⌈total / pageSize⌉，≤1 时不渲染
 *   - 页大小选项 + 跳转输入框为 P1.0 增量
 *
 * P1.5+：列宽手动调整、视图保存等
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export interface PaginationProps {
  /** 1-based 页号 */
  currentPage: number;
  pageSize: number;
  /** 总行/列数（行轴用 totalRowCount，列轴用 totalColumnCount） */
  total: number;
  onPageChange: (pageNo: number) => void;
  /** P1.0：页大小切换（不传则不显示选择器） */
  onPageSizeChange?: (size: number) => void;
  /** 可选页大小选项，默认 [10, 20, 50, 100] */
  pageSizeOptions?: number[];
  /** 轴标识（用于 testid 区分行/列翻页器，默认 'row'） */
  axis?: 'row' | 'column';
  /** P3 设置面板:是否显示"共 N 条"总数文字。默认 true */
  showTotal?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Pagination({
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  axis = 'row',
  showTotal = true,
  className,
  style,
}: PaginationProps): ReactNode {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const [jumpInput, setJumpInput] = useState('');

  if (totalPages <= 1 && !onPageSizeChange) return null;

  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;

  const tid = (s: string) => `pagination-${axis === 'row' ? '' : axis + '-'}${s}`;

  const handleJump = () => {
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onPageChange(Math.min(n, totalPages));
    setJumpInput('');
  };

  return (
    <div className={className ? `pagination ${className}` : 'pagination'} style={style}>
      <button
        type="button"
        data-testid={tid('prev')}
        className="pagination-prev"
        disabled={atFirst}
        onClick={() => {
          if (!atFirst) onPageChange(currentPage - 1);
        }}
      >
        上一页
      </button>
      <span data-testid={tid('info')} className="pagination-info">
        {currentPage} / {totalPages}
        {showTotal && total > 0 && (
          <span
            className="pagination-total"
            data-testid={tid('total')}
          >
            (共 {total.toLocaleString('en-US')} 条)
          </span>
        )}
      </span>
      <button
        type="button"
        data-testid={tid('next')}
        className="pagination-next"
        disabled={atLast}
        onClick={() => {
          if (!atLast) onPageChange(currentPage + 1);
        }}
      >
        下一页
      </button>
      {onPageSizeChange && (
        <select
          data-testid={tid('size')}
          className="pagination-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}/页
            </option>
          ))}
        </select>
      )}
      {totalPages > 1 && (
        <span className="pagination-jump">
          跳到
          <input
            type="number"
            min={1}
            max={totalPages}
            data-testid={tid('jump-input')}
            className="pagination-jump-input"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJump();
            }}
            style={{ width: 50 }}
          />
          <button
            type="button"
            data-testid={tid('jump-go')}
            className="pagination-jump-go"
            onClick={handleJump}
          >
            页
          </button>
        </span>
      )}
    </div>
  );
}
