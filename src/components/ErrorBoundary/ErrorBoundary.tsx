/**
 * ErrorBoundary — 捕获子树渲染错误,显示 fallback UI 而不是白屏
 *
 * 不替代:
 *   - SmartbiError 业务错误流(usePivotQuery / useTreeQueries 自己处理 + 显示 retry banner)
 *   - 单纯的网络错误
 *
 * 替代:
 *   - parseCellSet 抛错(后端返回 schema 不匹配)
 *   - render 时引用 undefined / 类型错(代码 bug)
 *
 * 默认 fallback 显示错误消息 + 重试按钮(reset state 让子树重 mount);
 * 宿主可自定 fallback 渲染 + onError 上报错误日志。
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { isSmartbiError } from '../../types/error.js';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定 fallback;不传走默认 banner */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** 错误上报 hook(host 接 Sentry / 自家日志) */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // 默认也 console.error,host 没传 onError 时仍能 debug
    if (!this.props.onError) {
      // eslint-disable-next-line no-console
      console.error('[PivotTable ErrorBoundary]', error, info);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }): ReactNode {
  // SmartbiError 有 messageZh / hint 字段,显示更友好;否则退化到 message
  const isSbi = isSmartbiError(error);
  const messageZh = isSbi ? error.messageZh : error.message;
  const hint = isSbi ? error.hint : undefined;
  const code = isSbi ? error.code : null;

  return (
    <div className="error-boundary" role="alert" data-testid="error-boundary-fallback">
      <div className="error-boundary__icon" aria-hidden>
        ⚠
      </div>
      <div className="error-boundary__content">
        <div className="error-boundary__title">页面渲染出错</div>
        <div className="error-boundary__message">{messageZh}</div>
        {hint && <div className="error-boundary__hint">{hint}</div>}
        {code && (
          <div className="error-boundary__code" aria-label="错误代码">
            错误代码:{code}
          </div>
        )}
        <button
          type="button"
          className="error-boundary__reset"
          data-testid="error-boundary-reset"
          onClick={reset}
        >
          重试
        </button>
      </div>
    </div>
  );
}
