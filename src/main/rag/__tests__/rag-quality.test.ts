import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { insertKnowledgeFile } from '../../db/knowledge-db';
import { replaceFileChunks } from '../../db/vector-db';
import { embedText } from '../embedding';
import { ragSearch, normalizeSearchInput } from '../rag-search';

let dir: string;
let dbPath: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'rag-bench-'));
  dbPath = path.join(dir, 'wiki.db');
});
afterEach(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * 端到端检索质量基准：构造带明确主题词的语料入库，
 * 验证在默认 embedding（fallback 哈希向量）+ 关键词加权下，
 * 检索能稳定命中预期文件、排序合理、topK 生效。
 * 这是可执行的 RAG 质量基准——若接入真实 embedding（openai/local），
 * 同一套断言仍成立，且语义命中质量会更高。
 */
async function seed(files: Array<{ name: string; text: string }>): Promise<number[]> {
  const ids: number[] = [];
  for (const f of files) {
    const fileId = await insertKnowledgeFile({
      file_name: f.name,
      source_path: `/tmp/${f.name}`,
      md_path: `/tmp/${f.name}.md`,
      zip_archive_path: '',
      file_type: 'md',
      create_time: Date.now(),
      last_sync_time: 0,
      folder_id: null,
    });
    const vec = await embedText(f.text);
    await replaceFileChunks(fileId, [{ text: f.text, vector: vec }]);
    ids.push(fileId);
  }
  return ids;
}

describe('RAG 检索质量基准（fallback embedding + 关键词加权）', () => {
  it('查询能稳定命中含主题词的文档（top1 为预期文件）', async () => {
    await initDatabase(dbPath);
    await seed([
      { name: 'banana.md', text: 'banana fruit nutrition potassium' },
      { name: 'apple.md', text: 'apple fruit nutrition fiber' },
      { name: 'car.md', text: 'car engine gasoline vehicle' },
    ]);
    const r = await ragSearch('banana fruit', 3, 0.5);
    expect(r.length).toBe(3);
    expect(r[0].file_name).toBe('banana.md'); // 命中 banana 全词
    expect(r[0].score).toBeGreaterThan(r[2].score); // 排序降序
  });

  it('topK 生效：只返回 topK 条，且按分数降序', async () => {
    await initDatabase(dbPath);
    await seed([
      { name: 'a.md', text: 'alpha beta' },
      { name: 'b.md', text: 'beta gamma' },
      { name: 'c.md', text: 'gamma delta' },
    ]);
    const r = await ragSearch('alpha beta gamma', 2, 0.6);
    expect(r.length).toBe(2);
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
    // a(alpha beta)/b(beta gamma) 各命中 2 个词，关键词分最高；c(gamma delta) 仅 1 词，必被排除
    expect(new Set([r[0].file_name, r[1].file_name])).toEqual(new Set(['a.md', 'b.md']));
    expect(r.every((x) => x.file_name !== 'c.md')).toBe(true);
  });

  it('空库返回空数组；空 query 归一化返回 null', async () => {
    await initDatabase(dbPath);
    expect(await ragSearch('anything')).toEqual([]);
    expect(normalizeSearchInput('   ')).toBeNull();
  });

  it('关键词不匹配时仅凭向量也能返回（不回退为空，score 存在）', async () => {
    await initDatabase(dbPath);
    await seed([{ name: 'doc.md', text: 'some unrelated english words here' }]);
    const r = await ragSearch('totally different query words', 1);
    expect(r.length).toBe(1); // 向量候选兜底返回
    expect(typeof r[0].score).toBe('number');
    expect(r[0].file_id).toBeGreaterThan(0);
  });
});
