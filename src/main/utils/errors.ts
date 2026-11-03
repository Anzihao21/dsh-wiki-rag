import type { ServerResponse } from 'node:http';

export class AppError extends Error {
  code: string;
  httpStatus: number;
  details?: unknown;

  constructor(code: string, message: string, httpStatus = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ---- 预定义错误码 ----
export const NOT_FOUND = 'NOT_FOUND';
export const BAD_REQUEST = 'BAD_REQUEST';
export const INTERNAL_ERROR = 'INTERNAL_ERROR';
export const DB_ERROR = 'DB_ERROR';
export const IMPORT_ERROR = 'IMPORT_ERROR';
export const PERMISSION_DENIED = 'PERMISSION_DENIED';
export const PATH_TRAVERSAL = 'PATH_TRAVERSAL';

const DEFAULT_HTTP_STATUS: Record<string, number> = {
  [NOT_FOUND]: 404,
  [BAD_REQUEST]: 400,
  [INTERNAL_ERROR]: 500,
  [DB_ERROR]: 500,
  [IMPORT_ERROR]: 500,
  [PERMISSION_DENIED]: 403,
  [PATH_TRAVERSAL]: 403,
};

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as AppError).name === 'AppError' &&
    typeof (e as AppError).code === 'string' &&
    typeof (e as AppError).httpStatus === 'number'
  );
}

export function sendHttpError(res: ServerResponse, error: unknown): void {
  const isDev = process.env.NODE_ENV !== 'production';

  let code: string;
  let message: string;
  let httpStatus: number;
  let stack: string | undefined;

  if (isAppError(error)) {
    code = error.code;
    message = error.message;
    httpStatus = error.httpStatus;
    if (isDev) stack = error.stack;
  } else if (error instanceof Error) {
    code = INTERNAL_ERROR;
    message = error.message;
    httpStatus = 500;
    if (isDev) stack = error.stack;
  } else {
    code = INTERNAL_ERROR;
    message = '未知错误';
    httpStatus = 500;
  }

  // 若尚未设置 httpStatus，按错误码查表兜底
  if (!httpStatus) httpStatus = DEFAULT_HTTP_STATUS[code] ?? 500;

  const payload: Record<string, unknown> = {
    error: {
      code,
      message,
    },
  };
  if (stack) {
    (payload.error as Record<string, unknown>).stack = stack;
  }

  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
