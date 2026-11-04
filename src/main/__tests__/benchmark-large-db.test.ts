import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { initDatabase, closeDatabase, run, runInTransaction } from '../db/sqlite-init';
import { replaceFileChunks, countChunks } from '../db/vector-db';
import { ragSearch } from '../rag/rag-search';

/**
 * 大库基准断言（宽松上限，防 flaky）。
 * 构造 ≥100k vector_chunks 的临时库，只断言最稳的三项：
 *  - 构造总耗时 < 120s
 *  - 关键词预过滤检索 < 5s
 *  - replaceFileChunks 5000 chunk < 10s
 * 完整五项基准见 scripts/benchmark.cjs 与 docs/BENCHMARK-2026-11-04.md。
 */
const FILE_COUNT = 5000;
const CHUNK_COUNT = 100000;
const CHUNKS_PER_FILE = CHUNK_COUNT / FILE_COUNT;
const KEYWORDS = ['向量检索', '知识库', 'SQLite', '缓存', '索引', '并发', '事务', '嵌入'];

function makeChunkText(i: number): string {
  const kw1 = KEYWORDS[i % KEYWORDS.length];
  const kw2 = KEYWORDS[(i * 7 + 3) % KEYWORDS.length];
  return `【片段${i}】核心概念涉及${kw1}与${kw2}。这是用于验证大库检索性能的中文文本段落。`;
}

function makeVector(): Buffer {
  const buf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) buf.writeFloatBE((Math.sin(i * 12.9898) * 43758.5453) % 1, i * 4);
  return buf;
}

describe('大库基准（100k chunks）', () => {
  let tmpDir = '';
  let buildMs = 0;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-large-test-'));
    const t0 = performance.now();
    await initDatabase(path.join(tmpDir, 'bench.db'));

    runInTransaction(() => {
      for (let i = 0; i < FILE_COUNT; i++) {
        run(
          `INSERT INTO knowledge_files
           (file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time, folder_id, status)
           VALUES (?, ?, ?, '', 'md', ?, ?, NULL, 'ready')`,
          [`doc-${i}.md`, `/src/doc-${i}.md`, path.join(tmpDir, `doc-${i}.md`), Date.now(), Date.now()]
        );
      }
    });

    runInTransaction(() => {
      for (let i = 0; i < CHUNK_COUNT; i++) {
        const fileId = Math.floor(i / CHUNKS_PER_FILE) + 1;
        run('INSERT INTO vector_chunks (file_id, chunk_text, vector_blob) VALUES (?, ?, ?)', [
          fileId,
          makeChunkText(i),
          makeVector(),
        ]);
      }
    });
    buildMs = performance.now() - t0;
  }, 180000);

  afterAll(async () => {
    closeDatabase();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('构造完成：5000 文件 / 100k chunks，总耗时 < 120s', async () => {
    expect(await countChunks()).toBe(CHUNK_COUNT);
    expect(buildMs).toBeLessThan(120_000);
  }, 180000);

  it('100k chunk 下关键词预过滤检索 < 5s', async () => {
    const t0 = performance.now();
    const results = await ragSearch('向量检索 缓存', 5);
    const dt = performance.now() - t0;
    expect(results.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(5_000);
  }, 30000);

  it('replaceFileChunks 替换 5000 chunk < 10s（事务化写入）', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      text: makeChunkText(900_000 + i),
      vector: makeVector(),
    }));
    const t0 = performance.now();
    await replaceFileChunks(1, rows);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(10_000);
  }, 30000);
});
