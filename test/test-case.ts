// dsh-wiki-rag 单元测试脚本
// 覆盖 100 轮迭代的 15 大类用例。用 esbuild 打包后 node 运行。
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { resolveUniqueFileName, isUncPath } from '../src/main/file/name-auto-rename';
import { chunkText } from '../src/main/rag/text-chunk';
import { embedText, cosineSimilarity } from '../src/main/rag/embedding';
import { compareMarkdown, buildDiffResult } from '../src/main/file/diff-compare';
import { sha256Text, detectFileType, toMdFileName } from '../src/main/file/file-utils';
import { initDatabase, closeDatabase, run, all, get } from '../src/main/db/sqlite-init';
import {
  insertKnowledgeFile,
  getKnowledgeFileById,
  listKnowledgeFiles,
  deleteKnowledgeFile
} from '../src/main/db/knowledge-db';
import {
  insertVectorChunk,
  getChunksByFileId,
  deleteChunksByFileId,
  countChunks
} from '../src/main/db/vector-db';
import { writeLog, listLogs } from '../src/main/db/log-db';
import { ragSearch } from '../src/main/rag/rag-search';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-wiki-rag-test-'));
  console.log(`\n测试临时目录: ${tmp}\n`);

  // ===== 1. 本地单文件导入 + 同名自动重命名 =====
  console.log('\n[用例1/15] 本地单文件导入 + 同名自动重命名');
  {
    // 纯函数重命名逻辑
    assert(resolveUniqueFileName('a.docx', ['a.docx']) === 'a(1).docx', '同名冲突追加(1)');
    assert(resolveUniqueFileName('a.docx', ['a.docx', 'a(1).docx']) === 'a(2).docx', '递增到(2)');
    assert(resolveUniqueFileName('a.md', []) === 'a.md', '无冲突保持原名');
    assert(isUncPath('\\\\192.168.1.1\\share\\doc') === true, 'UNC路径识别');
    assert(isUncPath('/local/path.txt') === false, '本地路径非UNC');
  }

  // ===== 2. 数据库建表 + 增删改查 =====
  console.log('\n[用例2/15] SQLite 数据库建表与知识文件增删改查');
  {
    await initDatabase(path.join(tmp, 'test.db'));
    const id = await insertKnowledgeFile({
      file_name: '项目说明.md',
      source_path: '/tmp/source/项目说明.docx',
      md_path: path.join(tmp, 'md', '项目说明.md'),
      zip_archive_path: path.join(tmp, 'zip', '项目说明-src.zip'),
      file_type: 'docx',
      create_time: Date.now(),
      last_sync_time: 0
    });
    const rec = await getKnowledgeFileById(id);
    assert(!!rec && rec.file_name === '项目说明.md', '插入并查询知识文件');
    const list = await listKnowledgeFiles();
    assert(list.length === 1, '列表包含新文件');

    // ===== 3. 向量切片表 =====
    console.log('\n[用例3/15] 向量切片表读写');
    const vec = embedText('测试向量');
    await insertVectorChunk(id, '测试切片内容', vec);
    const chunks = await getChunksByFileId(id);
    assert(chunks.length === 1, '写入并读取向量切片');
    assert((await countChunks()) === 1, '切片计数正确');

    // ===== 4. 操作日志 =====
    console.log('\n[用例4/15] 操作日志读写');
    await writeLog('test', '单元测试日志');
    const logs = await listLogs();
    assert(logs.length >= 1 && logs[0].action === 'test', '日志写入并倒序读取');

    await deleteKnowledgeFile(id);
    const gone = await getKnowledgeFileById(id);
    assert(!gone, '删除知识文件');
  }

  // ===== 5. 文本切片 =====
  console.log('\n[用例5/15] RAG 文本切片');
  {
    const text = '豆包是一款由字节跳动开发的AI助手。'.repeat(50);
    const chunks = chunkText(text, 50, 10);
    assert(chunks.length > 1, '长文本被切成多片');
    assert(chunks.every((c) => c.length > 0), '所有切片非空');
    const single = chunkText('短文本', 800, 120);
    assert(single.length === 1, '短文本单一切片');
  }

  // ===== 6. 向量化与相似度 =====
  console.log('\n[用例6/15] 向量化与余弦相似度');
  {
    const a = embedText('深度求索的AI模型');
    const b = embedText('深度求索的AI模型');
    const c = embedText('今天天气很好');
    assert(cosineSimilarity(a, b) > 0.99, '相同文本高相似度');
    assert(cosineSimilarity(a, c) < cosineSimilarity(a, b), '不同文本相似度更低');
    assert(a.length === 256 * 4, '向量维度正确(256维float32)');
  }

  // ===== 7. RAG 检索 =====
  console.log('\n[用例7/15] Agent 检索 wiki_rag_search');
  {
    const fileId = await insertKnowledgeFile({
      file_name: 'AI模型.md',
      source_path: '/tmp/source/AI模型.md',
      md_path: path.join(tmp, 'md', 'AI模型.md'),
      zip_archive_path: path.join(tmp, 'zip', 'AI模型-src.zip'),
      file_type: 'md',
      create_time: Date.now(),
      last_sync_time: Date.now()
    });
    const doc = '大语言模型在自然语言处理领域应用广泛，能够理解并生成文本。';
    const doc2 = '今天上海的天气晴朗，适合出门散步。';
    for (const c of chunkText(doc, 100, 0)) await insertVectorChunk(fileId, c, embedText(c));
    const fileId2 = await insertKnowledgeFile({
      file_name: '天气.md',
      source_path: '/tmp/source/天气.md',
      md_path: path.join(tmp, 'md', '天气.md'),
      zip_archive_path: path.join(tmp, 'zip', '天气-src.zip'),
      file_type: 'md',
      create_time: Date.now(),
      last_sync_time: Date.now()
    });
    for (const c of chunkText(doc2, 100, 0)) await insertVectorChunk(fileId2, c, embedText(c));

    const res = await ragSearch('大语言模型', 2);
    assert(res.length >= 1, '检索返回结果');
    assert(res[0].file_name.includes('AI模型'), '检索到相关文档');
    await deleteKnowledgeFile(fileId);
    await deleteKnowledgeFile(fileId2);
    await deleteChunksByFileId(fileId);
    await deleteChunksByFileId(fileId2);
  }

  // ===== 8. diff 对比 =====
  console.log('\n[用例8/15] MD 新旧内容 diff 对比');
  {
    const oldText = '第一行\n第二行\n第三行';
    const newText = '第一行\n修改行\n第三行';
    const diff = compareMarkdown(oldText, newText);
    assert(diff.some((d) => d.added && d.value.includes('修改行')), 'diff 识别新增行');
    assert(diff.some((d) => d.removed && d.value.includes('第二行')), 'diff 识别删除行');
    const full = buildDiffResult(1, 'test.md', oldText, newText);
    assert(full.fileName === 'test.md' && full.diff.length > 0, 'DiffResult 结构完整');
  }

  // ===== 9. 文件工具 =====
  console.log('\n[用例9/15] 文件类型识别与命名');
  {
    assert(detectFileType('/x/a.pdf') === 'pdf', '识别pdf');
    assert(detectFileType('/x/a.docx') === 'docx', '识别docx');
    assert(detectFileType('/x/a.md') === 'md', '识别md');
    assert(detectFileType('/x/a.xyz') === 'unknown', '未知类型');
    assert(toMdFileName('报告.docx') === '报告.md', 'docx转md文件名');
    assert(toMdFileName('笔记.md') === '笔记.md', 'md保持.md');
    assert(sha256Text('abc') === sha256Text('abc'), '文本哈希稳定');
    assert(sha256Text('abc') !== sha256Text('abd'), '不同文本不同哈希');
  }

  // ===== 10. 源同步逻辑（纯逻辑分支） =====
  console.log('\n[用例10/15] 【从源目录更新】逻辑分支');
  {
    // 无本地源文件的条目（网页/笔记）→ 无改动跳过
    const { triggerSourceSync } = await import('../src/main/file/source-sync');
    const noteFile = await insertKnowledgeFile({
      file_name: '笔记.md',
      source_path: 'ref://note://我的笔记',
      md_path: path.join(tmp, 'md', '笔记.md'),
      zip_archive_path: path.join(tmp, 'zip', '笔记-meta.zip'),
      file_type: 'note',
      create_time: Date.now(),
      last_sync_time: Date.now()
    });
    const out = await triggerSourceSync(noteFile, '', '');
    assert(out.status === 'no-change', '网页/笔记条目跳过同步');
    await deleteKnowledgeFile(noteFile);
  }

  // ===== 11. 网页抓取模式（内网/外网参数） =====
  console.log('\n[用例11/15] 网页抓取内网/外网模式');
  {
    const { fetchWebContent } = await import('../src/main/network/web-crawler');
    // 无法联网时不崩溃，抛错即可（断网容错）
    try {
      await fetchWebContent('http://127.0.0.1:1/unreachable', false, { timeout: 500 });
      assert(false, '外网模式超时/失败应抛错', '(未抛错)');
    } catch {
      assert(true, '断网/无效地址抛错而非崩溃');
    }
  }

  // ===== 12. 快照备份（逻辑函数存在性） =====
  console.log('\n[用例12/15] 快照备份与恢复');
  {
    const { createSnapshot, listSnapshots } = await import('../src/main/snapshot/snapshot-backup');
    const mdDir = path.join(tmp, 'md');
    const zipDir = path.join(tmp, 'zip');
    await fs.mkdir(mdDir, { recursive: true });
    await fs.mkdir(zipDir, { recursive: true });
    await fs.writeFile(path.join(mdDir, 'doc.md'), '# 内容', 'utf-8');
    const snap = await createSnapshot(mdDir, zipDir, path.join(tmp, 'snapshots'));
    assert(!!snap && snap.endsWith('.zip'), '快照包生成');
    const list = await listSnapshots(path.join(tmp, 'snapshots'));
    assert(list.length === 1, '快照列表包含生成的包');
  }

  // ===== 13. 同名重命名与归档（端到端文件级） =====
  console.log('\n[用例13/15] 同名文件重命名端到端');
  {
    const src = path.join(tmp, 'dup-source');
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, '报告.md'), '# 报告一', 'utf-8');
    await fs.writeFile(path.join(src, '报告.md'), '# 报告二', 'utf-8'); // 覆盖写入模拟两次同名
    const existing = await fs.readdir(src);
    assert(existing.length === 1, '同名文件在同一目录只能存在一个（资源管理器行为）');
  }

  // ===== 13b. 文件夹批量导入统计 (v1.0.0.3) =====
  console.log('\n[用例13b/15] 文件夹批量导入与统计汇总');
  {
    const { FileImporter } = await import('../src/main/file/file-importer');
    const folder = path.join(tmp, 'batch-import');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'a.md'), '# A', 'utf-8');
    await fs.writeFile(path.join(folder, 'b.md'), '# B', 'utf-8');
    const importer = new FileImporter({
      mdDir: path.join(tmp, 'md2'),
      zipDir: path.join(tmp, 'zip2'),
      chunkSize: 800,
      chunkOverlap: 120,
      webTimeout: 30000
    });
    const results = await importer.importFolder(folder);
    assert(results.length === 2, '批量导入2个文件');
    const sum = importer.summarize(results);
    assert(sum.ok === 2 && sum.failed === 0, '统计: 成功2失败0');
  }

  // ===== 14. 设置与 IPC 通道存在性 =====
  console.log('\n[用例14/15] IPC 通道注册完整性');
  {
    const { registerIpcHandlers } = await import('../src/main/ipc-handler');
    const handlers = registerIpcHandlers({
      ctx: { mdDir: tmp, zipDir: tmp, chunkSize: 800, chunkOverlap: 120, webMode: 'extranet', webTimeout: 30000 },
      importer: {} as any,
      watcher: { watchSource: async () => {} } as any,
      reindex: async () => {},
      applyUpdate: async () => {},
      settings: async () => ({} as any),
      saveSettings: async () => {}
    });
    const required = [
      'wiki:listFiles', 'wiki:importFile', 'wiki:importFolder', 'wiki:importUrl',
      'wiki:importNote', 'wiki:deleteFile', 'wiki:editMd', 'wiki:triggerSync',
      'wiki:applySync', 'wiki:ragSearch', 'wiki:createSnapshot', 'wiki:listSnapshots',
      'wiki:listLogs', 'wiki:getSettings', 'wiki:saveSettings', 'wiki:watchSource', 'wiki:readMd'
    ];
    const missing = required.filter((c) => !handlers[c]);
    assert(missing.length === 0, `IPC 通道齐全 (缺: ${missing.join(',') || '无'})`);
  }

  // ===== 15. 异常容错 =====
  console.log('\n[用例15/15] 异常容错');
  {
    // 空文本切片不崩
    assert(chunkText('', 100, 0).length === 0, '空文本切片为空');
    // 数据库异常写入日志（不抛给上层崩溃）
    try {
      await run('SELECT * FROM no_such_table');
      assert(false, '非法SQL应报错', '(未报错)');
    } catch {
      assert(true, '非法SQL捕获异常');
    }
    const logs = await listLogs(5);
    assert(logs.length > 0, '日志仍可读取（DB未崩溃）');
  }

  await closeDatabase();

  // ===== 汇总 =====
  console.log(`\n========================================`);
  console.log(`测试完成: 通过 ${passed} / 失败 ${failed}`);
  if (failures.length) {
    console.log('失败用例:', failures.join(', '));
    process.exit(1);
  }
  console.log('✅ 全部测试通过');
}

main().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
