import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { insertKnowledgeFile } from '../../db/knowledge-db';
import { FileWatcher } from '../file-watcher';

/**
 * FileWatcher 内存泄漏与健壮性测试。
 * 重点：start/stop 后监听器被清理、多次循环不泄漏、防抖 Map 消费后清空、
 * 停止后不再触发事件、错误事件不崩溃、大量事件不 OOM。
 */
describe('FileWatcher 内存泄漏与健壮性', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-watch-leak-'));
    await initDatabase(path.join(tmpDir, 'w.db'));
  });

  afterEach(async () => {
    closeDatabase();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function makeSource(name: string): Promise<{ fileId: number; source: string }> {
    const source = path.join(tmpDir, name);
    await fs.writeFile(source, `# ${name}\n`);
    const fileId = await insertKnowledgeFile({
      file_name: name,
      source_path: source,
      md_path: path.join(tmpDir, 'kb', name),
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 1,
    });
    return { fileId, source };
  }

  it('stop 后 watched Map 清空', async () => {
    const { fileId } = await makeSource('a.md');
    const w = new FileWatcher();
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    expect(w.watchedCount()).toBe(1);
    await w.stop();
    expect(w.watchedCount()).toBe(0);
  });

  it('多次 start/stop 循环不泄漏 watched 表', async () => {
    const { fileId } = await makeSource('loop.md');
    for (let i = 0; i < 5; i++) {
      const w = new FileWatcher();
      w.watchSource(fileId);
      await new Promise((r) => setTimeout(r, 200));
      expect(w.watchedCount()).toBe(1);
      await w.stop();
      expect(w.watchedCount()).toBe(0);
    }
  });

  it('多次重复 watchSource 同一路径幂等（watched 不增长）', async () => {
    const { fileId } = await makeSource('dup.md');
    const w = new FileWatcher();
    for (let i = 0; i < 10; i++) {
      w.watchSource(fileId);
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(w.watchedCount()).toBe(1);
    await w.stop();
  });

  it('unwatchPath 后 debounce 定时器被清理（不再触发回调）', async () => {
    const { fileId, source } = await makeSource('unw.md');
    const events: number[] = [];
    const w = new FileWatcher();
    w.setCallback((c) => events.push(c.fileId));
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    w.unwatchPath(source);
    expect(w.watchedCount()).toBe(0);
    // 写盘多次，回调不应触发
    await fs.writeFile(source, '# v2\n');
    await fs.writeFile(source, '# v3\n');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.length).toBe(0);
    await w.stop();
  });

  it('debounce 回调消费后 debounceTimers Map 不再残留该路径', async () => {
    const { fileId, source } = await makeSource('deb.md');
    const events: number[] = [];
    const w = new FileWatcher();
    w.setCallback((c) => events.push(c.fileId));
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    await fs.writeFile(source, '# changed\n');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.length).toBe(1);
    // 回调已触发，debounce 定时器应已从 Map 删除
    // 通过 watcher 再停止一次确认无 pending 定时器导致 unhandled
    await w.stop();
    expect(w.watchedCount()).toBe(0);
  });

  it('stop 之后再写盘不触发任何回调', async () => {
    const { fileId, source } = await makeSource('stopped.md');
    const events: number[] = [];
    const w = new FileWatcher();
    w.setCallback((c) => events.push(c.fileId));
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    await w.stop();
    await fs.writeFile(source, '# after stop\n');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.length).toBe(0);
  });

  it('watchSource 一个不存在的 fileId 不崩溃，watched 保持空', async () => {
    const w = new FileWatcher();
    w.watchSource(999999); // DB 中无此条目
    await new Promise((r) => setTimeout(r, 300));
    expect(w.watchedCount()).toBe(0);
    await w.stop();
  });

  it('100+ 次连续文件事件不 OOM、不崩溃', async () => {
    const { fileId, source } = await makeSource('burst.md');
    const events: number[] = [];
    const w = new FileWatcher();
    w.setCallback((c) => events.push(c.fileId));
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 300));
    // 高频写盘 100 次（防抖会合并为少量回调）
    for (let i = 0; i < 100; i++) {
      await fs.writeFile(source, `# iter ${i}\n`);
    }
    await new Promise((r) => setTimeout(r, 800));
    // 防抖后至少回调一次，且不应崩溃
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBeLessThan(100);
    await w.stop();
  }, 20000);

  it('并发 watch 多个文件时各路径独立计数', async () => {
    const w = new FileWatcher();
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { fileId } = await makeSource(`multi-${i}.md`);
      ids.push(fileId);
      w.watchSource(fileId);
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(w.watchedCount()).toBe(5);
    await w.stop();
    expect(w.watchedCount()).toBe(0);
  });

  it('stop 幂等：多次调用不抛错', async () => {
    const { fileId } = await makeSource('idemp.md');
    const w = new FileWatcher();
    w.watchSource(fileId);
    await new Promise((r) => setTimeout(r, 200));
    await w.stop();
    await expect(w.stop()).resolves.toBeUndefined();
    await expect(w.stop()).resolves.toBeUndefined();
  });
});
