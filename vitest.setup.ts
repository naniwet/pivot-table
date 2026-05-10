import '@testing-library/jest-dom/vitest';

// jsdom 不实现 ResizeObserver — ChartRenderer 用它来响应容器尺寸变化
// 测试里 stub 成 no-op 即可(不需要真触发 resize)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
