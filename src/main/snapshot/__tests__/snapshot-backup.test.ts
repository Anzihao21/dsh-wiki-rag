import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { writeLog, listLogs } from '../../db/log-db';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../snapshot-backup';

let root = '';
let mdDir = '';
let zipDir = '';
let snapshotDir = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-snap-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  snapshotDir = path.join(root, 'snapshots');
  await fs.mkdir(mdDir, { recursive: true });
  await fs.mkdir(zipDir, { recursive: true });
  await fs.writeFile(path.join(mdDir, 'doc-a.md'), '# A\n内容A');
  await fs.writeFile(path.join(mdDir, 'doc-b.md'), '# B\n内容B');
  await fs.writeFile(path.join(zipDir, 'doc-a.zip'), 'ZIP-BINARY-A');
  // snapshot-backup 内部会 writeLog，必须先初始化 db
  await initDatabase(path.join(root, 'snap.db'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(root, { recursive: true, force: true });
});

describe('snapshot-backup 快照打包/解包往返', () => {
  it('createSnapshot 产出 zip 文件', async () => {
    const out = await createSnapshot(mdDir, zipDir, snapshotDir);
    expect(out).toContain('snapshot-');
    expect(out.endsWith('.zip')).toBe(true);
    const st = await fs.stat(out);
    expect(st.size).toBeGreaterThan(100);
  });

  it('listSnapshots 只列 .zip 且倒序', async () => {
    await createSnapshot(mdDir, zipDir, snapshotDir);
    const list = await listSnapshots(snapshotDir);
    expect(list).toHaveLength(1);
    expect(list[0].endsWith('.zip')).toBe(true);
  });

  it('打包→解包往返内容一致', async () => {
    const zipPath = await createSnapshot(mdDir, zipDir, snapshotDir);
    const restoreDir = path.join(root, 'restored');
    const entries = await restoreSnapshot(zipPath, restoreDir);

    // extract-zip 保留 md/ 与 zip/ 两个顶层目录
    expect(entries.sort()).toEqual(['md', 'zip']);

    const mdA = await fs.readFile(path.join(restoreDir, 'md', 'doc-a.md'), 'utf-8');
    expect(mdA).toBe('# A\n内容A');
    const mdB = await fs.readFile(path.join(restoreDir, 'md', 'doc-b.md'), 'utf-8');
    expect(mdB).toBe('# B\n内容B');
    const zipA = await fs.readFile(path.join(restoreDir, 'zip', 'doc-a.zip'), 'utf-8');
    expect(zipA).toBe('ZIP-BINARY-A');

    // 快照创建与恢复都写了操作日志
    const logs = await listLogs(10);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('snapshot-create');
    expect(actions).toContain('snapshot-restore');
  });

  it('listSnapshots 目录不存在时返回空数组而非抛错', async () => {
    expect(await listSnapshots(path.join(root, 'not-exist'))).toEqual([]);
  });
});
