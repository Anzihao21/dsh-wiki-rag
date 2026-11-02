import { all, get, run } from './sqlite-init';
import type { OperationLog } from '../types';

/** 写入操作日志 */
export async function writeLog(action: string, detail: string): Promise<void> {
  await run('INSERT INTO operation_log (action, detail, time) VALUES (?, ?, ?)', [
    action,
    detail,
    Date.now()
  ]);
}

/** 查询日志（倒序） */
export async function listLogs(limit = 100): Promise<OperationLog[]> {
  return all<OperationLog>('SELECT * FROM operation_log ORDER BY id DESC LIMIT ?', [limit]);
}

/** 最近一条日志 */
export async function lastLog(): Promise<OperationLog | undefined> {
  return get<OperationLog>('SELECT * FROM operation_log ORDER BY id DESC LIMIT 1');
}
