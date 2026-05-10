/**
 * DetailModal 组件测试
 *
 * 范围:
 *   - 加载中 / 错误 / 空 / 数据 4 种状态分支
 *   - Esc / 点 overlay 空白处 / 点 × 关闭
 *   - onQuery 收到传入的 query
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CellSet } from '../../types/cellSet.js';
import type { Query } from '../../types/query.js';

import { DetailModal } from './DetailModal.js';

const fakeQuery: Query = {
  modelId: 'm',
  queryType: 'DetailQuery',
  rows: [],
  columns: [],
  fields: [],
  filters: [],
  dimensionFilter: null,
  measureFilters: [],
  rowSorts: [],
  columnSorts: [],
  pageSettings: {
    rowPageNo: 1,
    rowPageSize: 10000,
    columnPageNo: 1,
    columnPageSize: 10000,
  },
  customElements: [],
};

function makeCellSet(rows: string[][], colNames: string[]): CellSet {
  return {
    rowFields: [],
    columnFields: [],
    columnMetadataArray: colNames.map((name) => ({
      name,
      alias: name,
      valueType: 'STRING',
      dataFormat: '',
      maskingRuleIdList: [],
      accessible: true,
    })),
    rows: rows.map((row) =>
      row.map((cell, i) => ({
        name: cell,
        uniqueName: [cell],
        level: 'L',
        dimension: 'D',
        fieldName: colNames[i] ?? '',
      })),
    ),
    columns: [],
    data: [],
    fieldNameToUniqueId: {},
    totalRowCount: rows.length,
  };
}

describe('DetailModal — 状态分支', () => {
  it('loading → 显示 加载中', () => {
    const onQuery = vi.fn(() => new Promise<CellSet>(() => {})); // never resolve
    render(<DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />);
    expect(screen.getByTestId('detail-modal-loading')).toBeInTheDocument();
  });

  it('error → 显示错误信息', async () => {
    const onQuery = vi.fn().mockRejectedValue(new Error('网络挂了'));
    render(<DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('detail-modal-error')).toHaveTextContent('网络挂了'),
    );
  });

  it('空 cellSet → 显示 暂无明细数据', async () => {
    const onQuery = vi.fn().mockResolvedValue(makeCellSet([], ['字段A']));
    render(<DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('detail-modal-empty')).toBeInTheDocument(),
    );
  });

  it('数据 → 渲染 table 含列头 + 数据行 + 行数显示', async () => {
    const cs = makeCellSet(
      [
        ['江苏', '南京'],
        ['浙江', '杭州'],
      ],
      ['省', '市'],
    );
    const onQuery = vi.fn().mockResolvedValue(cs);
    render(<DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('detail-modal-table')).toBeInTheDocument(),
    );
    expect(screen.getByText('省')).toBeInTheDocument();
    expect(screen.getByText('市')).toBeInTheDocument();
    expect(screen.getByText('江苏')).toBeInTheDocument();
    expect(screen.getByText('杭州')).toBeInTheDocument();
    // 标题 "(2 行)"
    expect(screen.getByText(/2 行/)).toBeInTheDocument();
  });
});

describe('DetailModal — 关闭路径', () => {
  it('点 × 按钮 → onClose', async () => {
    const onClose = vi.fn();
    render(
      <DetailModal query={fakeQuery} onQuery={() => new Promise(() => {})} onClose={onClose} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('detail-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点 overlay 空白处 → onClose;点 modal 内部不关', async () => {
    const onClose = vi.fn();
    render(
      <DetailModal query={fakeQuery} onQuery={() => new Promise(() => {})} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('detail-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // 点 modal 内部不关
    onClose.mockClear();
    fireEvent.click(screen.getByTestId('detail-modal-loading'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc 关闭', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailModal query={fakeQuery} onQuery={() => new Promise(() => {})} onClose={onClose} />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DetailModal — fetch', () => {
  it('mount 时调用 onQuery,传入 query', async () => {
    const onQuery = vi.fn().mockResolvedValue(makeCellSet([], []));
    render(<DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />);
    await waitFor(() => expect(onQuery).toHaveBeenCalled());
    expect(onQuery.mock.calls[0]![0]).toBe(fakeQuery);
  });

  it('unmount 时 abort signal 被触发(fetch 取消)', async () => {
    let aborted = false;
    const onQuery = vi.fn(
      (_q: Query, ctx: { signal: AbortSignal }) =>
        new Promise<CellSet>((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    );
    const { unmount } = render(
      <DetailModal query={fakeQuery} onQuery={onQuery} onClose={vi.fn()} />,
    );
    unmount();
    expect(aborted).toBe(true);
  });
});
