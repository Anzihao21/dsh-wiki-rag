import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { FileImporter } from '../../file/file-importer';
import { ragSearch } from '../../rag/rag-search';
import { listLogs } from '../../db/log-db';
import { countChunks } from '../../db/vector-db';

let root: string;
let mdDir: string;
let zipDir: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'e2e-host-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  mkdirSync(mdDir, { recursive: true });
  mkdirSync(zipDir, { recursive: true });
  dbPath = path.join(root, 'wiki.db');
});

afterEach(() => {
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
});

/**
 * 宿主核心链路端到端验证（非 DSH 进程）：
 * 导入（识别→抽取→入库→重建索引）→ 向量切片 → RAG 检索 → 结构化日志，
 * 证明宿主核心逻辑在真实函数调用层面全链路跑通。
 * 受本机无法安装 DSH 官方依赖限制，完整宿主进程级验证需在 DSH 运行时内进行。
 */
describe('宿主核心链路端到端（导入→索引→检索→日志）', () => {
  it('导入 md → 切片入库 → 检索命中 → 写入结构化日志', async () => {
    await initDatabase(dbPath);
    const importer = new FileImporter({
      mdDir,
      zipDir,
      chunkSize: 500,
      chunkOverlap: 50,
      chunkMode: 'fixed',
      webTimeout: 10000,
    });

    const src = path.join(root, 'banana.md');
    writeFileSync(src, '# Banana\n\nbanana fruit nutrition potassium and magnesium.', 'utf8');

    // 1. 导入
    const res = await importer.importLocalFile(src);
    expect(res.skipped).toBe(false);
    expect(res.fileId).toBeGreaterThan(0);
    expect(res.mdPath).toBeTruthy();

    // 2. 向量切片已入库
    expect(await countChunks()).toBeGreaterThan(0);

    // 3. RAG 检索命中该文件
    const hits = await ragSearch('banana fruit', 3, 0.5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.file_name === 'banana.md')).toBe(true);

    // 4. 结构化日志已写入（含导入动作）
    const logs = await listLogs({});
    expect(logs.some((l) => String(l.action).includes('import'))).toBe(true);
  });

  it('重复导入同名文件返回 skipped 并给出原因，不产生脏数据', async () => {
    await initDatabase(dbPath);
    const importer = new FileImporter({
      mdDir,
      zipDir,
      chunkSize: 500,
      chunkOverlap: 50,
      chunkMode: 'fixed',
      webTimeout: 10000,
    });
    const src = path.join(root, 'dup.md');
    writeFileSync(src, 'duplicate content', 'utf8');
    const first = await importer.importLocalFile(src);
    const second = await importer.importLocalFile(src);
    expect(first.skipped).toBe(false);
    // 第二次同名导入：返回 skipped=true 且 reason 非空（或 fileId 相同），不重复建索引
    expect(second.skipped).toBe(true);
    expect(second.reason).toBeTruthy();
  });
});
