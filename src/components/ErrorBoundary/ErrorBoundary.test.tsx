/**
 * ErrorBoundary 测试 — 不变量:
 *   I1. 子树正常 → 透传 children
 *   I2. 子树抛错 → 显示 fallback;错误对象传给 onError
 *   I3. SmartbiError 走 messageZh / hint / code 字段
 *   I4. reset → 子树重 mount(传 stable children 时不再抛)
 *   I5. host fallback 自定义
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SmartbiError } from '../../types/error.js';

import { ErrorBoundary } from './ErrorBoundary.js';

function Boom({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="boom-ok">recovered</div>;
}

function ThrowSmartbiError(): React.JSX.Element {
  throw new SmartbiError('[smartbi:executeQuery] 406 ...', {
    status: 406,
    code: 'TRANSIENT',
    messageZh: '后端反序列化失败',
    hint: '请刷新',
    op: 'executeQuery',
  });
}

describe('ErrorBoundary', () => {
  it('I1: 子树正常 → 透传', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('I2: 子树抛错 → 默认 fallback,onError 收到 error', () => {
    const onError = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary onError={onError}>
        <Boom shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]![0].message).toBe('boom');
    errSpy.mockRestore();
  });

  it('I3: SmartbiError 走 messageZh / hint / code', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowSmartbiError />
      </ErrorBoundary>,
    );
    expect(screen.getByText('后端反序列化失败')).toBeInTheDocument();
    expect(screen.getByText('请刷新')).toBeInTheDocument();
    expect(screen.getByText(/TRANSIENT/)).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('I4: reset → 重试,子树重 mount;父级把 shouldThrow 切 false 后 fallback 退出', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Wrapper() {
      return (
        <ErrorBoundary>
          <Boom shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }
    const { rerender } = render(<Wrapper />);
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    // 父修复完毕后(常见模式:外部状态变化让 children 不再抛)+ 用户 reset
    shouldThrow = false;
    rerender(<Wrapper />);
    fireEvent.click(screen.getByTestId('error-boundary-reset'));
    expect(screen.getByTestId('boom-ok')).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('I5: host 自定 fallback', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div data-testid="custom-fallback">
            <span>{error.message}</span>
            <button onClick={reset}>my-reset</button>
          </div>
        )}
      >
        <Boom shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toHaveTextContent('boom');
    errSpy.mockRestore();
  });
});
