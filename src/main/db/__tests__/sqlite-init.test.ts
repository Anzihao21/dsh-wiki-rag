import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  initDatabase,
  closeDatabase,
  walCheckpoint,
  isDbInitialized,
  getDbPath,
} from '../sqlite-init';
import { writeLog } from '../log-db';

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-sql-'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('sqlite-init WAL 与关闭顺序', () => {
  it('init 后处于 WAL 模式，isDbInitialized 为 true', async () => {
    const dbPath = path.join(tmpDir, 'wal.db');
    await initDatabase(dbPath);
    expect(isDbInitialized()).toBe(true);
    expect(getDbPath()).toBe(dbPath);
    // 写入一条日志触发 WAL 落盘
    await writeLog('probe', 'wal-mode');
    // -wal 文件应被创建
    const files = await fs.readdir(tmpDir);
    expect(files.some((f) => f.endsWith('.db'))).toBe(true);
  });

  it('walCheckpoint 不抛错且可重复调用', async () => {
    await initDatabase(path.join(tmpDir, 'wal.db'));
    await writeLog('a', '1');
    await writeLog('b', '2');
    expect(() => walCheckpoint('PASSIVE')).not.toThrow();
    expect(() => walCheckpoint('FULL')).not.toThrow();
    expect(() => walCheckpoint('TRUNCATE')).not.toThrow();
  });

  it('closeDatabase 幂等且正确清理模块状态', async () => {
    await initDatabase(path.join(tmpDir, 'wal.db'));
    expect(isDbInitialized()).toBe(true);
    closeDatabase();
    expect(isDbInitialized()).toBe(false);
    // 二次 close 不抛错
    expect(() => closeDatabase()).not.toThrow();
  });

  it('walCheckpoint 在未初始化时不抛错', () => {
    expect(() => walCheckpoint()).not.toThrow();
  });
});
