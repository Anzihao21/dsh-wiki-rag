/**
 * dsh-wiki-rag 宿主插件（DSH bundle 形态）
 *
 * 把 Wiki 知识库的纯业务逻辑（导入/重命名/zip归档/监听/diff/RAG/快照/设置）
 * 封装为 Cordis 插件，通过 ctx.tools.register(defineTool(...)) 注册为 Agent 可调工具。
 *
 * 架构：复用 src/main 下的纯 TypeScript 业务模块；本文件仅做壳层：
 * 初始化 DB、加载设置、把操作注册成 defineTool。资源清理交给 ctx.effect。
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';

import { initDatabase, getDbPath } from '../../../src/main/db/sqlite-init';
import { FileImporter } from '../../../src/main/file/file-importer';
import { FileWatcher } from '../../../src/main/file/file-watcher';
import { ragSearch } from '../../../src/main/rag/rag-search';
import { writeLog } from '../../../src/main/db/log-db';
import {
  listKnowledgeFiles,
  getKnowledgeFileById,
  deleteKnowledgeFile,
  countByType
} from '../../../src/main/db/knowledge-db';
import { triggerSourceSync, applySourceUpdate } from '../../../src/main/file/source-sync';
import { createSnapshot, restoreSnapshot, listSnapshots } from '../../../src/main/snapshot/snapshot-backup';
import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/main/types';

export const name = 'wiki-rag-host';
export const inject = ['tools'];

export const Config = z.object({
  mdStoragePath: z.string().default('.dsh-wiki-rag/md'),
  zipStoragePath: z.string().default('.dsh-wiki-rag/zip'),
  snapshotStoragePath: z.string().default('.dsh-wiki-rag/snapshots'),
  chunkSize: z.number().default(800),
  chunkOverlap: z.number().default(120),
  webMode: z.union(['intranet', 'extranet', 'external']).default('extranet'),
  webTimeout: z.number().default(30000),
  autoSnapshot: z.boolean().default(false),
});

export function apply(ctx: Context, config: z.infer<typeof Config>) {
  const dataDir = path.join(process.cwd(), '.dsh-wiki-rag');
  const snapshotStoragePath = path.resolve(config.snapshotStoragePath);
  const settings: PluginSettings = {
    ...DEFAULT_SETTINGS,
    mdStoragePath: path.resolve(config.mdStoragePath),
    zipStoragePath: path.resolve(config.zipStoragePath),
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    webMode: config.webMode,
    webTimeout: config.webTimeout,
    autoSnapshot: config.autoSnapshot,
  };

  const importer = new FileImporter({
    mdDir: settings.mdStoragePath,
    zipDir: settings.zipStoragePath,
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    webTimeout: settings.webTimeout,
  });

  const watcher = new FileWatcher();

  // 初始化 DB（业务依赖本地 sqlite；ctx.fs 面向沙箱文本文件，此处保留业务自身 DB 语义）
  ctx.effect(async () => {
    await initDatabase(path.join(dataDir, 'dsh-wiki-rag.db'));
    await writeLog('plugin-activate', `wiki-rag-host DB=${getDbPath()}`);
  }, 'wiki-rag db init');

  // ---------- Agent 工具：检索 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_rag_search',
    description: '检索 Wiki 知识库内文档资料，返回相关原文片段 + 文档名/来源路径。',
    parameters: {
      query: { type: 'string', required: true, description: '检索关键词' },
      topK: { type: 'number', description: '返回条数，默认 5' },
    },
    output: {
      schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      return ragSearch(args.query, args.topK ?? 5);
    },
  }));

  // ---------- 工具：文件列表 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_list_files',
    description: '列出 Wiki 知识库中的全部文档条目（文件名、类型、来源路径、MD 路径、同步时间）。',
    parameters: {},
    output: {
      schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute() {
      return listKnowledgeFiles();
    },
  }));

  // ---------- 工具：导入 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_import_file',
    description: '导入本地文件/文件夹/网页URL/笔记到 Wiki 知识库，生成 MD 并打包 Zip 归档。',
    parameters: {
      source: { type: 'string', required: true, description: '来源：本地路径、URL 或笔记标题' },
      kind: { type: 'string', description: '来源类型：file/folder/url/note' },
      noteText: { type: 'string', description: 'kind=note 时的笔记正文' },
      intranet: { type: 'boolean', description: 'kind=url 时是否内网模式' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {} },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const kind = args.kind ?? detectKind(args.source);
      switch (kind) {
        case 'folder':
          return { summary: importer.summarize(await importer.importFolder(args.source)) };
        case 'url':
          return importer.importUrl(args.source, !!args.intranet);
        case 'note':
          return importer.importNote(args.source, args.noteText ?? '');
        default:
          return importer.importLocalFile(args.source);
      }
    },
  }));

  // ---------- 工具：源目录同步 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_sync_source',
    description: '从源目录更新指定文档：哈希比对生成 diff，接受后更新 MD 并刷新向量库。',
    parameters: {
      fileId: { type: 'number', required: true, description: '知识库条目 ID' },
      accept: { type: 'boolean', description: '是否接受更新（需先查询确认 diff）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const file = await getKnowledgeFileById(args.fileId);
      if (!file) return { status: 'error', reason: '条目不存在' };
      const outcome = await triggerSourceSync(args.fileId, file.zip_archive_path, file.md_path);
      if (args.accept && outcome.status === 'needs-confirm' && outcome.diff) {
        await applySourceUpdate(args.fileId, outcome.diff.newText, file.md_path, (id, t) =>
          importer.reindex(id, t)
        );
        return { status: 'accepted', fileId: args.fileId };
      }
      return outcome;
    },
  }));

  // ---------- 工具：删除 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_delete_file',
    description: '删除指定知识库条目（含 DB 记录；归档文件由上层处理）。',
    parameters: {
      fileId: { type: 'number', required: true, description: '知识库条目 ID' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const file = await getKnowledgeFileById(args.fileId);
      if (!file) return { status: 'error', reason: '条目不存在' };
      try { await fs.unlink(file.md_path); } catch { /* ignore */ }
      try { if (file.zip_archive_path) await fs.unlink(file.zip_archive_path); } catch { /* ignore */ }
      await deleteKnowledgeFile(args.fileId);
      await writeLog('delete', `删除 fileId=${args.fileId}`);
      return { status: 'deleted', fileId: args.fileId };
    },
  }));

  // ---------- 工具：快照 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_snapshot',
    description: '对 Wiki 知识库做快照：打包全部 MD + Zip 归档为 zip。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute() {
      const out = await createSnapshot(settings.mdStoragePath, settings.zipStoragePath, snapshotStoragePath);
      return { status: 'created', path: out };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wiki_list_snapshots',
    description: '列出全部快照备份文件路径。',
    parameters: {},
    output: {
      schema: { type: 'array', items: { type: 'string' } },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute() {
      return listSnapshots(snapshotStoragePath);
    },
  }));

  // ---------- 工具：统计与设置 ----------
  ctx.tools.register(defineTool({
    name: 'wiki_stats',
    description: '获取知识库统计：各文件类型数量、设置信息。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute() {
      return { byType: await countByType(), settings };
    },
  }));

  // ---------- 资源清理 ----------
  ctx.effect(() => {
    let closed = false;
    const cleanup = () => {
      if (!closed) {
        closed = true;
        void watcher.stop();
      }
    };
    process.on('exit', cleanup);
    return cleanup;
  }, 'wiki-rag watcher dispose');
}

function detectKind(source: string): string {
  if (/^https?:\/\//i.test(source)) return 'url';
  return 'file';
}
