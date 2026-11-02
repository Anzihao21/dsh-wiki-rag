import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../sqlite-init';
import { writeLog, listLogs, lastLog } from '../log-db';

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
});
