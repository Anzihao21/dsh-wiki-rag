import { all, get, run } from './sqlite-init';
import type { OperationLog } from '../types';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogOptions {
  level?: LogLevel;
  meta?: Record<string, unknown>;
}

// ---- 自动修剪计数器 ----
// 每次 writeLog 自增；超过 PRUNE_EVERY 次就在后台触发一次 pruneLogs(500)，
// 避免 operation_log 表无限增长。修剪失败静默吞掉，不影响主流程。
let writeCount = 0;
let pruning = false;
const PRUNE_EVERY = 200;
const KEEP_PER_ACTION = 500;

function maybeAutoPrune(): void {
  writeCount++;
  if (writeCount < PRUNE_EVERY) return;
  writeCount = 0;
  if (pruning) return;
  pruning = true;
  // fire-and-forget：修剪是后台维护，不阻塞 writeLog 调用方
  Promise.resolve()
    .then(() => pruneLogs(KEEP_PER_ACTION))
    .catch(() => {})
    .finally(() => { pruning = false; });
}

/** 写入操作日志（结构化：level + 可选 meta JSON） */
export async function writeLog(action: string, detail: string, options?: LogOptions): Promise<void> {
  const level = options?.level ?? 'info';
  const meta = options?.meta ? JSON.stringify(options.meta) : null;
  await run('INSERT INTO operation_log (action, detail, time, level, meta) VALUES (?, ?, ?, ?, ?)', [
    action,
    detail,
    Date.now(),
    level,
    meta,
  ]);
  maybeAutoPrune();
}

export interface ListLogsOptions {
  limit?: number;
  action?: string;
  level?: string;
}

/** 查询日志（倒序；支持按 action/level 过滤与分页；兼容传数字 = limit） */
export async function listLogs(opts: number | ListLogsOptions = {}): Promise<OperationLog[]> {
  const o = typeof opts === 'number' ? { limit: opts } : opts;
  const limit = o.limit ?? 100;
  const cond: string[] = [];
  const params: Array<string | number> = [];
  if (o.action) {
    cond.push('action = ?');
    params.push(o.action);
  }
  if (o.level) {
    cond.push('level = ?');
    params.push(o.level);
  }
  const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
  return all<OperationLog>(`SELECT * FROM operation_log${where} ORDER BY id DESC LIMIT ?`, [...params, limit]);
}

/** 最近一条日志 */
export async function lastLog(): Promise<OperationLog | undefined> {
  return get<OperationLog>('SELECT * FROM operation_log ORDER BY id DESC LIMIT 1');
}

/** 清理旧日志：仅保留每种 action 最近 keep 条（防止无限增长） */
export async function pruneLogs(keepPerAction = 500): Promise<number> {
  const actions = all<{ action: string }>('SELECT DISTINCT action FROM operation_log');
  let removed = 0;
  for (const { action } of actions) {
    const toDelete = all<{ id: number }>(
      `SELECT id FROM operation_log WHERE action = ? ORDER BY id DESC LIMIT -1 OFFSET ?`,
      [action, keepPerAction]
    );
    if (toDelete.length) {
      run(`DELETE FROM operation_log WHERE id IN (${toDelete.map(() => '?').join(',')})`, toDelete.map((r) => r.id));
      removed += toDelete.length;
    }
  }
  return removed;
}

/** 供测试或宿主启动时重置计数器（不影响 DB） */
export function __resetLogCounterForTests(): void {
  writeCount = 0;
  pruning = false;
}
