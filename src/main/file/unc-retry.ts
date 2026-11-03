import { promises as fs } from 'fs';
import { isUncPath } from './name-auto-rename';

/**
 * 局域网共享（UNC）容错模块。
 * 对齐说明书 2.9 / 6.8：
 * - 局域网共享路径在导入 / 同步前做显式权限检测
 * - 网络类错误（断网 / 主机不可达 / 连接重置 / DNS 解析失败 / 超时）自动重试
 * 只针对 UNC 路径生效；本地文件路径不受影响。
 */

/** 可重试的网络 / 共享类错误码（断网、主机不可达、连接重置、DNS 解析失败、超时、管道断开） */
const RETRYABLE_CODES = new Set([
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'EAI_AGAIN',
  'EPIPE',
  'EAGAIN',
  'ECONNREFUSED',
]);

/** 是否为可自动重试的网络类错误 */
export function isNetworkRetryableError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code ?? '';
  return RETRYABLE_CODES.has(code);
}

/**
 * 对异步操作做网络类错误自动重试。
 * - 非网络错误立即抛出，不重试
 * - 网络错误按退避（baseDelay * 2^i）重试，重试间写审计日志
 * @default attempts=3（1 次 + 2 次重试），baseDelayMs=500
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isNetworkRetryableError(e) || i === attempts - 1) throw e;
      const delay = baseDelayMs * 2 ** i;
      await new Promise((r) => setTimeout(r, delay));
      const { writeLog } = await import('../db/log-db');
      await writeLog(
        'network-retry',
        `${opts.label ?? '网络操作'} 重试 ${i + 1}/${attempts - 1}（${delay}ms）：${(e as Error).message}`
      ).catch(() => {});
    }
  }
  throw lastErr;
}

/** 局域网共享路径（UNC）权限 / 可达性检测 */
export async function checkUncAccess(p: string): Promise<{ ok: boolean; reason: string }> {
  if (!isUncPath(p)) return { ok: true, reason: '非 UNC 路径，跳过权限检测' };
  try {
    await fs.access(p, fs.constants.R_OK);
    await fs.stat(p); // 确认条目存在且可 stat
    return { ok: true, reason: '可访问' };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code ?? '';
    if (code === 'EACCES' || code === 'EPERM') {
      return { ok: false, reason: `无权限访问共享路径: ${p}（${code}）` };
    }
    if (isNetworkRetryableError(e)) {
      return { ok: false, reason: `共享路径不可达（网络）: ${p}（${code}）` };
    }
    if (code === 'ENOENT') {
      return { ok: false, reason: `共享路径不存在: ${p}` };
    }
    return { ok: false, reason: `共享路径检测失败: ${p}（${code || (e as Error).message}）` };
  }
}
