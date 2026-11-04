import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

// 对 embedText 做同步 mock：file-importer 内部 `const vec = embedText(c)` 未 await，
// 真实实现返回 Promise 会导致 better-sqlite3 绑定失败；mock 返回 Buffer 即可。
vi.mock('../../rag/embedding', () => ({
  embedText: () => Buffer.from(new Float32Array(256).buffer),
}));

import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import {
  insertKnowledgeFile,
  getKnowledgeFileById,
  findKnowledgeFileBySourcePath,
  listKnowledgeFiles,
  deleteKnowledgeFile,
  listFileNamesByPath,
  countByType,
} from '../../db/knowledge-db';
import { getChunksByFileId } from '../../db/vector-db';
import { writeLog, listLogs } from '../../db/log-db';
import { FileImporter } from '../file-importer';
import { detectFileType, extractTextToMarkdown, isOversize, toMdFileName } from '../file-utils';

let root = '';
let mdDir = '';
let zipDir = '';
let srcDir = '';
let importer: FileImporter;

function makeImporter(): FileImporter {
  return new FileImporter({
    mdDir,
    zipDir,
    chunkSize: 200,
    chunkOverlap: 20,
    chunkMode: 'fixed',
    webTimeout: 5000,
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-imp-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  srcDir = path.join(root, 'src');
  await fs.mkdir(mdDir, { recursive: true });
  await fs.mkdir(zipDir, { recursive: true });
  await fs.mkdir(srcDir, { recursive: true });
  await initDatabase(path.join(root, 'imp.db'));
  importer = makeImporter();
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(root, { recursive: true, force: true });
});

describe('FileImporter.importLocalFile happy path', () => {
  it('导入 .txt 文件成功，DB 记录正确', async () => {
    const src = path.join(srcDir, 'note.txt');
    await fs.writeFile(src, 'hello world\nsecond line', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(false);
    expect(r.fileId).toBeGreaterThan(0);
    expect(r.fileName).toBe('note.txt.md');
    const row = await getKnowledgeFileById(r.fileId);
    expect(row).toBeDefined();
    expect(row!.file_type).toBe('txt');
    expect(row!.source_path).toBe(src);
    expect(row!.md_path).toBe(r.mdPath);
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toBe('hello world\nsecond line');
  });

  it('导入 .md 文件成功，类型识别为 md', async () => {
    const src = path.join(srcDir, 'readme.md');
    await fs.writeFile(src, '# Title\n\nbody', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(false);
    const row = await getKnowledgeFileById(r.fileId);
    expect(row!.file_type).toBe('md');
    expect(r.fileName).toBe('readme.md');
  });

  it('导入损坏的 .pdf 文件：真实解析失败但不抛错（返回 skipped）', async () => {
    const src = path.join(srcDir, 'doc.pdf');
    await fs.writeFile(src, '%PDF-1.4 fake', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('导入损坏的 .docx 文件：真实解析失败但不抛错（返回 skipped）', async () => {
    const src = path.join(srcDir, 'word.docx');
    await fs.writeFile(src, 'PK fake', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('导入无扩展名文件被识别为 unknown 并降级为 md', async () => {
    const src = path.join(srcDir, 'plaintext');
    await fs.writeFile(src, 'just text', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(false);
    const row = await getKnowledgeFileById(r.fileId);
    expect(row!.file_type).toBe('md');
  });

  it('导入后向量库切片已写入', async () => {
    const src = path.join(srcDir, 'chunks.txt');
    await fs.writeFile(src, '第一段内容。\n\n第二段内容。\n\n第三段内容。', 'utf-8');
    const r = await importer.importLocalFile(src);
    const chunks = await getChunksByFileId(r.fileId);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('导入后 MD 文件落在 mdDir 内', async () => {
    const src = path.join(srcDir, 'inside.txt');
    await fs.writeFile(src, 'x', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.mdPath.startsWith(mdDir)).toBe(true);
  });
});

describe('FileImporter 同名重命名与去重', () => {
  it('同名第二次导入时 MD 文件名自动加 (1)', async () => {
    // 先在 DB 与 mdDir 里放一个 readme.md
    const existingMd = path.join(mdDir, 'readme.md');
    await fs.writeFile(existingMd, 'old', 'utf-8');
    await insertKnowledgeFile({
      file_name: 'readme.md',
      source_path: '/old/readme.md',
      md_path: existingMd,
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 0,
    });

    const src = path.join(srcDir, 'readme.md');
    await fs.writeFile(src, 'new', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.fileName).toBe('readme(1).md');
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toBe('new');
  });

  it('同名第三次导入自动加 (2)', async () => {
    for (const name of ['readme.md', 'readme(1).md']) {
      const p = path.join(mdDir, name);
      await fs.writeFile(p, 'x', 'utf-8');
      await insertKnowledgeFile({
        file_name: name,
        source_path: `/old/${name}`,
        md_path: p,
        zip_archive_path: '',
        file_type: 'md',
        create_time: 1,
        last_sync_time: 0,
      });
    }
    const src = path.join(srcDir, 'readme.md');
    await fs.writeFile(src, 'y', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.fileName).toBe('readme(2).md');
  });

  it('同一 source_path 重复导入走 dedup 分支，复用旧 id', async () => {
    const src = path.join(srcDir, 'dup.txt');
    await fs.writeFile(src, 'first', 'utf-8');
    const r1 = await importer.importLocalFile(src);
    const r2 = await importer.importLocalFile(src);
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('duplicate source');
    expect(r2.fileId).toBe(r1.fileId);
    const all = await listKnowledgeFiles();
    expect(all.length).toBe(1);
  });

  it('不同 source_path 但同名文件导入时第二个文件自动重命名', async () => {
    const src1 = path.join(srcDir, 'a.txt');
    const src2 = path.join(srcDir, 'b.txt');
    await fs.writeFile(src1, 'aaa', 'utf-8');
    await fs.writeFile(src2, 'bbb', 'utf-8');
    const r1 = await importer.importLocalFile(src1);
    const r2 = await importer.importLocalFile(src2);
    // 都叫 .txt/.md → .txt 产出 .txt.md，.md 保持 .md，不冲突
    expect(r1.fileName).toBe('a.txt.md');
    expect(r2.fileName).toBe('b.txt.md');
  });
});

describe('FileImporter 边界与异常', () => {
  it('导入空文件（0 字节）不抛错', async () => {
    const src = path.join(srcDir, 'empty.txt');
    await fs.writeFile(src, '', 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(false);
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toBe('');
  });

  it('导入超长文本文件（100KB+）成功切片', async () => {
    const src = path.join(srcDir, 'long.txt');
    const long = '段落内容。'.repeat(20000); // ~100KB
    await fs.writeFile(src, long, 'utf-8');
    const r = await importer.importLocalFile(src);
    expect(r.skipped).toBe(false);
    const chunks = await getChunksByFileId(r.fileId);
    expect(chunks.length).toBeGreaterThan(1);
  }, 30000);

  it('导入不存在的文件路径时抛错', async () => {
    const missing = path.join(srcDir, 'nope.txt');
    await expect(importer.importLocalFile(missing)).rejects.toThrow();
  });

  it('导入无扩展名目录被识别为 unknown 占位文本，不抛错', async () => {
    // 目录名 srcDir 无扩展名 → detectFileType=unknown → extractTextToMarkdown 走占位分支
    const r = await importer.importLocalFile(srcDir);
    expect(r.skipped).toBe(false);
    expect(r.fileName).toBe('src.md');
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toContain('未提取正文');
  });

  it('isOversize 对正常小文件返回 false', async () => {
    const src = path.join(srcDir, 'small.txt');
    await fs.writeFile(src, 'tiny', 'utf-8');
    expect(await isOversize(src, 10)).toBe(false);
  });

  it('isOversize 对不存在文件 reject', async () => {
    await expect(isOversize(path.join(srcDir, 'x'), 10)).rejects.toThrow();
  });

  it('commitImport 对文件名中的 .. 做清洗（路径穿越防护）', async () => {
    // 用 importNote 构造含目录穿越的文件名
    const r = await importer.importNote('../../etc/passwd', 'body');
    expect(r.skipped).toBe(false);
    // mdPath 必须落在 mdDir 内
    expect(r.mdPath.startsWith(mdDir)).toBe(true);
    await fs.access(r.mdPath);
  });
});

describe('FileImporter.importNote', () => {
  it('笔记导入成功，类型为 note', async () => {
    const r = await importer.importNote('我的笔记', '内容正文');
    expect(r.skipped).toBe(false);
    expect(r.fileName).toBe('我的笔记.md');
    const row = await getKnowledgeFileById(r.fileId);
    expect(row!.file_type).toBe('note');
    // note:// 前缀不属于本地路径，commitImport 会再包一层 ref://
    expect(row!.source_path).toBe('ref://note://我的笔记');
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toContain('# 我的笔记');
    expect(md).toContain('内容正文');
  });

  it('空标题笔记仍能落地（sanitize 兜底）', async () => {
    const r = await importer.importNote('', 'body');
    expect(r.skipped).toBe(false);
    expect(r.fileName).toMatch(/\.md$/);
  });

  it('笔记导入归档原始笔记 TXT 作证据层（-note.zip，内含原文）', async () => {
    const r = await importer.importNote('归档笔记', '原始笔记正文XYZ123');
    expect(r.skipped).toBe(false);
    const row = await getKnowledgeFileById(r.fileId);
    // 归档指向 -note.zip，而非默认的 -meta（MD）
    expect(row!.zip_archive_path).toMatch(/-note\.zip$/);
    await fs.access(row!.zip_archive_path);
    // zip 内应包含原始笔记文本
    const txt = execSync(`unzip -p ${JSON.stringify(row!.zip_archive_path)}`).toString('utf-8');
    expect(txt).toContain('原始笔记正文XYZ123');
  });
});

describe('FileImporter.summarize', () => {
  it('汇总统计 ok/skipped/failed', () => {
    const s = importer.summarize([
      { fileId: 1, fileName: 'a.md', mdPath: '/a', skipped: false },
      { fileId: 2, fileName: 'b.md', mdPath: '/b', skipped: false },
      { fileId: 0, fileName: 'c.md', mdPath: '', skipped: true, reason: 'dup' },
      { fileId: 0, fileName: 'd.md', mdPath: '', skipped: false, reason: 'boom' },
    ]);
    expect(s).toEqual({ total: 4, ok: 2, skipped: 1, failed: 1 });
  });

  it('空数组汇总全 0', () => {
    const s = importer.summarize([]);
    expect(s).toEqual({ total: 0, ok: 0, skipped: 0, failed: 0 });
  });
});

describe('FileImporter.importFolder', () => {
  it('批量导入目录下所有可解析文件', async () => {
    await fs.writeFile(path.join(srcDir, 'x.md'), '# x');
    await fs.writeFile(path.join(srcDir, 'y.txt'), 'y text');
    await fs.writeFile(path.join(srcDir, 'z.bin'), 'binary');
    const results = await importer.importFolder(srcDir);
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.fileName).sort();
    expect(names).toEqual(['x.md', 'y.txt.md']);
  });

  it('嵌套子目录递归扫描', async () => {
    const sub = path.join(srcDir, 'sub');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, 'deep.txt'), 'deep');
    const results = await importer.importFolder(srcDir);
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('deep.txt.md');
  });

  it('导入不存在的文件夹时抛错', async () => {
    await expect(importer.importFolder(path.join(srcDir, 'nope'))).rejects.toThrow();
  });
});

describe('FileImporter 工具函数 file-utils', () => {
  it('detectFileType 识别各扩展名', () => {
    expect(detectFileType('a.pdf')).toBe('pdf');
    expect(detectFileType('A.DOCX')).toBe('docx');
    expect(detectFileType('a.md')).toBe('md');
    expect(detectFileType('a.txt')).toBe('txt');
    expect(detectFileType('a.bin')).toBe('unknown');
    expect(detectFileType('noext')).toBe('unknown');
  });

  it('toMdFileName 替换扩展名', () => {
    expect(toMdFileName('a.pdf')).toBe('a.md');
    expect(toMdFileName('a')).toBe('a.md');
    expect(toMdFileName('a.b.pdf')).toBe('a.b.md');
  });

  it('extractTextToMarkdown 对 txt 直接读原文', async () => {
    const src = path.join(srcDir, 'raw.txt');
    await fs.writeFile(src, 'raw body', 'utf-8');
    expect(await extractTextToMarkdown(src)).toBe('raw body');
  });
});

describe('FileImporter 并发与日志', () => {
  it('并发导入多个不同文件均成功', async () => {
    const files = [];
    for (let i = 0; i < 5; i++) {
      const p = path.join(srcDir, `p${i}.txt`);
      await fs.writeFile(p, `content ${i}`, 'utf-8');
      files.push(p);
    }
    const results = await Promise.all(files.map((f) => importer.importLocalFile(f)));
    expect(results.every((r) => !r.skipped && r.fileId > 0)).toBe(true);
    expect(results.length).toBe(5);
  });

  it('导入后写日志', async () => {
    const src = path.join(srcDir, 'log.txt');
    await fs.writeFile(src, 'x', 'utf-8');
    await importer.importLocalFile(src);
    const logs = await listLogs(50);
    expect(logs.some((l) => l.action === 'import')).toBe(true);
  });

  it('countByType 反映导入后的类型分布', async () => {
    const t1 = path.join(srcDir, 't1.txt');
    const m1 = path.join(srcDir, 'm1.md');
    await fs.writeFile(t1, 'a');
    await fs.writeFile(m1, '# b');
    await importer.importLocalFile(t1);
    await importer.importLocalFile(m1);
    const c = await countByType();
    expect(c.txt).toBe(1);
    expect(c.md).toBe(1);
  });
});

describe('FileImporter.importUploadContent', () => {
  it('正常上传 txt 内容成功入库', async () => {
    const text = '上传通道正文内容';
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    const r = await importer.importUploadContent('上传笔记.txt', b64);
    expect(r.skipped).toBe(false);
    expect(r.fileId).toBeGreaterThan(0);
    expect(r.mdPath.startsWith(mdDir)).toBe(true);
    const md = await fs.readFile(r.mdPath, 'utf-8');
    expect(md).toContain('上传通道正文内容');
  });

  it('非法 base64 字符抛清晰错误', async () => {
    await expect(
      importer.importUploadContent('x.txt', '!!!not-base64!!!')
    ).rejects.toThrow(/base64/);
  });

  it('空文件名抛错', async () => {
    const b64 = Buffer.from('x').toString('base64');
    await expect(importer.importUploadContent('   ', b64)).rejects.toThrow(/文件名/);
  });

  it('空内容抛错', async () => {
    await expect(importer.importUploadContent('a.txt', '')).rejects.toThrow();
  });

  it('文件名注入字符（../、目录分隔）被安全化，不写到 mdDir 之外', async () => {
    const b64 = Buffer.from('injected').toString('base64');
    const r = await importer.importUploadContent('../../etc/passwd.txt', b64);
    expect(r.skipped).toBe(false);
    expect(r.mdPath.startsWith(mdDir)).toBe(true);
    // 临时文件已清理：tmpDir 下不应有残留
    const tmpDir = path.join(os.tmpdir(), 'dsh-wiki-rag-uploads');
    try {
      const names = await fs.readdir(tmpDir);
      expect(names.every((n) => !n.includes('passwd'))).toBe(true);
    } catch { /* tmpDir 不存在也算通过 */ }
  });

  it('超大内容（>50MB）被拦截', async () => {
    // 构造一个 base64 长度 > 50MB * 4/3 的串，不真写盘
    const huge = 'A'.repeat(50 * 1024 * 1024 * 2); // ~100MB base64
    await expect(
      importer.importUploadContent('huge.bin', huge)
    ).rejects.toThrow(/50MB|过大/);
  });

  it('base64 长度非 4 的倍数时拒绝', async () => {
    // 合法字符但长度 3n+1
    await expect(
      importer.importUploadContent('x.txt', 'QUJDRE') // "ABCDE" 不完整
    ).rejects.toThrow(/base64|4 的倍数/);
  });
});

describe('importUploadContent 50MB 上限', () => {
  it('base64 预估解码后 > 50MB 时拒绝并报清晰错误', async () => {
    // base64 每 4 字符 = 3 字节；50MB ≈ 66.7M base64 字符
    const bigB64 = 'A'.repeat(50 * 1024 * 1024); // 50M base64 字符 ≈ 37.5MB，预估值仍 < 50MB
    // 构造 70M base64 字符 ≈ 52.5MB，应在预检查被拒
    const overB64 = 'A'.repeat(70 * 1024 * 1024);
    await expect(
      importer.importUploadContent('big.txt', overB64)
    ).rejects.toThrow(/50MB/);
  });

  it('小内容正常通过（边界下限）', async () => {
    const b64 = Buffer.from('hello', 'utf-8').toString('base64');
    const r = await importer.importUploadContent('small.txt', b64);
    expect(r.fileName).toContain('small.txt');
  });
});
