import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { normalizeSearchInput } from '../rag-search';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { replaceFileChunks, getChunksForSearch } from '../../db/vector-db';
import { insertKnowledgeFile } from '../../db/knowledge-db';

describe('normalizeSearchInput 入参归一化', () => {
  it('空串 / 纯空白返回 null', () => {
    expect(normalizeSearchInput('', 5)).toBeNull();
    expect(normalizeSearchInput('   ', 5)).toBeNull();
    expect(normalizeSearchInput(null, 5)).toBeNull();
    expect(normalizeSearchInput(undefined, 5)).toBeNull();
    expect(normalizeSearchInput(123 as any, 5)).toBeNull();
  });

  it('正常 query + 默认 topK', () => {
    const r = normalizeSearchInput('向量检索', undefined);
    expect(r).toEqual({ query: '向量检索', topK: 5 });
  });

  it('topK 越界 clamp 到 [1, 50]', () => {
    expect(normalizeSearchInput('q', 0)!.topK).toBe(1);
    expect(normalizeSearchInput('q', -100)!.topK).toBe(1);
    expect(normalizeSearchInput('q', 9999)!.topK).toBe(50);
    expect(normalizeSearchInput('q', 20)!.topK).toBe(20);
  });

  it('topK 非数字 / NaN 时回退 5', () => {
    expect(normalizeSearchInput('q', 'abc' as any)!.topK).toBe(5);
    expect(normalizeSearchInput('q', NaN)!.topK).toBe(5);
  });

  it('query 超长截断到 4000', () => {
    const long = 'a'.repeat(10000);
    const r = normalizeSearchInput(long, 5)!;
    expect(r.query.length).toBe(4000);
  });

  it('query 首尾空白被 trim', () => {
    expect(normalizeSearchInput('  hello  ', 5)!.query).toBe('hello');
  });
});

describe('getChunksForSearch 候选池预过滤', () => {
  let tmpDir = '';
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-search-'));
    await initDatabase(path.join(tmpDir, 's.db'));
    // 灌 250 个 chunk（>200 阈值触发预过滤）：10 个含"向量"、10 个含"导入"、230 个无关
    const dummyVec = Buffer.alloc(16);
    for (let i = 0; i < 250; i++) {
      const fid = await insertKnowledgeFile({
        file_name: `f${i}.md`,
        source_path: `/src/f${i}.md`,
        md_path: `/kb/f${i}.md`,
        zip_archive_path: '',
        file_type: 'md',
        create_time: i,
        last_sync_time: i,
      });
      const text = i < 10
        ? `向量检索文档 ${i} 内容`
        : i < 20
          ? `导入流程说明 ${i} 内容`
          : `无关词XYZ ${i}`;
      await replaceFileChunks(fid, [{ text, vector: dummyVec }]);
    }
  });
  afterEach(async () => {
    closeDatabase();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('关键词命中只返回匹配的 chunk（预过滤生效）', async () => {
    const rows = await getChunksForSearch(['向量'], 100);
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.chunk_text.includes('向量'))).toBe(true);
  });

  it('多关键词 OR 命中：向量 或 导入 共 20 条', async () => {
    const rows = await getChunksForSearch(['向量', '导入'], 100);
    expect(rows.length).toBe(20);
  });

  it('关键词零命中时退化为全表（硬上限保护）', async () => {
    const rows = await getChunksForSearch(['不存在的词QQQ'], 5);
    // 退化路径仍受 maxCandidates 上限保护
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('候选数硬上限：大候选集场景下候选池不超过 maxCandidates', async () => {
    // 再灌 200 个 chunk（含无关词），验证上限
    const dummyVec = Buffer.alloc(16);
    for (let i = 0; i < 200; i++) {
      const fid = await insertKnowledgeFile({
        file_name: `extra${i}.md`,
        source_path: `/src/extra${i}.md`,
        md_path: `/kb/extra${i}.md`,
        zip_archive_path: '',
        file_type: 'md',
        create_time: i,
        last_sync_time: i,
      });
      await replaceFileChunks(fid, [{ text: `其他文档 ${i}`, vector: dummyVec }]);
    }
    // 关键词零命中 → 退化全表但被 LIMIT 截断
    const rows = await getChunksForSearch(['零命中词'], 50);
    expect(rows.length).toBeLessThanOrEqual(50);
  });
});
