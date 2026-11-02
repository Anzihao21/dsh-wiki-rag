import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { insertKnowledgeFile } from '../../db/knowledge-db';
import { FileWatcher } from '../file-watcher';

let tmpDir = '';
let watcher: FileWatcher;
let fileId = 0;
let sourceFile = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-watch-'));
  await initDatabase(path.join(tmpDir, 'w.db'));
  sourceFile = path.join(tmpDir, 'source.md');
  await fs.writeFile(sourceFile, '# v1\n');
  fileId = await insertKnowledgeFile({
    file_name: 'source.md',
    source_path: sourceFile,
    md_path: path.join(tmpDir, 'kb', 'source.md'),
    zip_archive_path: '',
    file_type: 'md',
    create_time: 1,
    last_sync_time: 1,
  });
  watcher = new FileWatcher();
});

afterEach(async () => {
  await watcher.stop();
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileWatcher 防抖 / 去重 / unwatch', () => {
  it('重复 watchSource 同一路径不会重复监听', async () => {
    watcher.watchSource(fileId);
    watcher.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    expect(watcher.watchedCount()).toBe(1);
  });

  it('change 事件经 500ms 防抖后只回调一次', async () => {
    const events: Array<{ fileId: number; sourcePath: string }> = [];
    watcher.setCallback((c) => events.push(c));
    watcher.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    // 连续写盘 3 次，应只回调一次
    await fs.writeFile(sourceFile, '# v2\n');
    await fs.writeFile(sourceFile, '# v3\n');
    await fs.writeFile(sourceFile, '# v4\n');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.length).toBe(1);
    expect(events[0].fileId).toBe(fileId);
    expect(events[0].sourcePath).toBe(sourceFile);
  });

  it('unwatchPath 后不再触发回调', async () => {
    const events: Array<{ fileId: number }> = [];
    watcher.setCallback((c) => events.push(c));
    watcher.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    watcher.unwatchPath(sourceFile);
    expect(watcher.watchedCount()).toBe(0);
    await fs.writeFile(sourceFile, '# changed\n');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.length).toBe(0);
  });

  it('stop 清理全部状态', async () => {
    watcher.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    expect(watcher.watchedCount()).toBe(1);
    await watcher.stop();
    expect(watcher.watchedCount()).toBe(0);
  });
});
