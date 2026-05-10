/**
 * ChartRenderer — 图表渲染器(P3+)
 *
 * 设计:
 *   - 接收 ChartData(buildChartSeries 输出),映射为 echarts option
 *   - **dynamic import echarts**:用户切到图表才加载,主 bundle 不含 echarts(700KB)
 *   - echarts 是 peer 可选依赖:宿主未装 → 显示提示,不 crash
 *   - ResizeObserver 自动适配容器尺寸
 *   - 复用 PivotRenderer 的状态:loading / error / 空数据
 *
 * 不做(MVP):
 *   - 图表元素点击钻取(P4+ 加,需要 cell 反查)
 *   - 自定义颜色 / 标题 / 图例位置(用 echarts 默认色板)
 *   - 双 Y 轴 / 组合图
 *   - 导出 PNG(echarts 自带 getDataURL,后续 5 行加)
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { ChartData } from '../../core/chart/buildChartSeries.js';
import { chartDataToEChartsOption } from '../../core/chart/chartDataToEChartsOption.js';

/**
 * echarts 类型 — 仅在动态 import 后使用,这里用 unknown 占位避免编译期硬依赖
 * (peer optional 时若宿主未装,build 仍能过)
 */
type EChartsModule = typeof import('echarts');
type EChartsInstance = ReturnType<EChartsModule['init']>;

export interface ChartRendererProps {
  data: ChartData;
  loading?: boolean;
  error?: Error | null;
  /** 高度(默认 400px);宽度跟随容器 */
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function ChartRenderer({
  data,
  loading = false,
  error = null,
  height = 400,
  className,
  style,
}: ChartRendererProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EChartsInstance | null>(null);
  const [echartsModule, setEchartsModule] = useState<EChartsModule | null>(null);
  const [importError, setImportError] = useState<Error | null>(null);

  // dynamic import echarts(只在 mount 时一次)
  useEffect(() => {
    let cancelled = false;
    import('echarts')
      .then((m) => {
        if (!cancelled) setEchartsModule(m);
      })
      .catch((err) => {
        if (!cancelled) {
          setImportError(
            err instanceof Error
              ? err
              : new Error(
                  '加载 echarts 失败 — 请确认已 npm install echarts(图表组件 peer 依赖)',
                ),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // init / update echarts instance
  useEffect(() => {
    if (!echartsModule || !containerRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = echartsModule.init(containerRef.current);
    }
    instanceRef.current.setOption(chartDataToEChartsOption(data), true);
  }, [echartsModule, data]);

  // ResizeObserver 自动适配容器尺寸
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      instanceRef.current?.resize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 卸载时销毁 instance(防内存泄漏)
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  // 状态分支:错误/加载/echarts 未就绪/空数据/正常
  if (importError) {
    return (
      <div
        className={className ? `chart-renderer ${className}` : 'chart-renderer'}
        style={wrapperStyle}
        data-testid="chart-renderer-import-error"
      >
        <div className="chart-renderer__error">
          ⚠️ {importError.message}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={className ? `chart-renderer ${className}` : 'chart-renderer'}
        style={wrapperStyle}
        data-testid="chart-renderer-error"
      >
        <div className="chart-renderer__error">⚠️ {error.message}</div>
      </div>
    );
  }

  // 空数据判断:bar/line 看 series.data 全空;pie 看 series 长度
  const isEmpty =
    data.type === 'pie'
      ? data.series.length === 0
      : data.xAxis.length === 0 || data.series.every((s) => s.data.every((v) => v === null));

  return (
    <div
      className={className ? `chart-renderer ${className}` : 'chart-renderer'}
      style={wrapperStyle}
      data-testid="chart-renderer"
      data-chart-type={data.type}
    >
      {loading && (
        <div className="chart-renderer__overlay" data-testid="chart-renderer-loading">
          加载中…
        </div>
      )}
      {!echartsModule && !importError && (
        <div className="chart-renderer__overlay" data-testid="chart-renderer-loading-lib">
          加载图表库…
        </div>
      )}
      {echartsModule && isEmpty && (
        <div className="chart-renderer__empty" data-testid="chart-renderer-empty">
          暂无数据
        </div>
      )}
      <div
        ref={containerRef}
        className="chart-renderer__canvas"
        style={{ width: '100%', height: '100%' }}
        data-testid="chart-renderer-canvas"
      />
    </div>
  );
}
