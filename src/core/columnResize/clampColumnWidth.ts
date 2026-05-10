/**
 * clampColumnWidth — 列宽 clamp 纯函数
 *
 * 防御 NaN / 负数 / 浮点 sub-pixel
 * 默认范围 [40, 800] 覆盖 BI 表格常见列宽
 */

export interface ClampOptions {
  min?: number;
  max?: number;
}

export function clampColumnWidth(width: number, options: ClampOptions = {}): number {
  const min = options.min ?? 40;
  const max = options.max ?? 800;
  if (!Number.isFinite(width)) return min;
  const rounded = Math.round(width);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}
