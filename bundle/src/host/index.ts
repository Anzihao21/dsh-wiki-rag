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
import { promises as fs, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';

import { initDatabase, getDbPath, closeDatabase, walCheckpoint } from '../../../src/main/db/sqlite-init';
import { FileImporter } from '../../../src/main/file/file-importer';
import { detectEditConflict } from '../../../src/main/file/edit-conflict';
import { FileWatcher } from '../../../src/main/file/file-watcher';
import { ragSearch, normalizeSearchInput } from '../../../src/main/rag/rag-search';
import { initEmbedding } from '../../../src/main/rag/embedding';
import { initRerank } from '../../../src/main/rag/rerank';
import { writeLog, listLogs } from '../../../src/main/db/log-db';
import {
  listKnowledgeFiles,
  getKnowledgeFileById,
  insertKnowledgeFile,
  deleteKnowledgeFile,
  updateMdPath,
  updateZipPath,
  countByType,
  listFolders,
  getFolderById,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  moveFileToFolder,
  updateSourcePath,
  listKnowledgeFilesByFolder
} from '../../../src/main/db/knowledge-db';
import { triggerSourceSync, applySourceUpdate } from '../../../src/main/file/source-sync';
import { resolveUniqueFileName, isUncPath } from '../../../src/main/file/name-auto-rename';
import { extractTextToMarkdown, sha256Text } from '../../../src/main/file/file-utils';
import { buildDiffResult } from '../../../src/main/file/diff-compare';
import { archiveSourceFile } from '../../../src/main/file/zip-archive';
import { createSnapshot, restoreSnapshot, listSnapshots, previewRestore } from '../../../src/main/snapshot/snapshot-backup';
import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/main/types';
import { createLogger } from '../../../src/main/utils/logger';
import { sendHttpError } from '../../../src/main/utils/errors';

const logger = createLogger('dsh-wiki-rag');

export const name = 'dsh-wiki-rag';
export const inject = ['tools'];

export const Config = z.object({
  mdStoragePath: z.string().default('.dsh-wiki-rag/md'),
  zipStoragePath: z.string().default('.dsh-wiki-rag/zip'),
  snapshotStoragePath: z.string().default('.dsh-wiki-rag/snapshots'),
  chunkSize: z.number().default(800),
  chunkOverlap: z.number().default(120),
  chunkMode: z.union(['fixed', 'heading']).default('fixed'),
  webMode: z.union(['intranet', 'extranet', 'external']).default('extranet'),
  webTimeout: z.number().default(15000),
  autoSnapshot: z.boolean().default(false),
  snapshotKeep: z.number().default(3),
  // ---- Embedding ----
  embeddingProvider: z.union(['local', 'openai', 'fallback']).default('fallback'),
  embeddingModelPath: z.string().default(''),
  embeddingOpenAIBaseURL: z.string().default('https://api.openai.com/v1'),
  embeddingOpenAIAPIKey: z.string().default(''),
  embeddingOpenAIModel: z.string().default('text-embedding-3-small'),
  // ---- Rerank ----
  rerankProvider: z.union(['local', 'openai', 'none']).default('none'),
  rerankModelPath: z.string().default(''),
  rerankOpenAIBaseURL: z.string().default('https://api.openai.com/v1'),
  rerankOpenAIAPIKey: z.string().default(''),
  rerankOpenAIModel: z.string().default('rerank-multilingual-v3'),
  rerankTopK: z.number().default(5),
});

export function apply(ctx: Context, config: z.infer<typeof Config>) {
  const dataDir = path.join(process.cwd(), '.dsh-wiki-rag');
  let snapshotStoragePath = path.resolve(config.snapshotStoragePath);
  const settings: PluginSettings = {
    ...DEFAULT_SETTINGS,
    mdStoragePath: path.resolve(config.mdStoragePath),
    zipStoragePath: path.resolve(config.zipStoragePath),
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    chunkMode: config.chunkMode,
    webMode: config.webMode,
    webTimeout: config.webTimeout,
    autoSnapshot: config.autoSnapshot,
    snapshotKeep: config.snapshotKeep,
    embeddingProvider: config.embeddingProvider,
    embeddingModelPath: config.embeddingModelPath,
    embeddingOpenAIBaseURL: config.embeddingOpenAIBaseURL,
    embeddingOpenAIAPIKey: config.embeddingOpenAIAPIKey,
    embeddingOpenAIModel: config.embeddingOpenAIModel,
    rerankProvider: config.rerankProvider,
    rerankModelPath: config.rerankModelPath,
    rerankOpenAIBaseURL: config.rerankOpenAIBaseURL,
    rerankOpenAIAPIKey: config.rerankOpenAIAPIKey,
    rerankOpenAIModel: config.rerankOpenAIModel,
    rerankTopK: config.rerankTopK,
  };

  // 初始化 embedding + rerank 模型
  ctx.effect(async () => {
    await initEmbedding(settings);
    await initRerank(settings);
  }, 'wiki: init embedding & rerank');

  let importer = new FileImporter({
    mdDir: settings.mdStoragePath,
    zipDir: settings.zipStoragePath,
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    chunkMode: settings.chunkMode,
    webTimeout: settings.webTimeout,
  });

  const watcher = new FileWatcher();

  // 待确认变更队列（文件监听触发 → 客户端弹窗三态：接受/拒绝/暂存）
  // 监听触发时即预计算 oldText/newText/diff，前端轮询到即可直接渲染 Diff，无需二次请求
  const pendingChanges: Array<{
    fileId: number;
    fileName: string;
    sourcePath: string;
    time: number;
    shelved: boolean;
    oldText: string;
    newText: string;
    diff: Array<{ added: boolean; removed: boolean; value: string }>;
  }> = [];

  // ---- 批量任务进度（内存态）----
  interface Job {
    jobId: string;
    phase: string;
    done: number;
    total: number;
    message: string;
    status: 'running' | 'done' | 'error';
    result?: any;
    error?: string;
    startedAt: number;
  }
  const jobs = new Map<string, Job>();
  /** 内存 job 保留上限：超出后删除最旧的已结束 job，防止长运行内存泄漏 */
  const JOBS_KEEP = 50;
  function pruneJobs(): void {
    if (jobs.size <= JOBS_KEEP) return;
    // 只清理已结束（done / error）的 job，running 的不能删
    const finished = [...jobs.values()]
      .filter((j) => j.status !== 'running')
      .sort((a, b) => a.startedAt - b.startedAt);
    let toDelete = jobs.size - JOBS_KEEP;
    for (const j of finished) {
      if (toDelete <= 0) break;
      jobs.delete(j.jobId);
      toDelete--;
    }
  }

  // ---- 并发去重：同一路径/同一文件的进行中操作 ----
  const inProgress = new Set<string>();
  function acquire(key: string): boolean {
    if (inProgress.has(key)) return false;
    inProgress.add(key);
    return true;
  }
  function release(key: string): void {
    inProgress.delete(key);
  }

  // 初始化 DB（业务依赖本地 sqlite；ctx.fs 面向沙箱文本文件，此处保留业务自身 DB 语义）
  ctx.effect(async () => {
    await initDatabase(path.join(dataDir, 'dsh-wiki-rag.db'));
    logger.info('plugin activated', { dbPath: getDbPath() });
    await writeLog('plugin-activate', `dsh-wiki-rag DB=${getDbPath()}`);

    // 接入文件监听：源文件变更入待确认队列；入队前预计算新旧文本与 diff，前端轮询即可直接渲染
    watcher.setCallback(async (change) => {
      let oldText = '';
      try {
        const rec = await getKnowledgeFileById(change.fileId);
        if (rec) {
          try { oldText = await fs.readFile(rec.md_path, 'utf-8'); } catch { oldText = ''; }
        }
      } catch { /* 条目读取失败时旧文本为空 */ }
      let newText = '';
      try { newText = await extractTextToMarkdown(change.sourcePath); } catch { newText = ''; }
      // 新旧内容一致视为无改动，不入队（与 triggerSourceSync 判据一致）
      if (oldText && sha256Text(oldText) === sha256Text(newText)) return;
      const diff = buildDiffResult(change.fileId, change.fileName, oldText, newText).diff;
      pendingChanges.push({
        ...change,
        oldText,
        newText,
        diff,
        shelved: false,
        time: Date.now(),
      });
    });
    // 启动时对所有已有本地源文件条目挂监听
    const existing = await listKnowledgeFiles();
    for (const f of existing) {
      if (f.source_path.startsWith('/') || isUncSource(f.source_path)) {
        try { watcher.watchSource(f.id); } catch { /* 网络/UNC 路径不可达时忽略 */ }
      }
    }
  }, 'wiki-rag db init');

  // 快照列表：把快照目录文件映射为前端期望的 {id, created_at, note} 结构
  async function readSnapshotList(): Promise<Array<{ id: number; file: string; created_at: string; note: string }>> {
    let names: string[] = [];
    try { names = (await fs.readdir(snapshotStoragePath)).filter((n) => n.endsWith('.zip')).sort().reverse(); }
    catch { names = []; }
    return names.map((name, idx) => {
      const m = name.match(/snapshot-(.+)\.zip$/);
      const stamp = m ? m[1] : '';
      return {
        id: idx + 1,
        file: name,
        created_at: stamp ? stamp.replace(/-/g, ':').replace(/T/, 'T') : '',
        note: name,
      };
    });
  }

  // 自动快照后保留最近 3 份，删除更旧的
  async function pruneSnapshots(keep = 3): Promise<void> {
    const list = await readSnapshotList();
    for (const s of list.slice(keep)) {
      try { await fs.unlink(path.join(snapshotStoragePath, s.file)); } catch { /* ignore */ }
    }
  }

  // 外网抓取总开关：intranet 模式禁止访问公网 URL
  async function guardUrlImport(url: string): Promise<void> {
    if (settings.webMode === 'intranet' && isPublicUrl(url)) {
      throw new Error('当前为内网模式，已禁止访问外网网页');
    }
  }

  // 导入分发：根据 kind 路由到 FileImporter 对应方法
  async function dispatchImport(body: {
    source?: string; kind?: string; noteText?: string; intranet?: boolean; folderId?: number | null;
  }) {
    const source = (body.source || '').trim();
    if (!source) throw new Error('缺少导入来源 source');
    let kind = body.kind || '';
    if (!kind) {
      if (/^https?:\/\//i.test(source)) kind = 'url';
      else kind = 'file';
    }
    switch (kind) {
      case 'folder':
        return { summary: importer.summarize(await importer.importFolder(source, body.folderId ?? null)) };
      case 'url':
        await guardUrlImport(source);
        return importer.importUrl(source, !!body.intranet);
      case 'note':
        return importer.importNote(source, body.noteText ?? '');
      case 'file':
      default: {
        // 智能识别：路径是目录则按文件夹批量导入
        try {
          const st = await fs.stat(source);
          if (st.isDirectory()) {
            return { summary: importer.summarize(await importer.importFolder(source, body.folderId ?? null)) };
          }
        } catch { /* 路径不存在则交给 importLocalFile 报错 */ }
        return importer.importLocalFile(source, body.folderId ?? null);
      }
    }
  }

  // 递归扫描可解析文档（与 FileImporter 内部一致，用于批量导入进度统计）
  async function walkParseableFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (d: string): Promise<void> => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.(pdf|docx|md|txt)$/i.test(e.name)) out.push(full);
      }
    };
    await walk(dir);
    return out;
  }

  // 异步导入：带进度回调，实时写 job.done/total/message
  async function runImportJob(body: {
    source?: string; kind?: string; noteText?: string; intranet?: boolean; folderId?: number | null;
  }, job: Job): Promise<any> {
    const source = (body.source || '').trim();
    if (!source) throw new Error('缺少导入来源 source');
    let kind = body.kind || '';
    if (!kind) {
      kind = /^https?:\/\//i.test(source) ? 'url' : 'file';
    }

    // 文件夹批量：逐文件更新进度
    const importFolderProgressive = async (folderPath: string, folderId: number | null = null) => {
      const files = await walkParseableFiles(folderPath);
      job.total = files.length;
      job.done = 0;
      const results: any[] = [];
      for (const f of files) {
        job.message = `(${job.done + 1}/${files.length}) ${path.basename(f)}`;
        try {
          results.push(await importer.importLocalFile(f, folderId));
        } catch (e) {
          results.push({
            fileId: 0, fileName: path.basename(f), mdPath: '', skipped: true,
            reason: (e as Error).message
          });
        }
        job.done++;
      }
      return { summary: importer.summarize(results) };
    };

    if (kind === 'folder') {
      return importFolderProgressive(source, body.folderId ?? null);
    }
    if (kind === 'url') {
      await guardUrlImport(source);
      job.total = 1; job.done = 0; job.message = `抓取网页 ${source}`;
      const r = await importer.importUrl(source, !!body.intranet);
      job.done = 1;
      return r;
    }
    if (kind === 'note') {
      job.total = 1; job.done = 0; job.message = `新建笔记 ${source}`;
      const r = await importer.importNote(source, body.noteText ?? '');
      job.done = 1;
      return r;
    }
    // file / 默认
    try {
      const st = await fs.stat(source);
      if (st.isDirectory()) return importFolderProgressive(source, body.folderId ?? null);
    } catch { /* 交给 importLocalFile 报错 */ }
    job.total = 1; job.done = 0; job.message = `导入 ${source}`;
    const r = await importer.importLocalFile(source, body.folderId ?? null);
    job.done = 1;
    return r;
  }

  // 组装递归树形 TreeNode
  async function buildTree(): Promise<any[]> {
    const folders = await listFolders();
    const files = await listKnowledgeFiles();
    const byParent = new Map<any, any[]>();
    const push = (key: any, node: any) => {
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(node);
    };
    for (const f of folders) {
      push(f.parent_id ?? null, { type: 'folder', id: f.id, name: f.name, children: [] });
    }
    for (const file of files) {
      push(file.folder_id ?? null, {
        type: 'doc',
        fileId: file.id,
        title: file.file_name,
        kind: file.file_type,
        status: 'ready',
        folderId: file.folder_id ?? null,
      });
    }
    const nest = (parentId: any): any[] => {
      const nodes = byParent.get(parentId) || [];
      const folderNodes = nodes.filter((n) => n.type === 'folder');
      const docNodes = nodes.filter((n) => n.type === 'doc');
      for (const fn of folderNodes) fn.children = nest(fn.id);
      return [...folderNodes, ...docNodes];
    };
    return nest(null);
  }

  // 序列化给前端的 Settings（严格按契约字段）
  function publicSettings() {
    return {
      mdStoragePath: settings.mdStoragePath,
      zipStoragePath: settings.zipStoragePath,
      snapshotStoragePath,
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
      chunkMode: settings.chunkMode,
      webMode: settings.webMode,
      webTimeout: settings.webTimeout,
      autoSnapshot: settings.autoSnapshot,
      snapshotKeep: settings.snapshotKeep,
      embeddingProvider: settings.embeddingProvider,
      rerankProvider: settings.rerankProvider,
      rerankTopK: settings.rerankTopK,
    };
  }

  // 应用设置修改：移动已有文件到新目录并更新 DB，重建 importer
  // 迁移过程中任意一步失败 → 反向回滚已移动的文件 + 还原 DB 路径，保持旧目录可用
  async function applySettingsPatch(patch: Record<string, any>): Promise<void> {
    // 1. 先解析目标值（不立即改 settings），便于失败时回滚
    const oldMd = settings.mdStoragePath;
    const oldZip = settings.zipStoragePath;
    const oldSnap = snapshotStoragePath;

    let nextMd = oldMd;
    let nextZip = oldZip;
    let nextSnap = oldSnap;
    if (typeof patch.mdStoragePath === 'string' && patch.mdStoragePath.trim()) {
      nextMd = path.resolve(patch.mdStoragePath);
    }
    if (typeof patch.zipStoragePath === 'string' && patch.zipStoragePath.trim()) {
      nextZip = path.resolve(patch.zipStoragePath);
    }
    if (typeof patch.snapshotStoragePath === 'string' && patch.snapshotStoragePath.trim()) {
      nextSnap = path.resolve(patch.snapshotStoragePath);
    }

    // 收集文件移动计划（oldPath → newPath），执行失败时反向 rename
    const moves: Array<{ from: string; to: string }> = [];
    // 收集 DB 更新计划：(id, newMdPath) / (id, newZipPath)
    const mdUpdates: Array<{ id: number; name: string; oldPath: string; newPath: string }> = [];
    const zipUpdates: Array<{ id: number; oldPath: string; newPath: string }> = [];

    if (nextMd !== oldMd) {
      for (const f of await listKnowledgeFiles()) {
        const newMd = path.join(nextMd, f.file_name);
        moves.push({ from: f.md_path, to: newMd });
        mdUpdates.push({ id: f.id, name: f.file_name, oldPath: f.md_path, newPath: newMd });
      }
    }
    if (nextZip !== oldZip) {
      for (const f of await listKnowledgeFiles()) {
        if (!f.zip_archive_path) continue;
        const newZip = path.join(nextZip, path.basename(f.zip_archive_path));
        moves.push({ from: f.zip_archive_path, to: newZip });
        zipUpdates.push({ id: f.id, oldPath: f.zip_archive_path, newPath: newZip });
      }
    }
    if (nextSnap !== oldSnap) {
      try {
        for (const n of await fs.readdir(oldSnap)) {
          moves.push({ from: path.join(oldSnap, n), to: path.join(nextSnap, n) });
        }
      } catch { /* 旧快照目录不存在，无需移动 */ }
    }

    // 2. mkdir 目标目录（失败直接抛，不影响旧目录）
    if (nextMd !== oldMd) await fs.mkdir(nextMd, { recursive: true });
    if (nextZip !== oldZip) await fs.mkdir(nextZip, { recursive: true });
    if (nextSnap !== oldSnap) await fs.mkdir(nextSnap, { recursive: true });

    // 3. 执行移动；任意一步失败 → 反向回滚已完成的 move
    const movedSoFar: Array<{ from: string; to: string }> = [];
    try {
      for (const m of moves) {
        try {
          await fs.rename(m.from, m.to);
          movedSoFar.push(m);
        } catch {
          // 源文件已不存在：视为“逻辑上已迁移”，不阻塞 DB 更新
        }
      }
      // 4. 全部移动完成后再更新 DB
      for (const u of mdUpdates) await updateMdPath(u.id, u.name, u.newPath);
      for (const u of zipUpdates) await updateZipPath(u.id, u.newPath);
    } catch (e) {
      // 回滚：把已移动的文件 rename 回原处
      for (const m of movedSoFar.reverse()) {
        try { await fs.rename(m.to, m.from); } catch { /* ignore */ }
      }
      await writeLog('settings-migrate-rollback', (e as Error).message);
      throw e;
    }

    // 5. 迁移成功，提交新设置
    settings.mdStoragePath = nextMd;
    settings.zipStoragePath = nextZip;
    snapshotStoragePath = nextSnap;

    if (typeof patch.chunkSize === 'number') settings.chunkSize = patch.chunkSize;
    if (typeof patch.chunkOverlap === 'number') settings.chunkOverlap = patch.chunkOverlap;
    if (patch.chunkMode === 'fixed' || patch.chunkMode === 'heading') settings.chunkMode = patch.chunkMode;
    if (typeof patch.snapshotKeep === 'number' && patch.snapshotKeep >= 0) settings.snapshotKeep = Math.floor(patch.snapshotKeep);
    if (typeof patch.webTimeout === 'number') settings.webTimeout = patch.webTimeout;
    if (typeof patch.autoSnapshot === 'boolean') settings.autoSnapshot = patch.autoSnapshot;
    if (typeof patch.rerankTopK === 'number') settings.rerankTopK = patch.rerankTopK;
    if (patch.webMode === 'intranet' || patch.webMode === 'extranet') settings.webMode = patch.webMode;
    if (patch.embeddingProvider === 'local' || patch.embeddingProvider === 'openai' || patch.embeddingProvider === 'fallback') {
      settings.embeddingProvider = patch.embeddingProvider;
    }
    if (patch.rerankProvider === 'local' || patch.rerankProvider === 'openai' || patch.rerankProvider === 'none') {
      settings.rerankProvider = patch.rerankProvider;
    }

    // 用新配置重建 importer
    importer = new FileImporter({
      mdDir: settings.mdStoragePath,
      zipDir: settings.zipStoragePath,
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
      chunkMode: settings.chunkMode,
      webTimeout: settings.webTimeout,
    });
  }

  // 读取 bundle/package.json 当前版本（供检查更新）
  function readCurrentVersion(): string {
    try {
      const pkg = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
      );
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  // update-check 内存缓存：5 分钟内不重复请求 npm registry
  const UPDATE_CHECK_TTL_MS = 5 * 60 * 1000;
  let updateCache: { at: number; latestVersion: string } | null = null;

  // 启动 HTTP API server（供客户端 UI 调用）
  ctx.effect(() => {
    const server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      const url = new URL(req.url || '', 'http://localhost');
      const pathname = url.pathname;
      const body = await new Promise<string>((resolve) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => resolve(data));
      });
      const json = (code: number, obj: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const seg = pathname.split('/').filter(Boolean); // ['api','wiki',...]

      try {
        // ---- 列表（补 title/kind/chunk_count 字段对齐前端渲染）----
        if (req.method === 'GET' && pathname === '/api/wiki/list') {
          const files = await listKnowledgeFiles();
          return json(200, files.map((f) => ({
            ...f,
            title: f.file_name,
            kind: f.file_type,
          })));
        }

        // ---- 导入（六大来源分发；async:true 走后台任务）----
        if (req.method === 'POST' && pathname === '/api/wiki/import') {
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          if (typeof parsed !== 'object' || parsed === null) return json(400, { error: '请求体必须是对象' });
          const source = typeof parsed.source === 'string' ? parsed.source.trim() : '';
          if (!source) return json(400, { error: '缺少导入来源 source' });
          let folderId: number | null = null;
          if (parsed.folderId !== undefined && parsed.folderId !== null) {
            if (typeof parsed.folderId !== 'number') return json(400, { error: 'folderId 必须是数字或 null' });
            folderId = parsed.folderId;
          }
          parsed.folderId = folderId;
          logger.info('import requested', { source, async: !!parsed.async, folderId });

          // 并发去重：同一路径导入进行中 → 409
          const opKey = `import:${source}`;
          if (!acquire(opKey)) return json(409, { error: 'operation-in-progress' });

          // 同步模式（保持原行为）
          if (!parsed.async) {
            try {
              const result = await dispatchImport(parsed);
              return json(200, result);
            } finally {
              release(opKey);
            }
          }

          // 异步模式：立刻返回 jobId，后台跑 FileImporter 并实时更新进度
          const jobId = randomUUID();
          const job: Job = {
            jobId, phase: 'prepare', done: 0, total: 1,
            message: '任务已创建', status: 'running', startedAt: Date.now(),
          };
          jobs.set(jobId, job);
          (async () => {
            try {
              job.result = await runImportJob(parsed, job);
              job.status = 'done';
              job.message = '导入完成';
              logger.info('async import done', { jobId, source });
              await writeLog('import-async', `job=${jobId} done`);
            } catch (e: any) {
              job.status = 'error';
              job.error = e.message;
              job.message = '导入失败';
              logger.error('async import failed', { jobId, source, error: e.message });
              await writeLog('import-async-error', `${jobId}: ${e.message}`);
            } finally {
              release(opKey);
              pruneJobs();
            }
          })();
          return json(200, { jobId });
        }

        // ---- 检索（补 title/content + 溯源字段 fileId/fileName/sourcePath/score/chunkIndex）----
        if (req.method === 'POST' && pathname === '/api/wiki/search') {
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          const norm = normalizeSearchInput(parsed?.query, parsed?.topK);
          if (!norm) {
            return json(400, { error: '缺少 query' });
          }
          const results = await ragSearch(norm.query, norm.topK);
          logger.info('search executed', { query: norm.query, topK: norm.topK, hits: results.length });
          return json(200, results.map((r) => ({
            ...r,
            title: r.file_name,
            content: r.chunk_text,
            fileId: r.file_id,
            fileName: r.file_name,
            sourcePath: r.md_path || r.source_path,
            score: r.score,
            chunkIndex: r.chunk_index ?? 0,
          })));
        }

        // ---- 日志（支持 ?action=&level=&limit= 过滤，返回结构化 level/meta） ----
        if (req.method === 'GET' && pathname === '/api/wiki/logs') {
          const action = url.searchParams.get('action') || undefined;
          const level = url.searchParams.get('level') || undefined;
          const limit = parseInt(url.searchParams.get('limit') || '200') || 200;
          const rows = await listLogs({ limit, action, level });
          return json(200, rows.map((l) => {
            let meta: unknown;
            try { meta = l.meta ? JSON.parse(l.meta) : undefined; } catch { meta = l.meta; }
            return { time: new Date(l.time).toLocaleString(), action: l.action, detail: l.detail, level: l.level, meta };
          }));
        }

        // ---- 待确认变更（文件监听 Diff 队列）----
        if (req.method === 'GET' && pathname === '/api/wiki/pending-changes') {
          return json(200, pendingChanges);
        }

        // ---- 统计 ----
        if (req.method === 'GET' && pathname === '/api/wiki/stats') {
          const byType = await countByType();
          const total = Object.values(byType).reduce((a: number, b) => a + b, 0);
          return json(200, { byType, total, ready: total, stale: 0 });
        }

        // ---- 快照：列表 / 新建 ----
        if (req.method === 'GET' && pathname === '/api/wiki/snapshots') {
          return json(200, await readSnapshotList());
        }
        if (req.method === 'POST' && pathname === '/api/wiki/snapshots') {
          const out = await createSnapshot(settings.mdStoragePath, settings.zipStoragePath, snapshotStoragePath);
          await pruneSnapshots(settings.snapshotKeep);
          logger.info('snapshot created', { path: out });
          return json(200, { status: 'created', path: out, list: await readSnapshotList() });
        }
        // 快照恢复预览：/api/wiki/snapshots/:id/preview-restore
        if (req.method === 'POST' && seg.length === 4 && seg[1] === 'snapshots' && seg[3] === 'preview-restore') {
          const list = await readSnapshotList();
          const target = list.find((s) => s.id === parseInt(seg[2] || '0'));
          if (!target) return json(404, { error: '快照不存在' });
          const zipPath = path.join(snapshotStoragePath, target.file);
          const diff = await previewRestore(zipPath, settings.mdStoragePath);
          return json(200, diff);
        }

        // 快照恢复：/api/wiki/snapshots/:id/restore
        if (req.method === 'POST' && seg.length === 4 && seg[1] === 'snapshots' && seg[3] === 'restore') {
          const list = await readSnapshotList();
          const target = list.find((s) => s.id === parseInt(seg[2] || '0'));
          if (!target) return json(404, { error: '快照不存在' });
          const zipPath = path.join(snapshotStoragePath, target.file);
          // 快照包内是 md/ 与 zip/ 子目录，解压到二者公共父目录以还原
          const restored = await restoreSnapshot(zipPath, path.dirname(settings.mdStoragePath));
          return json(200, { status: 'restored', files: restored });
        }

        // ============ 新增端点（冻结契约） ============

        // ---- 树形：GET /tree ----
        if (req.method === 'GET' && pathname === '/api/wiki/tree') {
          return json(200, await buildTree());
        }

        // ---- 新建文件夹：POST /folders ----
        if (req.method === 'POST' && pathname === '/api/wiki/folders') {
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
          if (!name) return json(400, { error: '缺少 name' });
          let parentId: number | null = null;
          if (parsed.parentId !== undefined && parsed.parentId !== null) {
            if (typeof parsed.parentId !== 'number') return json(400, { error: 'parentId 必须是数字或 null' });
            parentId = parsed.parentId;
          }
          const id = await createFolder(name, parentId);
          await writeLog('folder-create', `id=${id} name=${name} parent=${parentId}`);
          return json(200, { id, name, parentId });
        }

        // ---- 文件夹动作：POST /folders/:id/rename | /move ----
        if (req.method === 'POST' && seg.length === 5 && seg[2] === 'folders' &&
            (seg[4] === 'rename' || seg[4] === 'move')) {
          const fid = parseInt(seg[3] || '');
          if (Number.isNaN(fid)) return json(400, { error: '非法文件夹 id' });
          const target = await getFolderById(fid);
          if (!target) return json(404, { error: '文件夹不存在' });

          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }

          if (seg[4] === 'rename') {
            const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
            if (!name) return json(400, { error: '缺少 name' });
            await renameFolder(fid, name);
            await writeLog('folder-rename', `id=${fid} -> ${name}`);
            return json(200, { id: fid, name });
          }
          // move
          let parentId: number | null = null;
          if (parsed.parentId !== undefined && parsed.parentId !== null) {
            if (typeof parsed.parentId !== 'number') return json(400, { error: 'parentId 必须是数字或 null' });
            parentId = parsed.parentId;
          }
          if (parentId === fid) return json(400, { error: '不能移动到自身' });
          await moveFolder(fid, parentId);
          await writeLog('folder-move', `id=${fid} parent=${parentId}`);
          return json(200, { id: fid, parentId });
        }

        // ---- 删除文件夹：DELETE /folders/:id ----
        if (req.method === 'DELETE' && seg.length === 4 && seg[2] === 'folders') {
          const fid = parseInt(seg[3] || '');
          if (Number.isNaN(fid)) return json(400, { error: '非法文件夹 id' });
          const target = await getFolderById(fid);
          if (!target) return json(404, { error: '文件夹不存在' });
          await deleteFolder(fid);
          await writeLog('folder-delete', `id=${fid}（文档/子文件夹移入根）`);
          return json(200, { status: 'deleted' });
        }

        // ---- 文件移动：POST /files/:id/move ----
        if (req.method === 'POST' && seg.length === 5 && seg[2] === 'files' && seg[4] === 'move') {
          const fileId = parseInt(seg[3] || '');
          if (Number.isNaN(fileId)) return json(400, { error: '非法 fileId' });
          const rec = await getKnowledgeFileById(fileId);
          if (!rec) return json(404, { error: '条目不存在' });
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          let folderId: number | null = null;
          if (parsed.folderId !== undefined && parsed.folderId !== null) {
            if (typeof parsed.folderId !== 'number') return json(400, { error: 'folderId 必须是数字或 null' });
            folderId = parsed.folderId;
          }
          if (folderId !== null && !(await getFolderById(folderId))) {
            return json(404, { error: '目标文件夹不存在' });
          }
          await moveFileToFolder(fileId, folderId);
          await writeLog('file-move', `fileId=${fileId} -> folder=${folderId}`);
          return json(200, { fileId, folderId });
        }

        // ---- 新建文档（空白 MD）：POST /files/new ----
        if (req.method === 'POST' && pathname === '/api/wiki/files/new') {
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          const title = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
          if (!title) return json(400, { error: '缺少 title' });
          let folderId: number | null = null;
          if (parsed.folderId !== undefined && parsed.folderId !== null) {
            if (typeof parsed.folderId !== 'number') return json(400, { error: 'folderId 必须是数字或 null' });
            if (!(await getFolderById(parsed.folderId))) return json(404, { error: '目标文件夹不存在' });
            folderId = parsed.folderId;
          }
          // 同名自动重命名，保证 mdDir 内文件名唯一
          const existingNames = (await listKnowledgeFiles()).map((f) => f.file_name);
          const finalName = resolveUniqueFileName(title.endsWith('.md') ? title : `${title}.md`, existingNames);
          await fs.mkdir(settings.mdStoragePath, { recursive: true });
          const mdPath = path.join(settings.mdStoragePath, finalName);
          const content = `# ${finalName.replace(/\.md$/i, '')}\n\n`;
          await fs.writeFile(mdPath, content, 'utf-8');
          const fileId = await insertKnowledgeFile({
            file_name: finalName,
            source_path: 'manual://' + title,
            md_path: mdPath,
            zip_archive_path: '',
            file_type: 'md',
            create_time: Date.now(),
            last_sync_time: Date.now(),
            folder_id: folderId,
          });
          // 空内容也走一遍 reindex（向量库留一条记录，后续编辑时重建）
          await importer.reindex(fileId, content);
          await writeLog('create-blank-md', `新建文档 fileId=${fileId} name=${finalName}`);
          return json(200, { fileId, fileName: finalName, mdPath });
        }

        // ---- 读取 MD 内容：GET /files/:id/content ----
        if (req.method === 'GET' && seg.length === 5 && seg[2] === 'files' && seg[4] === 'content') {
          const fileId = parseInt(seg[3] || '');
          if (Number.isNaN(fileId)) return json(400, { error: '非法 fileId' });
          const rec = await getKnowledgeFileById(fileId);
          if (!rec) return json(404, { error: '条目不存在' });
          let content = '';
          try { content = await fs.readFile(rec.md_path, 'utf-8'); } catch { content = ''; }
          return json(200, { content });
        }

        // ---- 保存 MD 内容（人工编辑链路）：POST /files/:id/content ----
        if (req.method === 'POST' && seg.length === 5 && seg[2] === 'files' && seg[4] === 'content') {
          const fileId = parseInt(seg[3] || '');
          if (Number.isNaN(fileId)) return json(400, { error: '非法 fileId' });
          const rec = await getKnowledgeFileById(fileId);
          if (!rec) return json(404, { error: '条目不存在' });
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          const content = typeof parsed?.content === 'string' ? parsed.content : '';
          const baseline = typeof parsed?.baseline === 'string' ? parsed.baseline : undefined;
          // 审计日志记录新旧内容哈希
          let oldContent = '';
          try { oldContent = await fs.readFile(rec.md_path, 'utf-8'); } catch { oldContent = ''; }
          // 编辑冲突检测：打开后外部改动了磁盘（磁盘 ≠ 基线），且本次保存内容 ≠ 磁盘当前 → 冲突
          const conflict = detectEditConflict(oldContent, content, baseline);
          if (conflict.conflict) {
            return json(409, { error: 'conflict', diskContent: conflict.diskContent });
          }
          await fs.mkdir(path.dirname(rec.md_path), { recursive: true });
          await fs.writeFile(rec.md_path, content, 'utf-8');
          // 重建向量库
          await importer.reindex(fileId, content);
          await writeLog(
            'manual_edit',
            `人工编辑 fileId=${fileId} old=${sha256Text(oldContent)} new=${sha256Text(content)}`
          );
          return json(200, { status: 'saved' });
        }

        // ---- 文件夹重选源：POST /folders/:id/rebind-source ----
        if (req.method === 'POST' && seg.length === 5 && seg[2] === 'folders' && seg[4] === 'rebind-source') {
          const fid = parseInt(seg[3] || '');
          if (Number.isNaN(fid)) return json(400, { error: '非法文件夹 id' });
          if (!(await getFolderById(fid))) return json(404, { error: '文件夹不存在' });
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          const newDir = typeof parsed?.sourceDir === 'string' ? parsed.sourceDir.trim() : '';
          if (!newDir) return json(400, { error: '缺少 sourceDir' });
          if (!(newDir.startsWith('/') || isUncPath(newDir))) return json(400, { error: 'sourceDir 必须是本地目录或 UNC 路径' });

          // 收集本文件夹及全部子文件夹下的知识文件
          const allFolders = await listFolders();
          const allFiles = await listKnowledgeFiles();
          const childIds = new Set<number>([fid]);
          const stack = [fid];
          while (stack.length) {
            const pid = stack.pop()!;
            for (const f of allFolders) {
              if (f.parent_id === pid && !childIds.has(f.id)) { childIds.add(f.id); stack.push(f.id); }
            }
          }
          const files = allFiles.filter((f) => f.folder_id !== null && childIds.has(f.folder_id));

          // 仅处理有本地源文件的条目
          const localFiles = files.filter((f) => f.source_path.startsWith('/') || isUncPath(f.source_path));
          if (!localFiles.length) {
            return json(200, { status: 'rebounded', count: 0, reason: '该文件夹（含子文件夹）下无本地源文件条目' });
          }

          // 计算本地源路径的公共父目录（跨 / 与 \ 分隔符，保留 Windows / UNC 形态）
          const splitP = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
          const groups = localFiles.map((f) => splitP(f.source_path));
          const first = groups[0];
          let i = 0;
          while (i < first.length && groups.every((g) => g[i] === first[i])) i++;
          let segs = first.slice(0, i);
          if (segs.length && localFiles.length === 1) segs = segs.slice(0, -1); // 单文件时去掉文件名段
          const isUnc = localFiles[0].source_path.startsWith('\\\\');
          const common = isUnc ? '\\\\' + segs.join('\\') : (localFiles[0].source_path.startsWith('/') ? '/' + segs.join('/') : segs.join('/'));
          const newDirClean = newDir.replace(/[\\/]+$/, '');

          let count = 0;
          const rebound: Array<{ fileId: number; from: string; to: string }> = [];
          for (const f of localFiles) {
            const rel = splitP(f.source_path).slice(segs.length).join('/');
            const to = newDirClean + (rel ? (isUnc ? '\\' + rel.replace(/\//g, '\\') : '/' + rel) : '');
            const oldSource = f.source_path;
            try { watcher.unwatchPath(oldSource); } catch { /* ignore */ }
            await updateSourcePath(f.id, to);
            try { watcher.watchSource(f.id); } catch { /* ignore */ }
            // 重新归档新源文件（容错降级，不中断批量重选）
            try {
              const newZip = await archiveSourceFile(to, settings.zipStoragePath, `${f.file_name.replace(/\.md$/i, '')}-src`);
              try { if (f.zip_archive_path) await fs.unlink(f.zip_archive_path); } catch { /* ignore */ }
              await updateZipPath(f.id, newZip);
            } catch (e) { await writeLog('folder-rebind-archive-error', `fileId=${f.id}: ${(e as Error).message}`); }
            rebound.push({ fileId: f.id, from: oldSource, to });
            count++;
          }
          await writeLog('folder-rebind-source', `文件夹重选源 id=${fid} common=${common} -> ${newDir} count=${count}`);
          return json(200, { status: 'rebounded', count, common, newDir: newDirClean, rebound });
        }

        // ---- 文件夹批量同步：POST /folders/:id/sync ----
        if (req.method === 'POST' && seg.length === 5 && seg[2] === 'folders' && seg[4] === 'sync') {
          const fid = parseInt(seg[3] || '');
          if (Number.isNaN(fid)) return json(400, { error: '非法文件夹 id' });
          if (!(await getFolderById(fid))) return json(404, { error: '文件夹不存在' });
          const files = await listKnowledgeFilesByFolder(fid);
          let synced = 0;
          let skipped = 0;
          const needsConfirm: Array<{ fileId: number; fileName: string; diff: any }> = [];
          for (const f of files) {
            const outcome = await triggerSourceSync(f.id, f.zip_archive_path, f.md_path);
            if (outcome.status === 'needs-confirm' && outcome.diff) {
              needsConfirm.push({ fileId: f.id, fileName: f.file_name, diff: outcome.diff });
            } else if (outcome.status === 'no-change') {
              synced++;
            } else {
              // source-lost：源文件丢失，不阻塞批量同步
              skipped++;
            }
          }
          await writeLog(
            'folder-sync',
            `文件夹批量同步 id=${fid} total=${files.length} synced=${synced} skipped=${skipped} needsConfirm=${needsConfirm.length}`
          );
          return json(200, { total: files.length, synced, skipped, needsConfirm });
        }

        // ---- 设置：GET /settings ----
        if (req.method === 'GET' && pathname === '/api/wiki/settings') {
          return json(200, publicSettings());
        }
        // ---- 设置：POST /settings（修改存储目录时迁移文件并更新 DB）----
        if (req.method === 'POST' && pathname === '/api/wiki/settings') {
          let parsed: any;
          try { parsed = JSON.parse(body || '{}'); } catch {
            return json(400, { error: '请求体不是合法 JSON' });
          }
          if (typeof parsed !== 'object' || parsed === null) return json(400, { error: '请求体必须是对象' });
          await applySettingsPatch(parsed);
          await writeLog('settings-update', '设置已保存');
          return json(200, { status: 'saved', settings: publicSettings() });
        }

        // ---- 批量任务：GET /jobs（最近 20，最新在前）----
        if (req.method === 'GET' && pathname === '/api/wiki/jobs') {
          pruneJobs();
          const list = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20);
          return json(200, list.map((j) => {
            const { startedAt: _s, ...rest } = j;
            return rest;
          }));
        }
        // ---- 批量任务：GET /jobs/:jobId ----
        if (req.method === 'GET' && seg.length === 4 && seg[2] === 'jobs') {
          const job = jobs.get(seg[3] || '');
          if (!job) return json(404, { error: '任务不存在' });
          const { startedAt: _s, ...rest } = job;
          return json(200, rest);
        }

        // ---- 检查更新：GET /api/wiki/update-check（5 分钟内存缓存）----
        if (req.method === 'GET' && pathname === '/api/wiki/update-check') {
          const currentVersion = readCurrentVersion();
          // 缓存命中：直接复用 5 分钟内的结果，不打 npm registry
          if (updateCache && Date.now() - updateCache.at < UPDATE_CHECK_TTL_MS) {
            const latestVersion = updateCache.latestVersion;
            return json(200, {
              currentVersion,
              latestVersion,
              hasUpdate: latestVersion !== currentVersion,
              packageUrl: `https://www.npmjs.com/package/dsh-wiki-rag/v/${latestVersion}`,
              cached: true,
            });
          }
          try {
            const resp = await fetch('https://registry.npmjs.org/dsh-wiki-rag/latest', {
              signal: AbortSignal.timeout(8000),
            });
            if (!resp.ok) throw new Error(`http ${resp.status}`);
            const data = await resp.json() as { version?: string };
            const latestVersion = data.version || currentVersion;
            updateCache = { at: Date.now(), latestVersion };
            return json(200, {
              currentVersion,
              latestVersion,
              hasUpdate: latestVersion !== currentVersion,
              packageUrl: `https://www.npmjs.com/package/dsh-wiki-rag/v/${latestVersion}`,
              cached: false,
            });
          } catch {
            // 任何异常都不抛 5xx，统一 hasUpdate:false
            return json(200, {
              currentVersion,
              latestVersion: currentVersion,
              hasUpdate: false,
              packageUrl: '',
              cached: false,
            });
          }
        }

        // ---- 单条目操作：/api/wiki/:id[/action] ----
        if (seg[1] === 'wiki' && seg[2]) {
          const id = parseInt(seg[2]);
          const action = seg[3];
          const record = await getKnowledgeFileById(id);

          if (req.method === 'DELETE' && !action) {
            // 并发去重：同一文件删除进行中 → 409
            const opKey = `delete:${id}`;
            if (!acquire(opKey)) return json(409, { error: 'operation-in-progress' });
            try {
              if (record) {
                try { await fs.unlink(record.md_path); } catch { /* ignore */ }
                try { if (record.zip_archive_path) await fs.unlink(record.zip_archive_path); } catch { /* ignore */ }
                // 条目删除时同步摘掉源文件监听
                try { watcher.unwatchPath(record.source_path); } catch { /* ignore */ }
              }
              await deleteKnowledgeFile(id);
              pendingChanges.splice(0, pendingChanges.length, ...pendingChanges.filter((p) => p.fileId !== id));
              await writeLog('delete', `删除 fileId=${id}`);
              return json(200, { status: 'deleted', id });
            } finally {
              release(opKey);
            }
          }

          if (req.method === 'POST' && action === 'sync') {
            if (!record) return json(404, { error: '条目不存在' });
            const outcome = await triggerSourceSync(id, record.zip_archive_path, record.md_path);
            return json(200, outcome);
          }

          if (req.method === 'POST' && action === 'accept-update') {
            if (!record) return json(404, { error: '条目不存在' });
            let parsed: any;
            try { parsed = JSON.parse(body || '{}'); } catch {
              return json(400, { error: '请求体不是合法 JSON' });
            }
            const newText = parsed?.newText;
            if (typeof newText !== 'string') return json(400, { error: '缺少 newText' });
            // 覆盖前自动快照备份（最多保留 3 份）
            if (settings.autoSnapshot) {
              try {
                await createSnapshot(settings.mdStoragePath, settings.zipStoragePath, snapshotStoragePath);
                await pruneSnapshots(settings.snapshotKeep);
              } catch (e) { await writeLog('auto-snapshot-error', (e as Error).message); }
            }
            await applySourceUpdate(id, newText, record.md_path, (fid, t) => importer.reindex(fid, t));
            const idx = pendingChanges.findIndex((p) => p.fileId === id);
            if (idx >= 0) pendingChanges.splice(idx, 1);
            return json(200, { status: 'accepted', fileId: id });
          }

          if (req.method === 'POST' && action === 'dismiss') {
            const idx = pendingChanges.findIndex((p) => p.fileId === id);
            if (idx >= 0) pendingChanges.splice(idx, 1);
            return json(200, { status: 'dismissed', fileId: id });
          }

          if (req.method === 'POST' && action === 'rename') {
            if (!record) return json(404, { error: '条目不存在' });
            let parsed: any;
            try { parsed = JSON.parse(body || '{}'); } catch {
              return json(400, { error: '请求体不是合法 JSON' });
            }
            const clean = (parsed?.newName || '').trim();
            if (!clean) return json(400, { error: '缺少 newName' });
            const desired = clean.endsWith('.md') ? clean : `${clean}.md`;
            const mdDir = path.dirname(record.md_path);
            const existing = (await listKnowledgeFiles()).map((f) => f.file_name).filter((n) => n !== record.file_name);
            const finalName = resolveUniqueFileName(desired, existing);
            const newMdPath = path.join(mdDir, finalName);
            try { await fs.rename(record.md_path, newMdPath); } catch { /* 原文件已失也继续更新记录 */ }
            await updateMdPath(id, finalName, newMdPath);
            await writeLog('rename', `重命名 fileId=${id} -> ${finalName}`);
            return json(200, { status: 'renamed', fileId: id, file_name: finalName, md_path: newMdPath });
          }

          if (req.method === 'POST' && action === 'rebind-source') {
            if (!record) return json(404, { error: '条目不存在' });
            let parsed: any;
            try { parsed = JSON.parse(body || '{}'); } catch {
              return json(400, { error: '请求体不是合法 JSON' });
            }
            const sourcePath = typeof parsed?.sourcePath === 'string' ? parsed.sourcePath.trim() : '';
            if (!sourcePath) return json(400, { error: '缺少 sourcePath' });
            const oldSource = record.source_path;
            // 1. 摘掉旧路径监听
            try { watcher.unwatchPath(oldSource); } catch { /* ignore */ }
            // 2. 审计：新旧内容哈希（本地/可读才算，否则置空）
            let oldHash = '';
            let newHash = '';
            const isLocalNew = sourcePath.startsWith('/') || isUncPath(sourcePath);
            try { oldHash = sha256Text(await extractTextToMarkdown(oldSource)); } catch { oldHash = ''; }
            try { newHash = sha256Text(await extractTextToMarkdown(sourcePath)); } catch { newHash = ''; }
            // 3. 更新 DB source_path
            await updateSourcePath(id, sourcePath);
            // 4. 本地文件：重新归档覆盖旧 zip；URL 不归档
            if (isLocalNew) {
              try {
                const newZipPath = await archiveSourceFile(
                  sourcePath,
                  settings.zipStoragePath,
                  `${record.file_name.replace(/\.md$/i, '')}-src`
                );
                try { if (record.zip_archive_path) await fs.unlink(record.zip_archive_path); } catch { /* ignore */ }
                await updateZipPath(id, newZipPath);
              } catch (e) {
                await writeLog('rebind-archive-error', `fileId=${id}: ${(e as Error).message}`);
              }
              // 5. 重新挂新路径监听
              try { watcher.watchSource(id); } catch { /* ignore */ }
            }
            await writeLog(
              'rebind-source',
              `重新绑定 fileId=${id} ${oldSource} -> ${sourcePath} old=${oldHash} new=${newHash}`
            );
            return json(200, { status: 'rebound', sourcePath });
          }

          if (req.method === 'POST' && action === 'shelve') {
            // 三态操作之“暂存”：不删除，仅标记 shelved，前端可继续查看
            for (const p of pendingChanges) {
              if (p.fileId === id) p.shelved = true;
            }
            await writeLog('shelve', `暂存待确认变更 fileId=${id}`);
            return json(200, { status: 'shelved' });
          }
        }

        return json(404, { error: 'not found', path: pathname });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error('http request failed', { path: pathname, method: req.method, error: errMsg });
        await writeLog('http-error', `${pathname}: ${errMsg}`).catch(() => {});
        sendHttpError(res, e);
      }
    });
    server.listen(3081, () => {
      logger.info('API server listening', { port: 3081 });
    });
    return () => server.close();
  }, 'wiki: http api server');

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
    // 长运行下定期 WAL checkpoint，避免 -wal 文件无限增长
    const checkpointTimer = setInterval(() => {
      try { walCheckpoint('PASSIVE'); } catch { /* ignore */ }
    }, 5 * 60 * 1000);
    const cleanup = () => {
      if (!closed) {
        closed = true;
        clearInterval(checkpointTimer);
        void watcher.stop();
        try { closeDatabase(); } catch { /* ignore */ }
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

/** 是否为本地可监听路径（绝对路径或 UNC 网络路径） */
function isUncSource(p: string): boolean {
  return !!p && (p.startsWith('\\\\') || p.startsWith('//'));
}

/** 判断 URL 是否指向公网（非 localhost / 私网 IP） */
function isPublicUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return false;
    if (/^127\./.test(host)) return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}
