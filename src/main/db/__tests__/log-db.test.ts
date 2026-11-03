import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../sqlite-init';
import { writeLog, listLogs, lastLog, pruneLogs } from '../log-db';

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-log-'));
  await initDatabase(path.join(tmpDir, 'log.db'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('log-db 操作日志', () => {
  it('写入后 lastLog 返回最新一条', async () => {
    await writeLog('import', 'first');
    const first = await lastLog();
    expect(first?.action).toBe('import');
    expect(first?.detail).toBe('first');
    expect(typeof first?.time).toBe('number');
  });

  it('listLogs 倒序且受 limit 约束', async () => {
    for (let i = 0; i < 5; i++) {
      await writeLog(`act-${i}`, `detail-${i}`);
    }
    const all = await listLogs(100);
    expect(all).toHaveLength(5);
    // 倒序：第一条是最后写入的 act-4
    expect(all[0].action).toBe('act-4');
    expect(all[4].action).toBe('act-0');

    const limited = await listLogs(2);
    expect(limited).toHaveLength(2);
    expect(limited[0].action).toBe('act-4');
    expect(limited[1].action).toBe('act-3');
  });

  it('writeLog 支持 level/meta 结构化字段', async () => {
    await writeLog('test', 'hello', { level: 'error', meta: { fileId: 5 } });
    const log = await lastLog();
    expect(log?.level).toBe('error');
    expect(JSON.parse(log!.meta as string)).toEqual({ fileId: 5 });
  });

  it('listLogs 支持按 action/level 过滤', async () => {
    await writeLog('a', '1', { level: 'info' });
    await writeLog('b', '2', { level: 'error' });
    expect((await listLogs({ action: 'b' })).length).toBe(1);
    expect((await listLogs({ level: 'error' })).length).toBe(1);
  });

  it('pruneLogs 保留每种 action 最近 N 条并返回删除数', async () => {
    for (let i = 0; i < 5; i++) await writeLog('repeat', String(i));
    await writeLog('keep', 'x');
    const removed = await pruneLogs(2);
    expect(removed).toBe(3);
    expect((await listLogs({ action: 'repeat' })).length).toBe(2);
  });
});
