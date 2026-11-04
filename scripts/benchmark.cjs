#!/usr/bin/env node
/**
 * dsh-wiki-rag 大库性能基准脚本（可重跑）。
 *
 * 做法：
 * 1. 用 esbuild 把内联的 TS 基准入口（BENCHMARK_ENTRY_SRC）打包成临时 CJS，
 *    node_modules 全部 external（运行时从仓库根 node_modules 解析）；
 * 2. 在临时目录建一个 ≥5000 knowledge_files / ≥100000 vector_chunks 的 SQLite 库；
 * 3. 跑 a-e 五项基准，每项 3 次取中位数，JSON 打印到 stdout。
 *
 * 用法：node scripts/benchmark.cjs
 * 产物：仅 stdout JSON；不写任何仓库文件（临时打包文件运行后即删）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const bundlePath = path.join(repoRoot, `.benchmark-bundle.tmp.cjs`);

const BENCHMARK_ENTRY_SRC = `
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { initDatabase, closeDatabase, run, runInTransaction } from './src/main/db/sqlite-init';
import { createFolder } from './src/main/db/knowledge-db';
import { replaceFileChunks, insertVectorChunk, countChunks, getChunksForSearch } from './src/main/db/vector-db';
import { writeLog } from './src/main/db/log-db';
import { embedText } from './src/main/rag/embedding';
import { ragSearch } from './src/main/rag/rag-search';
import { FileImporter } from './src/main/file/file-importer';

const FILE_COUNT = 5000;
const CHUNK_COUNT = 100000;            // 20 chunks / file
const CHUNKS_PER_FILE = CHUNK_COUNT / FILE_COUNT;
const VEC_BYTES = 256 * 4;             // 与 embedDim=256 的 float32 对齐

const KEYWORDS = ['向量检索','知识库','SQLite','缓存','索引','并发','事务','嵌入','性能优化','语义搜索','数据库','倒排'];

/** 确定性生成 50~200 字中文段落，轮换嵌入关键词，保证 LIKE 可命中 */
function makeChunkText(i: number): string {
  const kw1 = KEYWORDS[i % KEYWORDS.length];
  const kw2 = KEYWORDS[(i * 7 + 3) % KEYWORDS.length];
  const kw3 = KEYWORDS[(i * 13 + 5) % KEYWORDS.length];
  const len = 60 + (i % 120);
  const filler = '这一段用于验证检索与写入性能的中文文本内容，'.repeat(8);
  return [
    \`【片段\${i}】\`,
    \`核心概念涉及\${kw1}与\${kw2}的协同设计。\`,
    filler.slice(0, len),
    \`落地时需关注\${kw3}对整体延迟的影响。\`,
  ].join('');
}

function makeVector(): Buffer {
  // 确定性伪随机向量（每片不同，避免 cosine 退化）
  const buf = Buffer.alloc(VEC_BYTES);
  for (let i = 0; i < 256; i++) {
    buf.writeFloatBE(Math.sin(i * 12.9898) * 43758.5453 % 1, i * 4);
  }
  return buf;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main(): Promise<void> {
  const result: Record<string, any> = {
    env: { node: process.version, platform: process.platform, arch: process.arch },
  };
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bench-large-'));
  const mdDir = path.join(tmpDir, 'md');
  const zipDir = path.join(tmpDir, 'zip');
  await fsp.mkdir(mdDir, { recursive: true });
  await fsp.mkdir(zipDir, { recursive: true });

  // ---------- 1. 大库构造 ----------
  const tBuild0 = performance.now();
  await initDatabase(path.join(tmpDir, 'bench.db'));

  // folders: 20
  runInTransaction(() => {
    for (let i = 0; i < 20; i++) {
      run('INSERT INTO folders (name, parent_id, create_time) VALUES (?, NULL, ?)', [\`文件夹-\${i}\`, Date.now()]);
    }
  });

  // knowledge_files: 5000（单事务批量）
  runInTransaction(() => {
    for (let i = 0; i < FILE_COUNT; i++) {
      run(
        'INSERT INTO knowledge_files (file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time, folder_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          \`doc-\${i}.md\`, \`/src/doc-\${i}.md\`, path.join(mdDir, \`doc-\${i}.md\`), '', 'md',
          Date.now(), Date.now(), (i % 5) + 1, 'ready',
        ]
      );
    }
  });

  // vector_chunks: 100000（单事务批量，直接 SQL）
  runInTransaction(() => {
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const fileId = Math.floor(i / CHUNKS_PER_FILE) + 1;
      run(
        'INSERT INTO vector_chunks (file_id, chunk_text, vector_blob) VALUES (?, ?, ?)',
        [fileId, makeChunkText(i), makeVector()]
      );
    }
  });
  const buildMs = performance.now() - tBuild0;

  const totalChunks = await countChunks();
  const dbStat = await fsp.stat(path.join(tmpDir, 'bench.db')).catch(() => null);
  result.construction = {
    knowledge_files: FILE_COUNT,
    vector_chunks: totalChunks,
    folders: 20,
    buildMs: Math.round(buildMs),
    dbSizeMB: dbStat ? +(dbStat.size / 1024 / 1024).toFixed(1) : null,
  };

  // 预热（JIT / 连接池）
  await embedText('预热');
  await ragSearch('向量检索', 3);

  // ---------- 2a. RAG 检索 ----------
  const hitRuns: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    const res = await ragSearch('向量检索 缓存', 5);
    hitRuns.push(performance.now() - t0);
    if (r === 0) result.ragHitSample = res.length;
  }
  const missRuns: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    await ragSearch('不存在的关键词qwlkjxzz', 5);
    missRuns.push(performance.now() - t0);
  }
  result.ragSearch = {
    keywordHitMedianMs: +median(hitRuns).toFixed(1),
    keywordHitRuns: hitRuns.map((v) => +v.toFixed(1)),
    missFallbackMedianMs: +median(missRuns).toFixed(1),
    missFallbackRuns: missRuns.map((v) => +v.toFixed(1)),
  };

  // ---------- 2b. embedding fallback 哈希路径 ×1000 ----------
  const embedRuns: number[] = [];
  const embedPool = Array.from({ length: 20 }, (_, i) => makeChunkText(i));
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      await embedText(embedPool[i % embedPool.length]);
    }
    embedRuns.push(performance.now() - t0);
  }
  result.embedding = { per1000MedianMs: +median(embedRuns).toFixed(1), runs: embedRuns.map((v) => +v.toFixed(1)) };

  // ---------- 2c. 批量事务写入 replaceFileChunks 5000 ----------
  const targetFileId = 1;
  const rows5k = Array.from({ length: 5000 }, (_, i) => ({ text: makeChunkText(900000 + i), vector: makeVector() }));
  const txRuns: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    await replaceFileChunks(targetFileId, rows5k);
    txRuns.push(performance.now() - t0);
  }
  // 对照：非事务逐条插入 5000（每条一次提交）
  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) {
    await insertVectorChunk(targetFileId, makeChunkText(800000 + i), makeVector());
  }
  const naiveMs = performance.now() - t0;
  result.bulkWrite = {
    replace5000TxMedianMs: +median(txRuns).toFixed(1),
    replace5000TxRuns: txRuns.map((v) => +v.toFixed(1)),
    naiveInsert5000NoTxMs: +naiveMs.toFixed(1),
  };

  // ---------- 2d. 日志写入 ×1000 ----------
  const logRuns: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t = performance.now();
    for (let i = 0; i < 1000; i++) {
      await writeLog('bench-log', \`日志条目 \${i}\`);
    }
    logRuns.push(performance.now() - t);
  }
  result.writeLog = { per1000MedianMs: +median(logRuns).toFixed(1), runs: logRuns.map((v) => +v.toFixed(1)) };

  // ---------- 2e. 20 文件并发导入 ----------
  const importer = new FileImporter({ mdDir, zipDir, chunkSize: 500, chunkOverlap: 50, chunkMode: 'fixed', webTimeout: 10000 });
  const srcFiles: string[] = [];
  for (let i = 0; i < 20; i++) {
    const p = path.join(tmpDir, \`import-\${i}.md\`);
    await fsp.writeFile(p, \`# 并发导入文档 \${i}\n\n这是第 \${i} 个并发导入的小文件，包含向量检索与缓存关键词。\n\`, 'utf-8');
    srcFiles.push(p);
  }
  const tImp0 = performance.now();
  const impResults = await Promise.all(srcFiles.map((p) => importer.importLocalFile(p)));
  const impMs = performance.now() - tImp0;
  result.importConcurrency = {
    files: 20,
    totalMs: +impMs.toFixed(1),
    filesPerSec: +(20 / (impMs / 1000)).toFixed(2),
    ok: impResults.filter((r) => r.fileId > 0 && !r.skipped).length,
    skipped: impResults.filter((r) => r.skipped).length,
  };

  closeDatabase();
  await fsp.rm(tmpDir, { recursive: true, force: true });
  console.log('===BENCH_JSON_START===');
  console.log(JSON.stringify(result, null, 2));
  console.log('===BENCH_JSON_END===');
}

main().catch((e) => { console.error('BENCHMARK_FAILED', e); process.exit(1); });
`;

(async () => {
  await build({
    stdin: {
      contents: BENCHMARK_ENTRY_SRC,
      resolveDir: repoRoot,
      sourcefile: 'benchmark.entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external', // 所有 node_modules 运行时 require（输出文件位于仓库根，可解析到 node_modules）
    outfile: bundlePath,
    sourcemap: false,
    logLevel: 'warning',
  });
  try {
    require(bundlePath);
  } finally {
    fs.rmSync(bundlePath, { force: true });
  }
})().catch((e) => {
  console.error('benchmark runner failed:', e);
  process.exit(1);
});
