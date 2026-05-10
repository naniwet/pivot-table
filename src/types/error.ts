/**
 * SmartbiError — 后端 API 层错误的统一封装
 *
 * 用途:
 *   - SmartbiClient 把 HTTP 错误 + Smartbi 自定义 error envelope 包装成 SmartbiError 实例
 *   - 上层(usePivotQuery / useTreeQueries / 组件)用 instanceof 判断,根据 status / code 分类处理
 *   - 错误展示组件可读 messageZh / hint 给用户友好提示,而不是堆 stack trace
 *
 * 不变量:
 *   - extends Error → 现有 catch (err: Error) 继续 work
 *   - status / code / hint / op 是可选字段(后端响应不全时仍能构造)
 *   - originalDetail 保留后端响应原文(供 debug,不展示给用户)
 */

export type SmartbiErrorCode =
  /** Spring 反序列化失败 */
  | 'INVALID_REQUEST'
  /** 客户端 abort */
  | 'ABORTED'
  /** 网络失败 / 5xx / 后端可重试 */
  | 'TRANSIENT'
  /** 后端业务错误(如 SQL 语法 / 字段路径错) */
  | 'BUSINESS_ERROR'
  /** 鉴权失败(token 过期等) */
  | 'AUTH'
  /** 未分类 */
  | 'UNKNOWN';

export interface SmartbiErrorOptions {
  /** HTTP 状态码 */
  status?: number;
  /** 业务分类 */
  code?: SmartbiErrorCode;
  /** 中文用户友好消息(展示用);未提供时用 message */
  messageZh?: string;
  /** 给用户的下一步提示(如 "请刷新页面 / 检查 token") */
  hint?: string;
  /** 触发的操作名(executeQuery / fetchMetadata 等) */
  op?: string;
  /** 后端响应原文(JSON / text);仅 debug,不展示 */
  originalDetail?: string;
  /** 原始 cause */
  cause?: unknown;
}

export class SmartbiError extends Error {
  readonly status?: number;
  readonly code: SmartbiErrorCode;
  readonly messageZh: string;
  readonly hint?: string;
  readonly op?: string;
  readonly originalDetail?: string;

  constructor(message: string, opts: SmartbiErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SmartbiError';
    this.status = opts.status;
    this.code = opts.code ?? 'UNKNOWN';
    this.messageZh = opts.messageZh ?? message;
    this.hint = opts.hint;
    this.op = opts.op;
    this.originalDetail = opts.originalDetail;
  }
}

/** type guard */
export function isSmartbiError(err: unknown): err is SmartbiError {
  return err instanceof SmartbiError;
}

/**
 * 给渲染组件用 — 把任意 Error 转成「主消息 + 可选提示」两段文字。
 * SmartbiError 走 messageZh / hint;普通 Error 退回 message。
 */
export function formatErrorForDisplay(err: Error): {
  message: string;
  hint?: string;
  code?: string;
} {
  if (isSmartbiError(err)) {
    return {
      message: err.messageZh,
      hint: err.hint,
      code: err.code,
    };
  }
  return { message: err.message };
}

/**
 * 从 HTTP Response + body 构造 SmartbiError —
 * 把 status code 自动映射到 SmartbiErrorCode,提取 Smartbi 标准 envelope 里的 message。
 */
export function smartbiErrorFromResponse(
  status: number,
  body: string,
  op: string,
): SmartbiError {
  // 尝试解析 Smartbi 标准 error envelope: {"message", "code", "type", ...}
  let parsedMessage: string | null = null;
  let parsedCode: string | null = null;
  try {
    const parsed = JSON.parse(body) as {
      message?: string | null;
      code?: string | null;
      error?: { messages?: Array<{ message?: string }> };
    };
    parsedMessage = parsed.message ?? parsed.error?.messages?.[0]?.message ?? null;
    parsedCode = parsed.code ?? null;
  } catch {
    // body 不是 JSON,无所谓
  }

  // 根据 status / code 分类
  let code: SmartbiErrorCode;
  let hint: string | undefined;
  if (status === 401 || status === 403) {
    code = 'AUTH';
    hint = '登录态可能已过期,请重新登录或更新 token';
  } else if (status === 400 || parsedCode === 'INVALID_REQUEST') {
    code = 'INVALID_REQUEST';
    hint = '请求参数不合法,请检查 viewConfig';
  } else if (status === 406 && parsedCode === 'RESEND_REQUEST') {
    code = 'TRANSIENT';
    hint = '后端反序列化失败(常见于 abort race),可重试';
  } else if (status >= 500 || parsedCode === 'RESEND_REQUEST') {
    code = 'TRANSIENT';
    hint = '后端临时错误,请重试';
  } else if (parsedMessage) {
    code = 'BUSINESS_ERROR';
  } else {
    code = 'UNKNOWN';
  }

  const messageZh = parsedMessage ?? `后端响应异常(HTTP ${status})`;
  const techMessage = `[smartbi:${op}] ${status} ${messageZh}`;
  return new SmartbiError(techMessage, {
    status,
    code,
    messageZh,
    hint,
    op,
    originalDetail: body,
  });
}
