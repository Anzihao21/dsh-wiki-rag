import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { writeLog, listLogs } from '../../db/log-db';
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  previewRestore,
} from '../snapshot-backup';

let root = '';
let mdDir = '';
let zipDir = '';
let snapshotDir = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-snapedge-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  snapshotDir = path.join(root, 'snapshots');
  await fs.mkdir(mdDir, { recursive: true });
  await fs.mkdir(zipDir, { recursive: true });
  await fs.writeFile(path.join(mdDir, 'a.md'), '# A\n内容A');
  await fs.writeFile(path.join(mdDir, 'b.md'), '# B\n内容B');
  await fs.writeFile(path.join(zipDir, 'a.zip'), 'ZIP-A');
  await initDatabase(path.join(root, 'snap.db'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(root, { recursive: true, force: true });
});

describe('createSnapshot 边界', () => {
  it('快照目录不存在时自动创建', async () => {
    const nonExistent = path.join(root, 'brand-new-snapshots');
    const out = await createSnapshot(mdDir, zipDir, nonExistent);
    expect(await fs.access(out)).toBeUndefined();
  });

  it('空 mdDir/zipDir 仍产出有效 zip', async () => {
    const emptyMd = path.join(root, 'empty-md');
    const emptyZip = path.join(root, 'empty-zip');
    await fs.mkdir(emptyMd, { recursive: true });
    await fs.mkdir(emptyZip, { recursive: true });
    const out = await createSnapshot(emptyMd, emptyZip, snapshotDir);
    const st = await fs.stat(out);
    expect(st.size).toBeGreaterThan(0);
  });

  it('快照文件名包含 snapshot- 前缀与 .zip 后缀', async () => {
    const out = await createSnapshot(mdDir, zipDir, snapshotDir);
    const base = path.basename(out);
    expect(base.startsWith('snapshot-')).toBe(true);
    expect(base.endsWith('.zip')).toBe(true);
  });

  it('连续创建两次快照文件名不同（时间戳不同）', async () => {
    const p1 = await createSnapshot(mdDir, zipDir, snapshotDir);
    await new Promise((r) => setTimeout(r, 1100));
    const p2 = await createSnapshot(mdDir, zipDir, snapshotDir);
    expect(path.basename(p1)).not.toBe(path.basename(p2));
  }, 5000);
});

describe('listSnapshots 边界', () => {
  it('目录不存在时返回空数组', async () => {
    expect(await listSnapshots(path.join(root, 'nope'))).toEqual([]);
  });

  it('目录存在但为空时返回空数组', async () => {
    const empty = path.join(root, 'empty-snap');
    await fs.mkdir(empty, { recursive: true });
    expect(await listSnapshots(empty)).toEqual([]);
  });

  it('只列 .zip 文件，忽略其他后缀', async () => {
    await createSnapshot(mdDir, zipDir, snapshotDir);
    await fs.writeFile(path.join(snapshotDir, 'readme.txt'), 'not a zip');
    await fs.writeFile(path.join(snapshotDir, 'note.md'), 'not a zip');
    const list = await listSnapshots(snapshotDir);
    expect(list).toHaveLength(1);
    expect(list[0].endsWith('.zip')).toBe(true);
  });

  it('多个快照按文件名倒序排列', async () => {
    await createSnapshot(mdDir, zipDir, snapshotDir);
    await new Promise((r) => setTimeout(r, 1100));
    await createSnapshot(mdDir, zipDir, snapshotDir);
    const list = await listSnapshots(snapshotDir);
    expect(list.length).toBe(2);
    // 倒序：[0] 比 [1] 大
    expect(list[0] > list[1]).toBe(true);
  }, 5000);
});

describe('restoreSnapshot 边界', () => {
  it('恢复不存在的 zip 抛错', async () => {
    const ghost = path.join(snapshotDir, 'ghost.zip');
    await expect(restoreSnapshot(ghost, path.join(root, 'out'))).rejects.toThrow();
  });

  it('恢复到不存在的 targetDir 时自动创建', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    const out = path.join(root, 'restored-auto');
    const entries = await restoreSnapshot(zip, out);
    expect(entries).toContain('md');
    expect(await fs.access(out)).toBeUndefined();
  });

  it('恢复后 MD 内容与源一致', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    const out = path.join(root, 'restored2');
    await restoreSnapshot(zip, out);
    const content = await fs.readFile(path.join(out, 'md', 'a.md'), 'utf-8');
    expect(content).toBe('# A\n内容A');
  });
});

describe('previewRestore 边界', () => {
  it('当前 MD 与快照完全一致时三个数组均为空', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    const r = await previewRestore(zip, mdDir);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.modified).toEqual([]);
  });

  it('当前目录新增文件 → removed 列表', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    await fs.writeFile(path.join(mdDir, 'new.md'), '# new');
    const r = await previewRestore(zip, mdDir);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual(['new.md']);
  });

  it('当前目录删除文件 → added 列表', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    await fs.unlink(path.join(mdDir, 'b.md'));
    const r = await previewRestore(zip, mdDir);
    expect(r.added).toEqual(['b.md']);
    expect(r.removed).toEqual([]);
  });

  it('同名文件内容变化 → modified 列表', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    await fs.writeFile(path.join(mdDir, 'a.md'), 'changed content');
    const r = await previewRestore(zip, mdDir);
    expect(r.modified).toEqual(['a.md']);
  });

  it('当前 mdDir 不存在时返回 added 为快照全部文件', async () => {
    const zip = await createSnapshot(mdDir, zipDir, snapshotDir);
    const ghostDir = path.join(root, 'ghost-md');
    const r = await previewRestore(zip, ghostDir);
    expect(r.added.sort()).toEqual(['a.md', 'b.md']);
    expect(r.removed).toEqual([]);
  });

  it('不存在的快照 zip 抛错', async () => {
    const ghost = path.join(snapshotDir, 'no.zip');
    await expect(previewRestore(ghost, mdDir)).rejects.toThrow();
  });
});

describe('快照日志与并发', () => {
  it('createSnapshot 写日志', async () => {
    await createSnapshot(mdDir, zipDir, snapshotDir);
    const logs = await listLogs(20);
    expect(logs.some((l) => l.action === 'snapshot-create')).toBe(true);
  });

  it('并发创建多个快照均成功', async () => {
    // 同一毫秒内 timestamp 可能相同 → 同名文件覆盖；用不同 snapshotDir 隔离
    const dirs = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const d = path.join(root, `snap-${i}`);
        await fs.mkdir(d, { recursive: true });
        return d;
      })
    );
    const outs = await Promise.all(
      dirs.map((d) => createSnapshot(mdDir, zipDir, d))
    );
    expect(outs.every((p) => p.endsWith('.zip'))).toBe(true);
  });
});
