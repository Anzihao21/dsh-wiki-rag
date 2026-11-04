import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { insertKnowledgeFile, listFileNamesByPath, findKnowledgeFileBySourcePath } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { replaceFileChunks } from '../db/vector-db';
import { chunkTextSmart } from '../rag/text-chunk';
import { chunkSheetTable } from './excel-parse';
import { embedText } from '../rag/embedding';
import { resolveUniqueFileName, isUncPath } from './name-auto-rename';
import { checkUncAccess, withNetworkRetry } from './unc-retry';
import { archiveSourceFile } from './zip-archive';
import { extractTextToMarkdown, isOversize, toMdFileName, detectFileType, isLocalFsPath } from './file-utils';
import { sanitizeFileName, assertInsideDir } from './path-guard';
import type { FileType } from '../types';

export interface ImportResult {
  fileId: number;
  fileName: string;
  mdPath: string;
  skipped: boolean;
  reason?: string;
}

interface ImportContext {
  mdDir: string;
  zipDir: string;
  chunkSize: number;
  chunkOverlap: number;
  chunkMode: 'fixed' | 'heading';
  webTimeout: number;
}

/**
 * 文件导入模块。
 * 支持：本地单文件 / 文件夹批量 / 局域网共享路径 / 网页URL / 笔记文本。
 * 流程：提取正文 → 生成MD → 同名重命名 → 源文件zip归档 → 入库 → 切片向量化。
 */
export class FileImporter {
  private ctx: ImportContext;

  constructor(ctx: ImportContext) {
    this.ctx = ctx;
  }

  /**
   * 导入单个本地文件（本地或局域网共享路径均可，通过 fs 访问）。
   * @param sourcePath 源文件绝对路径
   */
  async importLocalFile(sourcePath: string, folderId: number | null = null): Promise<ImportResult> {
    const resolved = sourcePath;
    const fileName = path.basename(resolved);

    if (await isOversize(resolved, 10)) {
      return { fileId: 0, fileName, mdPath: '', skipped: true, reason: '文件超过 10MB 大小阈值，已拦截' };
    }

    // 局域网共享路径：显式权限 / 可达性检测，无权限或不可达则拒绝导入
    if (isUncPath(resolved)) {
      const acc = await checkUncAccess(resolved);
      if (!acc.ok) {
        await writeLog('unc-permission-denied', `导入被拒 file=${fileName} ${acc.reason}`);
        return { fileId: 0, fileName, mdPath: '', skipped: true, reason: acc.reason };
      }
    }

    // 断网自动重试：网络类错误重试后再失败才按导入失败处理
    let mdText: string;
    try {
      mdText = await withNetworkRetry(() => extractTextToMarkdown(resolved), {
        label: `导入读取 ${fileName}`,
      });
    } catch (e) {
      await writeLog('import-read-error', `${fileName}: ${(e as Error).message}`);
      return { fileId: 0, fileName, mdPath: '', skipped: true, reason: (e as Error).message };
    }
    const type = detectFileType(resolved) === 'unknown' ? 'md' : detectFileType(resolved);
    return this.commitImport(resolved, fileName, mdText, type as FileType, '', folderId);
  }

  /** 文件夹批量导入：遍历目录下可解析文档，返回带统计的汇总结果 */
  async importFolder(folderPath: string, folderId: number | null = null): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const files = await this.scanParseableFiles(folderPath);
    for (const f of files) {
      try {
        results.push(await this.importLocalFile(f, folderId));
      } catch (e) {
        await writeLog('import-folder-error', `${f}: ${(e as Error).message}`);
        results.push({
          fileId: 0,
          fileName: path.basename(f),
          mdPath: '',
          skipped: true,
          reason: (e as Error).message
        });
      }
    }
    return results;
  }

  /** 汇总批量导入统计：成功/失败/跳过 */
  summarize(results: ImportResult[]): {
    total: number;
    ok: number;
    skipped: number;
    failed: number;
  } {
    const ok = results.filter((r) => r.fileId > 0 && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    return { total: results.length, ok, skipped, failed: results.length - ok - skipped };
  }

  /** 网页 URL 抓取导入（调用 network/web-crawler） */
  async importUrl(url: string, intranetMode: boolean): Promise<ImportResult> {
    const { fetchWebContent } = await import('../network/web-crawler');
    const content = await fetchWebContent(url, intranetMode, {
      intranetMode,
      timeout: this.ctx.webTimeout
    });
    const mdText = `# ${url}\n\n${content}`;
    const fileName = `${this.safeNameFromUrl(url)}.md`;
    return this.commitImport(url, fileName, mdText, 'url');
  }

  /** 笔记文本直接新建 MD 知识库文档；原始笔记 TXT 归档作证据层凭证 */
  async importNote(title: string, noteText: string): Promise<ImportResult> {
    const mdText = `# ${title}\n\n${noteText}`;
    const fileName = `${title}.md`;
    // 原始笔记 TXT 归档：先写入临时 TXT，再压入 zip，最后删除临时文件
    let noteZip = '';
    try {
      await fs.mkdir(this.ctx.zipDir, { recursive: true });
      const base = sanitizeFileName(fileName.replace(/\.md$/i, '')) || 'note';
      const tmpTxt = path.join(this.ctx.zipDir, `_note_src_${Date.now()}_${randomUUID().slice(0, 6)}.txt`);
      await fs.writeFile(tmpTxt, noteText, 'utf-8');
      noteZip = await archiveSourceFile(tmpTxt, this.ctx.zipDir, `${base}-note`);
      await fs.unlink(tmpTxt).catch(() => {});
    } catch (e) {
      await writeLog('note-archive-degraded', `笔记原文归档失败（降级为仅 MD 入库）: ${(e as Error).message}`);
    }
    return this.commitImport(`note://${title}`, fileName, mdText, 'note', noteZip);
  }

  /**
   * 浏览器/植入面板无法拿到 File.path 时的上传通道：
   * 前端把文件内容以 base64 编码随请求上送，本方法落临时盘后复用 importLocalFile 流程。
   * - 文件名安全化：剔除目录分隔符与非法字符，防止路径穿越
   * - 大小拦截：解码后 > 50MB 直接拒绝，避免超大请求拖垮宿主
   * - 临时目录：os.tmpdir()/dsh-wiki-rag-uploads，finally 清理
   */
  async importUploadContent(
    fileName: string,
    contentB64: string,
    folderId: number | null = null
  ): Promise<ImportResult> {
    const rawName = (fileName || '').trim();
    if (!rawName) throw new Error('缺少文件名');
    if (typeof contentB64 !== 'string' || !contentB64) throw new Error('上传内容为空');

    // base64 合法性校验：只允许 base64 字符与空白，避免 Buffer.from 静默吞掉脏数据
    const cleanedB64 = contentB64.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanedB64)) {
      throw new Error('上传内容不是合法的 base64 编码');
    }
    if (cleanedB64.length % 4 !== 0) {
      throw new Error('上传内容 base64 长度非法（需为 4 的倍数）');
    }

    // 大小拦截：base64 约 4/3 膨胀，解码后 ≈ cleanedB64.length * 3 / 4
    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
    const estimatedBytes = Math.floor((cleanedB64.length * 3) / 4);
    if (estimatedBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`上传内容过大（≈${(estimatedBytes / 1024 / 1024).toFixed(1)}MB），上限 50MB`);
    }

    const safeName = sanitizeFileName(path.basename(rawName)) || 'upload.bin';
    const tmpDir = path.join(os.tmpdir(), 'dsh-wiki-rag-uploads');
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(
      tmpDir,
      `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`
    );
    try {
      const buf = Buffer.from(cleanedB64, 'base64');
      if (buf.length > MAX_UPLOAD_BYTES) {
        throw new Error(`上传内容过大（${(buf.length / 1024 / 1024).toFixed(1)}MB），上限 50MB`);
      }
      await fs.writeFile(tmpPath, buf);
      return await this.importLocalFile(tmpPath, folderId);
    } finally {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
    }
  }

  /** 核心入库流程 */
  private async commitImport(
    sourceRef: string,
    rawFileName: string,
    mdText: string,
    fileType: FileType,
    presetZipPath = '',
    folderId: number | null = null
  ): Promise<ImportResult> {
    // 计算入库时实际写入的 source_path（与下方 insert 保持一致）
    const isLocalRef = isLocalFsPath(sourceRef);
    const storedSourcePath = isLocalRef ? sourceRef : `ref://${sourceRef}`;

    // 重复导入去重：同一 source_path 已存在时直接复用旧记录，不新建条目
    const existing = await findKnowledgeFileBySourcePath(storedSourcePath);
    if (existing) {
      await writeLog('import-dedup', `${storedSourcePath} 已存在 id=${existing.id}，跳过重复导入`);
      return {
        fileId: existing.id,
        fileName: existing.file_name,
        mdPath: existing.md_path,
        skipped: true,
        reason: 'duplicate source',
      };
    }

    await fs.mkdir(this.ctx.mdDir, { recursive: true });
    await fs.mkdir(this.ctx.zipDir, { recursive: true });

    // 同名自动重命名（基于知识库目录已有文件名）
    // 文件名先做路径穿越清洗：剔除目录分隔符与 .. 段，防止 MD 写到 mdDir 之外
    const safeRawName = sanitizeFileName(rawFileName) || 'untitled.md';
    // 保留 .md 后缀
    const mdSuffix = safeRawName.toLowerCase().endsWith('.md') ? '' : '.md';
    const baseNameForDedupe = safeRawName + mdSuffix;

    const existingNames = await listFileNamesByPath(this.ctx.mdDir);
    const finalMdName = resolveUniqueFileName(baseNameForDedupe, existingNames);
    const mdPath = path.join(this.ctx.mdDir, finalMdName);
    assertInsideDir(mdPath, this.ctx.mdDir);

    await fs.writeFile(mdPath, mdText, 'utf-8');

    // 归档原始文件（网页/笔记无本地源文件时，归档 MD 本身作凭证）
    // 归档失败时降级：不中断知识入库，仅记日志（容错设计）
    const baseName = finalMdName.replace(/\.md$/i, '');
    let zipPath = '';
    try {
      if (presetZipPath) {
        // 调用方已预归档（如笔记原文 TXT），直接采用
        zipPath = presetZipPath;
      } else if (isLocalRef) {
        zipPath = await archiveSourceFile(sourceRef, this.ctx.zipDir, `${baseName}-src`);
      } else {
        zipPath = await archiveSourceFile(mdPath, this.ctx.zipDir, `${baseName}-meta`);
      }
    } catch (e) {
      await writeLog('archive-degraded', `${finalMdName}: ${(e as Error).message}`);
    }

    const fileId = await insertKnowledgeFile({
      file_name: finalMdName,
      source_path: storedSourcePath,
      md_path: mdPath,
      zip_archive_path: zipPath,
      file_type: fileType,
      create_time: Date.now(),
      last_sync_time: Date.now(),
      folder_id: folderId
    });

    // 切片 + 向量化（sheet 表格按行分块，pptx 按页 heading，其余按配置模式）
    const chunkMode = fileType === 'sheet' ? 'table' : fileType === 'pptx' ? 'heading' : 'auto';
    await this.reindex(fileId, mdText, chunkMode);

    await writeLog('import', `导入 ${finalMdName} (id=${fileId})`);
    return { fileId, fileName: finalMdName, mdPath, skipped: false };
  }

  /** 重新切片并写入向量库；mode：table=表格行级分块，heading=按标题分块，auto=按设置分块 */
  async reindex(fileId: number, text: string, mode: 'auto' | 'table' | 'heading' = 'auto'): Promise<void> {
    const chunks = mode === 'table'
      ? chunkSheetTable(text, this.ctx.chunkSize, this.ctx.chunkOverlap)
      : chunkTextSmart(text, this.ctx.chunkSize, this.ctx.chunkOverlap, mode === 'heading' ? 'heading' : this.ctx.chunkMode);
    // 分批并发 embed（batch 8）：异步 embedding 并行化，控制并发避免过载
    const rows: Array<{ text: string; vector: Buffer }> = [];
    const BATCH = 8;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vecs = await Promise.all(batch.map((c) => embedText(c)));
      for (let j = 0; j < batch.length; j++) rows.push({ text: batch[j], vector: vecs[j] });
    }
    // 单事务批量替换（delete + insert），避免逐条提交，导入/重建索引的主要性能优化
    await replaceFileChunks(fileId, rows);
  }

  /** 扫描目录下可解析文档（递归） */
  private async scanParseableFiles(folderPath: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (/\.(pdf|docx|md|txt|xlsx|xls|csv|pptx)$/i.test(e.name)) {
          out.push(full);
        }
      }
    };
    await walk(folderPath);
    return out;
  }

  private safeNameFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const seg = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      return seg.replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 60);
    } catch {
      return `web_${randomUUID().slice(0, 8)}`;
    }
  }
}
