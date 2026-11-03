import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import {
  insertKnowledgeFile,
  getKnowledgeFileById,
  updateSourcePath,
} from '../../db/knowledge-db';
import { writeLog, listLogs } from '../../db/log-db';
import { triggerSourceSync, applySourceUpdate } from '../source-sync';
import { sha256Text } from '../file-utils';

// 与 file-importer 同理：reindex 内部会调 embedText，这里 mock 掉
vi.mock('../../rag/embedding', () => ({
  embedText: () => Buffer.from(new Float32Array(256).buffer),
}));

let root = '';
let mdDir = '';
let zipDir = '';
let srcDir = '';

interface Fixture {
  fileId: number;
  sourcePath: string;
  mdPath: string;
  zipPath: string;
}

async function setupLocalFile(opts: {
  sourceContent: string;
  mdContent?: string;
  zipName?: string;
  sourceRel?: string;
}): Promise<Fixture> {
  const sourceRel = opts.sourceRel ?? 'doc.txt';
  const sourcePath = path.join(srcDir, sourceRel);
  await fs.writeFile(sourcePath, opts.sourceContent, 'utf-8');

  const mdPath = path.join(mdDir, sourceRel.replace(/\.txt$/, '.md'));
  if (opts.mdContent !== undefined) {
    await fs.mkdir(path.dirname(mdPath), { recursive: true });
    await fs.writeFile(mdPath, opts.mdContent, 'utf-8');
  }

  const zipPath = path.join(zipDir, opts.zipName ?? 'doc.zip');
  await fs.writeFile(zipPath, 'fake-zip-bytes', 'utf-8');

  const fileId = await insertKnowledgeFile({
    file_name: path.basename(mdPath),
    source_path: sourcePath,
    md_path: mdPath,
    zip_archive_path: zipPath,
    file_type: 'txt',
    create_time: Date.now(),
    last_sync_time: Date.now(),
  });

  return { fileId, sourcePath, mdPath, zipPath };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rc-sync-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  srcDir = path.join(root, 'src');
  await fs.mkdir(mdDir, { recursive: true });
  await fs.mkdir(zipDir, { recursive: true });
  await fs.mkdir(srcDir, { recursive: true });
  await initDatabase(path.join(root, 'sync.db'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(root, { recursive: true, force: true });
});

describe('triggerSourceSync 基本分支', () => {
  it('记录不存在时返回 source-lost', async () => {
    const r = await triggerSourceSync(99999, '/x.zip', '/x.md');
    expect(r.status).toBe('source-lost');
    expect(r.reason).toContain('不存在');
  });

  it('网页/笔记条目（非本地路径）返回 no-change', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'web.md',
      source_path: 'ref://https://example.com',
      md_path: '/x.md',
      zip_archive_path: '',
      file_type: 'url',
      create_time: 1,
      last_sync_time: 0,
    });
    const r = await triggerSourceSync(fileId, '/x.zip', '/x.md');
    expect(r.status).toBe('no-change');
    expect(r.reason).toContain('网页');
  });

  it('源文件不存在时返回 source-lost', async () => {
    const missing = path.join(srcDir, 'missing.txt');
    const fileId = await insertKnowledgeFile({
      file_name: 'missing.md',
      source_path: missing,
      md_path: '/x.md',
      zip_archive_path: '/x.zip',
      file_type: 'txt',
      create_time: 1,
      last_sync_time: 0,
    });
    const r = await triggerSourceSync(fileId, '/x.zip', '/x.md');
    expect(r.status).toBe('source-lost');
    expect(r.reason).toContain('源文件丢失');
  });

  it('源文件未改动时返回 no-change', async () => {
    const content = '# 一致内容\nbody';
    const f = await setupLocalFile({ sourceContent: content, mdContent: content });
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('no-change');
    expect(r.reason).toContain('无改动');
  });

  it('源文件内容变化时返回 needs-confirm 并带 diff', async () => {
    const f = await setupLocalFile({
      sourceContent: '新版本内容',
      mdContent: '旧版本内容',
    });
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('needs-confirm');
    expect(r.diff).toBeDefined();
    expect(r.diff!.fileId).toBe(f.fileId);
    expect(r.diff!.oldText).toBe('旧版本内容');
    expect(r.diff!.newText).toBe('新版本内容');
    expect(r.diff!.diff.length).toBeGreaterThan(0);
  });

  it('MD 文件不存在时（oldText 为空）即使源文件有内容也返回 needs-confirm', async () => {
    const f = await setupLocalFile({ sourceContent: 'only source' });
    // 不写 mdContent
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('needs-confirm');
    expect(r.diff!.oldText).toBe('');
    expect(r.diff!.newText).toBe('only source');
  });

  it('zip 归档不存在时不抛错（archiveHash=null 容错）', async () => {
    const f = await setupLocalFile({
      sourceContent: 'v2',
      mdContent: 'v1',
      zipName: 'nonexistent.zip',
    });
    // 故意把 zipPath 指向不存在位置
    const r = await triggerSourceSync(f.fileId, path.join(zipDir, 'no.zip'), f.mdPath);
    expect(r.status).toBe('needs-confirm');
  });
});

describe('triggerSourceSync 边界', () => {
  it('空文件源且 oldText 为空时返回 needs-confirm（空 old 不触发 no-change 短路）', async () => {
    const f = await setupLocalFile({ sourceContent: '', mdContent: '' });
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    // oldText 为空时 `if (oldText && ...)` 短路，直接走 needs-confirm 分支
    expect(r.status).toBe('needs-confirm');
  });

  it('超大文件同步不抛错（内容哈希对比）', async () => {
    const big = 'X'.repeat(200 * 1024); // 200KB
    const f = await setupLocalFile({ sourceContent: big, mdContent: big });
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('no-change');
  }, 30000);

  it('并发同步同一文件均返回一致结果', async () => {
    const f = await setupLocalFile({
      sourceContent: 'src',
      mdContent: 'md-old',
    });
    const [r1, r2] = await Promise.all([
      triggerSourceSync(f.fileId, f.zipPath, f.mdPath),
      triggerSourceSync(f.fileId, f.zipPath, f.mdPath),
    ]);
    expect(r1.status).toBe('needs-confirm');
    expect(r2.status).toBe('needs-confirm');
  });

  it('UNC 路径被识别为本地源（不抛错）', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'unc.md',
      source_path: '\\\\server\\share\\doc.txt',
      md_path: '/x.md',
      zip_archive_path: '/x.zip',
      file_type: 'txt',
      create_time: 1,
      last_sync_time: 0,
    });
    // UNC 路径在 Linux 上必然不存在 → source-lost，但不应抛错
    const r = await triggerSourceSync(fileId, '/x.zip', '/x.md');
    expect(r.status).toBe('source-lost');
  });

  it('// 开头的 UNC 路径同样识别为本地源', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'unc2.md',
      source_path: '//server/share/doc.txt',
      md_path: '/x.md',
      zip_archive_path: '/x.zip',
      file_type: 'txt',
      create_time: 1,
      last_sync_time: 0,
    });
    const r = await triggerSourceSync(fileId, '/x.zip', '/x.md');
    expect(r.status).toBe('source-lost');
  });
});

describe('applySourceUpdate', () => {
  it('覆盖 MD 内容并刷新 last_sync_time', async () => {
    const f = await setupLocalFile({
      sourceContent: 'new content',
      mdContent: 'old content',
    });
    const before = (await getKnowledgeFileById(f.fileId))!.last_sync_time;
    await applySourceUpdate(f.fileId, 'new content', f.mdPath, async () => {});
    const md = await fs.readFile(f.mdPath, 'utf-8');
    expect(md).toBe('new content');
    const row = await getKnowledgeFileById(f.fileId);
    expect(row!.last_sync_time).toBeGreaterThanOrEqual(before);
    expect(row!.last_sync_time).toBeGreaterThan(0);
  });

  it('applySourceUpdate 调用注入的 reindex', async () => {
    const f = await setupLocalFile({
      sourceContent: 'src',
      mdContent: 'md',
    });
    let calledWith: { id: number; text: string } | null = null;
    await applySourceUpdate(f.fileId, 'reindexed text', f.mdPath, async (id, text) => {
      calledWith = { id, text };
    });
    expect(calledWith).toEqual({ id: f.fileId, text: 'reindexed text' });
  });

  it('applySourceUpdate 在 mdDir 不存在时自动 mkdir', async () => {
    const f = await setupLocalFile({
      sourceContent: 'src',
      mdContent: 'md',
    });
    // 先删除 md 文件，再换一个不存在的子目录
    await fs.rm(f.mdPath, { force: true });
    const newPath = path.join(mdDir, 'sub', 'nested.md');
    await applySourceUpdate(f.fileId, 'deep', newPath, async () => {});
    const md = await fs.readFile(newPath, 'utf-8');
    expect(md).toBe('deep');
  });

  it('applySourceUpdate 写操作日志', async () => {
    const f = await setupLocalFile({
      sourceContent: 'src',
      mdContent: 'old',
    });
    await applySourceUpdate(f.fileId, 'new', f.mdPath, async () => {});
    const logs = await listLogs(50);
    expect(logs.some((l) => l.action === 'source-sync')).toBe(true);
  });

  it('applySourceUpdate 对不存在的 mdPath 先读后写不抛错', async () => {
    const f = await setupLocalFile({ sourceContent: 'src', mdContent: 'x' });
    const ghostPath = path.join(mdDir, 'ghost.md');
    await applySourceUpdate(f.fileId, 'ghost-body', ghostPath, async () => {});
    expect(await fs.readFile(ghostPath, 'utf-8')).toBe('ghost-body');
  });

  it('applySourceUpdate 空文本也能写入', async () => {
    const f = await setupLocalFile({ sourceContent: 'src', mdContent: 'x' });
    await applySourceUpdate(f.fileId, '', f.mdPath, async () => {});
    expect(await fs.readFile(f.mdPath, 'utf-8')).toBe('');
  });
});

describe('triggerSourceSync 与 applySourceUpdate 串联', () => {
  it('检测变更 → 确认更新 → 再次同步视为无改动', async () => {
    const f = await setupLocalFile({
      sourceContent: 'v2',
      mdContent: 'v1',
    });
    let r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('needs-confirm');

    await applySourceUpdate(f.fileId, r.diff!.newText, f.mdPath, async () => {});

    r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('no-change');
  });

  it('源文件被删除后同步返回 source-lost', async () => {
    const f = await setupLocalFile({ sourceContent: 'src', mdContent: 'md' });
    await fs.unlink(f.sourcePath);
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('source-lost');
  });

  it('updateSourcePath 后同步新路径生效', async () => {
    const f = await setupLocalFile({ sourceContent: 'src1', mdContent: 'md1' });
    // 换一个新源文件
    const newSrc = path.join(srcDir, 'new.txt');
    await fs.writeFile(newSrc, 'new content', 'utf-8');
    await updateSourcePath(f.fileId, newSrc);
    const r = await triggerSourceSync(f.fileId, f.zipPath, f.mdPath);
    expect(r.status).toBe('needs-confirm');
    expect(r.diff!.newText).toBe('new content');
  });
});

describe('sha256Text 工具', () => {
  it('相同文本哈希一致', () => {
    expect(sha256Text('abc')).toBe(sha256Text('abc'));
  });
  it('不同文本哈希不同', () => {
    expect(sha256Text('abc')).not.toBe(sha256Text('abd'));
  });
  it('空字符串有稳定哈希', () => {
    expect(sha256Text('')).toBe(sha256Text(''));
  });
});
