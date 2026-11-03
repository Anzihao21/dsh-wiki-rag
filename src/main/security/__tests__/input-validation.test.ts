import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { sanitizeFileName } from '../../file/path-guard';
import { normalizeSearchInput } from '../../rag/rag-search';
import { detectFileType, isOversize } from '../../file/file-utils';
import { chunkText } from '../../rag/text-chunk';
import { initDatabase, closeDatabase, run } from '../../db/sqlite-init';
import { insertKnowledgeFile } from '../../db/knowledge-db';
import { writeLog } from '../../db/log-db';

/**
 * 输入校验专项测试。
 * 覆盖：SQL 注入式文件名、搜索 query 特殊字符、JSON 异常输入、
 * 超大请求体模拟、不允许扩展名、null 字节、超长文件名。
 */
describe('security: 输入校验', () => {
  describe('文件名清洗与 SQL 注入防护', () => {
    it('文件名包含 SQL 注入尝试时被清洗为安全字符串', () => {
      const evil = "'; DROP TABLE knowledge_files;--";
      const safe = sanitizeFileName(evil);
      // 清洗后不含目录分隔符，且作为纯字符串进入参数化查询
      expect(safe).not.toContain('/');
      expect(safe).not.toContain('\\');
      // 引号与分号作为普通字符保留，不构成 SQL 语句
      expect(typeof safe).toBe('string');
    });

    it('参数化查询不会被注入的文件名破坏表数据', async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iv-sql-'));
      await initDatabase(path.join(tmp, 'db.sqlite'));
      try {
        const evilName = "'; DROP TABLE knowledge_files;--";
        // 直接通过参数化接口插入恶意文件名，表应仍存在
        await insertKnowledgeFile({
          file_name: evilName,
          source_path: '/tmp/x.md',
          md_path: '/tmp/x.md',
          zip_archive_path: '',
          file_type: 'md',
          create_time: 1,
          last_sync_time: 1,
        });
        // 再次写入并查表行数，验证表未被 DROP
        const rows = await (await import('../../db/knowledge-db')).listKnowledgeFiles();
        expect(rows.length).toBe(1);
        expect(rows[0].file_name).toBe(evilName);
      } finally {
        closeDatabase();
        await fs.rm(tmp, { recursive: true, force: true });
      }
    });

    it('文件名包含 null 字节被剔除', () => {
      const out = sanitizeFileName('evil.md\x00.png');
      expect(out).not.toContain('\0');
      // 控制字符不可见，但字符串仍可用
      expect(typeof out).toBe('string');
    });

    it('超长文件名（255+ 字符）不抛错，sanitize 后仍可用', () => {
      const long = 'a'.repeat(300) + '.md';
      const out = sanitizeFileName(long);
      expect(out.length).toBeGreaterThan(255);
      expect(out).not.toContain('/');
      expect(out.endsWith('.md')).toBe(true);
    });
  });

  describe('搜索输入归一化', () => {
    it('搜索 query 中的特殊字符（SQL/正则注入）被当作普通字符串处理', () => {
      const malicious = "'; DROP TABLE-- UNION SELECT * FROM knowledge_files--";
      const norm = normalizeSearchInput(malicious, 5);
      expect(norm).not.toBeNull();
      expect(norm!.query).toBe(malicious);
      expect(norm!.topK).toBe(5);
    });

    it('空串 / 纯空白 query 返回 null（不进 embedding）', () => {
      expect(normalizeSearchInput('', 5)).toBeNull();
      expect(normalizeSearchInput('   ', 5)).toBeNull();
    });

    it('topK 越界被 clamp 到 [1, 50]', () => {
      expect(normalizeSearchInput('hello', -1).topK).toBe(1);
      expect(normalizeSearchInput('hello', 999).topK).toBe(50);
      expect(normalizeSearchInput('hello', NaN).topK).toBe(5);
      expect(normalizeSearchInput('hello', undefined).topK).toBe(5);
    });

    it('非字符串 query（对象/数字/null）返回 null', () => {
      expect(normalizeSearchInput({} as any, 5)).toBeNull();
      expect(normalizeSearchInput(123 as any, 5)).toBeNull();
      expect(normalizeSearchInput(null as any, 5)).toBeNull();
    });
  });

  describe('JSON 解析异常输入', () => {
    it('畸形 JSON 字符串解析时抛出可捕获异常（不静默吞掉）', () => {
      expect(() => JSON.parse('{oops: not json')).toThrow();
      expect(() => JSON.parse('undefined')).toThrow();
      expect(() => JSON.parse('{"a": 1,}')).toThrow();
    });

    it('空文本 chunk 分割返回空数组而不抛错', () => {
      expect(chunkText('', 100, 10)).toEqual([]);
      expect(chunkText('   ', 100, 10)).toEqual([]);
    });
  });

  describe('文件类型与大小校验', () => {
    it('不允许的扩展名被识别为 unknown', () => {
      expect(detectFileType('virus.exe')).toBe('unknown');
      expect(detectFileType('payload.sh')).toBe('unknown');
      expect(detectFileType('archive.zip')).toBe('unknown');
    });

    it('isOversize 对小文件返回 false，对超大文件返回 true', async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iv-size-'));
      const small = path.join(tmp, 'small.md');
      await fs.writeFile(small, 'hello');
      // 阈值 0MB：任何非空文件都算超
      expect(await isOversize(small, 0)).toBe(true);
      // 阈值 10MB：小文件不超
      expect(await isOversize(small, 10)).toBe(false);
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it('writeLog 接收任意字符串 detail 不崩溃（注入式文本安全入库）', async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iv-log-'));
      await initDatabase(path.join(tmp, 'db.sqlite'));
      try {
        await writeLog('test', "'; DROP TABLE operation_log;--");
        await writeLog('test', JSON.stringify({ evil: '<script>alert(1)</script>' }));
        // 日志表仍可写
        const rows = await (await import('../../db/log-db')).listLogs(10);
        expect(rows.length).toBe(2);
      } finally {
        closeDatabase();
        await fs.rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('超大请求体模拟', () => {
    it('chunkText 对 1MB 文本不抛错，输出可控切片数', () => {
      const huge = 'a'.repeat(1024 * 1024);
      const chunks = chunkText(huge, 500, 50);
      expect(chunks.length).toBeGreaterThan(100);
      expect(chunks.length).toBeLessThan(5000);
    });
  });
});
