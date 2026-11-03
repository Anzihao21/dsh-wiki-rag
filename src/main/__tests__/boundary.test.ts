import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../db/sqlite-init';
import {
  assertInsideDir,
  sanitizeFileName,
  assertZipEntryInside,
} from '../file/path-guard';
import { resolveUniqueFileName, isUncPath } from '../file/name-auto-rename';
import {
  detectFileType,
  toMdFileName,
  sha256Text,
  extractTextToMarkdown,
} from '../file/file-utils';
import { compareMarkdown, buildDiffResult, isTextSame } from '../file/diff-compare';
import { chunkText, chunkTextSmart } from '../rag/text-chunk';
import { DEFAULT_SETTINGS } from '../types';

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-bound-'));
  await initDatabase(path.join(tmpDir, 'b.db'));
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('sanitizeFileName 边界', () => {
  it('空字符串返回空', () => {
    expect(sanitizeFileName('')).toBe('');
  });

  it('去除目录分隔符', () => {
    expect(sanitizeFileName('a/b/c')).toBe('a_b_c');
    expect(sanitizeFileName('a\\b\\c')).toBe('a_b_c');
  });

  it('去除 .. 段', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc_passwd');
  });

  it('去除控制字符', () => {
    expect(sanitizeFileName('a\x00b\x1fc')).toBe('abc');
  });

  it('首尾空白被 trim', () => {
    expect(sanitizeFileName('  spaced.md  ')).toBe('spaced.md');
  });

  it('非字符串输入返回空', () => {
    // @ts-expect-error 故意传非字符串
    expect(sanitizeFileName(undefined)).toBe('');
    // @ts-expect-error 故意传非字符串
    expect(sanitizeFileName(null)).toBe('');
    // @ts-expect-error 故意传非字符串
    expect(sanitizeFileName(123)).toBe('');
  });
});

describe('assertInsideDir 边界', () => {
  it('正常子路径通过', () => {
    expect(() => assertInsideDir('/a/b/c.md', '/a')).not.toThrow();
  });

  it('同一路径通过', () => {
    expect(() => assertInsideDir('/a', '/a')).not.toThrow();
  });

  it('路径穿越抛错', () => {
    expect(() => assertInsideDir('/etc/passwd', '/a')).toThrow();
  });

  it('.. 段抛错', () => {
    expect(() => assertInsideDir('/a/../b', '/a')).toThrow();
  });
});

describe('assertZipEntryInside 边界', () => {
  it('正常条目通过', () => {
    expect(() => assertZipEntryInside('md/a.md', '/target')).not.toThrow();
  });

  it('zip-slip 条目抛错', () => {
    expect(() => assertZipEntryInside('../evil.md', '/target')).toThrow();
  });

  it('绝对路径条目抛错', () => {
    expect(() => assertZipEntryInside('/etc/passwd', '/target')).toThrow();
  });
});

describe('resolveUniqueFileName 边界', () => {
  it('无冲突返回原名', () => {
    expect(resolveUniqueFileName('a.md', [])).toBe('a.md');
  });

  it('一次冲突加 (1)', () => {
    expect(resolveUniqueFileName('a.md', ['a.md'])).toBe('a(1).md');
  });

  it('连续冲突加 (2)', () => {
    expect(resolveUniqueFileName('a.md', ['a.md', 'a(1).md'])).toBe('a(2).md');
  });

  it('无扩展名文件也能编号', () => {
    expect(resolveUniqueFileName('README', ['README'])).toBe('README(1)');
  });

  it('中间有空号时跳过', () => {
    expect(resolveUniqueFileName('a.md', ['a.md', 'a(2).md'])).toBe('a(1).md');
  });
});

describe('isUncPath 边界', () => {
  it('空字符串返回 false', () => {
    expect(isUncPath('')).toBe(false);
  });

  it('双反斜杠开头识别', () => {
    expect(isUncPath('\\\\server\\share')).toBe(true);
  });

  it('双斜杠开头识别', () => {
    expect(isUncPath('//server/share')).toBe(true);
  });

  it('普通路径返回 false', () => {
    expect(isUncPath('/home/user')).toBe(false);
    expect(isUncPath('C:\\Windows')).toBe(false);
  });
});

describe('detectFileType / toMdFileName 边界', () => {
  it('大写扩展名识别', () => {
    expect(detectFileType('A.PDF')).toBe('pdf');
  });

  it('无扩展名 unknown', () => {
    expect(detectFileType('Makefile')).toBe('unknown');
  });

  it('toMdFileName 对无扩展名追加 .md', () => {
    expect(toMdFileName('README')).toBe('README.md');
  });
});

describe('sha256Text 边界', () => {
  it('超长文本哈希稳定', () => {
    const long = '中'.repeat(100000);
    expect(sha256Text(long)).toBe(sha256Text(long));
  });

  it('空串与非空串哈希不同', () => {
    expect(sha256Text('')).not.toBe(sha256Text('x'));
  });
});

describe('chunkText 边界', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('', 100, 10)).toEqual([]);
  });

  it('文本短于 chunkSize 时单片段', () => {
    expect(chunkText('short', 1000, 10)).toEqual(['short']);
  });

  it('chunkSize=0 时退化为 size=1', () => {
    const r = chunkText('abc', 0, 0);
    expect(r.length).toBeGreaterThan(0);
  });

  it('超大 overlap 被钳制到 size/2', () => {
    const r = chunkText('abcdef', 4, 1000);
    expect(r.length).toBeGreaterThan(0);
  });

  it('chunkTextSmart heading 模式按标题切分', () => {
    const text = '# Title\n\nbody\n\n## Sub\n\nsub body';
    const r = chunkTextSmart(text, 1000, 10, 'heading');
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe('diff 工具边界', () => {
  it('两段空文本 diff 单段', () => {
    const d = compareMarkdown('', '');
    expect(d.length).toBeGreaterThan(0);
  });

  it('isTextSame 相同返回 true', () => {
    expect(isTextSame('a', 'a')).toBe(true);
  });

  it('buildDiffResult 结构完整', () => {
    const r = buildDiffResult(1, 'x.md', 'old', 'new');
    expect(r.fileId).toBe(1);
    expect(r.fileName).toBe('x.md');
    expect(r.oldText).toBe('old');
    expect(r.newText).toBe('new');
    expect(Array.isArray(r.diff)).toBe(true);
  });
});

describe('extractTextToMarkdown 文件系统边界', () => {
  it('不存在的文件抛错', async () => {
    await expect(extractTextToMarkdown(path.join(tmpDir, 'nope.txt'))).rejects.toThrow();
  });

  it('特殊字符路径（中文/空格）能读', async () => {
    const p = path.join(tmpDir, '中文 文档.txt');
    await fs.writeFile(p, '内容', 'utf-8');
    expect(await extractTextToMarkdown(p)).toBe('内容');
  });
});

describe('DEFAULT_SETTINGS 完整性', () => {
  it('关键字段存在', () => {
    expect(DEFAULT_SETTINGS.snapshotKeep).toBe(3);
    expect(DEFAULT_SETTINGS.chunkSize).toBe(800);
    expect(DEFAULT_SETTINGS.rerankTopK).toBe(5);
  });
});
