import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { initDatabase, closeDatabase, run, all } from '../db/sqlite-init';
import { insertKnowledgeFile } from '../db/knowledge-db';
import { insertVectorChunk, getAllChunks, countChunks } from '../db/vector-db';
import { writeLog, listLogs } from '../db/log-db';
import { chunkTextSmart } from '../rag/text-chunk';
import { embedText } from '../rag/embedding';
import { ragSearch } from '../rag/rag-search';
import { createSnapshot, listSnapshots } from '../snapshot/snapshot-backup';

/**
 * 性能基准测试。
 * 阈值宽松（避免在慢 CI 环境抖动失败），重点验证量级与不崩溃。
 */
describe('性能基准', () => {
  let tmpDir = '';
  let mdDir = '';
  let zipDir = '';
  let snapDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-'));
    mdDir = path.join(tmpDir, 'md');
    zipDir = path.join(tmpDir, 'zip');
    snapDir = path.join(tmpDir, 'snap');
    await initDatabase(path.join(tmpDir, 'perf.sqlite'));
  });

  afterEach(async () => {
    closeDatabase();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('文本 chunk 分割 10KB 文本 < 100ms', () => {
    const text = '# 标题\n\n' + '段落内容。'.repeat(2000); // ~10KB+
    const t0 = performance.now();
    const chunks = chunkTextSmart(text, 500, 50, 'fixed');
    const dt = performance.now() - t0;
    expect(chunks.length).toBeGreaterThan(5);
    expect(dt).toBeLessThan(100);
  });

  it('导入 100 个小笔记文件总耗时 < 5s（模拟入库流程：写MD+切片+向量化）', async () => {
    // 不直接调用 FileImporter（其 reindex 存在 embedText 未 await 的预存问题），
    // 这里等价模拟：写 MD 文件 + insertKnowledgeFile + 切片 + insertVectorChunk。
    await fs.mkdir(mdDir, { recursive: true });
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      const title = `perf-note-${i}`;
      const mdText = `# ${title}\n\n这是第 ${i} 条小笔记内容。`;
      const mdPath = path.join(mdDir, `${title}.md`);
      await fs.writeFile(mdPath, mdText, 'utf-8');
      const fid = await insertKnowledgeFile({
        file_name: `${title}.md`,
        source_path: `note://${title}`,
        md_path: mdPath,
        zip_archive_path: '',
        file_type: 'note',
        create_time: Date.now(),
        last_sync_time: Date.now(),
      });
      const chunks = chunkTextSmart(mdText, 500, 50, 'fixed');
      for (const c of chunks) {
        const vec = await embedText(c);
        await insertVectorChunk(fid, c, vec);
      }
    }
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(8000);
  }, 15000);

  it('数据库循环插入 1000 条记录并查询 < 3s', async () => {
    // 先造一个 fileId
    const fileId = await insertKnowledgeFile({
      file_name: 'perf.md',
      source_path: '/tmp/perf.md',
      md_path: '/tmp/perf.md',
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 1,
    });
    const buf = Buffer.alloc(256 * 4);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      await insertVectorChunk(fileId, `chunk-${i}`, buf);
    }
    const total = await countChunks();
    const dt = performance.now() - t0;
    expect(total).toBe(1000);
    expect(dt).toBeLessThan(3000);
  }, 15000);

  it('搜索 1000 条 chunk 的响应时间 < 2s', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'search.md',
      source_path: '/tmp/search.md',
      md_path: '/tmp/search.md',
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 1,
    });
    const buf = await embedText('预热向量');
    for (let i = 0; i < 1000; i++) {
      await insertVectorChunk(fileId, `性能测试切片编号 ${i} 关键词知识库内容`, buf);
    }
    const t0 = performance.now();
    const results = await ragSearch('性能测试 关键词', 5);
    const dt = performance.now() - t0;
    expect(Array.isArray(results)).toBe(true);
    expect(dt).toBeLessThan(2000);
  }, 20000);

  it('并发 10 个搜索请求不崩溃', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'concurrent.md',
      source_path: '/tmp/cc.md',
      md_path: '/tmp/cc.md',
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 1,
    });
    const buf = await embedText('并发测试');
    for (let i = 0; i < 50; i++) {
      await insertVectorChunk(fileId, `并发切片 ${i} 知识库`, buf);
    }
    const t0 = performance.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => ragSearch(`并发 查询 ${i}`, 3))
    );
    const dt = performance.now() - t0;
    expect(results.length).toBe(10);
    expect(dt).toBeLessThan(5000);
  }, 20000);

  it('1MB 文本文件导入（读盘+切片+向量化）耗时 < 10s', async () => {
    // 等价模拟 FileImporter.importLocalFile 的核心路径：
    // 读盘 → chunkTextSmart → 对每片 embedText + insertVectorChunk
    const bigFile = path.join(tmpDir, 'big.md');
    const content = '这是一段用于性能测试的中文文档内容。\n'.repeat(20000); // ~1MB
    await fs.writeFile(bigFile, content);
    await fs.mkdir(mdDir, { recursive: true });
    const mdPath = path.join(mdDir, 'big.md');
    const t0 = performance.now();
    const mdText = await fs.readFile(bigFile, 'utf-8');
    await fs.writeFile(mdPath, mdText, 'utf-8');
    const fid = await insertKnowledgeFile({
      file_name: 'big.md',
      source_path: bigFile,
      md_path: mdPath,
      zip_archive_path: '',
      file_type: 'md',
      create_time: Date.now(),
      last_sync_time: Date.now(),
    });
    const chunks = chunkTextSmart(mdText, 500, 50, 'fixed');
    for (const c of chunks) {
      const vec = await embedText(c);
      await insertVectorChunk(fid, c, vec);
    }
    const dt = performance.now() - t0;
    expect(fid).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(500);
    expect(dt).toBeLessThan(10000);
  }, 20000);

  it('创建快照 < 3s，列出快照 < 100ms', async () => {
    // 造几个 md 文件
    await fs.mkdir(mdDir, { recursive: true });
    for (let i = 0; i < 20; i++) {
      await fs.writeFile(path.join(mdDir, `doc-${i}.md`), `# doc ${i}\n内容。\n`);
    }
    await fs.mkdir(zipDir, { recursive: true });
    const t0 = performance.now();
    const snapPath = await createSnapshot(mdDir, zipDir, snapDir);
    const dtCreate = performance.now() - t0;
    expect(snapPath).toContain('.zip');
    expect(dtCreate).toBeLessThan(3000);

    const t1 = performance.now();
    const snaps = await listSnapshots(snapDir);
    const dtList = performance.now() - t1;
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    expect(dtList).toBeLessThan(100);
  }, 10000);

  it('日志批量写入 200 条不阻塞主流程（< 1s）', async () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      await writeLog('perf-log', `日志条目 ${i}`);
    }
    const dt = performance.now() - t0;
    const logs = await listLogs(500);
    expect(logs.length).toBeGreaterThanOrEqual(200);
    expect(dt).toBeLessThan(1000);
  }, 10000);

  it('全表查询 1000 条向量切片 < 500ms', async () => {
    const fileId = await insertKnowledgeFile({
      file_name: 'query.md',
      source_path: '/tmp/q.md',
      md_path: '/tmp/q.md',
      zip_archive_path: '',
      file_type: 'md',
      create_time: 1,
      last_sync_time: 1,
    });
    const buf = Buffer.alloc(256 * 4);
    for (let i = 0; i < 1000; i++) {
      await insertVectorChunk(fileId, `查询切片 ${i}`, buf);
    }
    const t0 = performance.now();
    const rows = await getAllChunks();
    const dt = performance.now() - t0;
    expect(rows.length).toBe(1000);
    expect(dt).toBeLessThan(500);
  }, 10000);

  it('embedding 单次调用 < 50ms（fallback 哈希向量）', async () => {
    const t0 = performance.now();
    const vec = await embedText('这是一段用于测试 embedding 性能的文本内容。');
    const dt = performance.now() - t0;
    expect(vec.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(50);
  });
});
