import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { insertKnowledgeFile, listFileNamesByPath, findKnowledgeFileBySourcePath } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { deleteChunksByFileId, insertVectorChunk } from '../db/vector-db';
import { chunkTextSmart } from '../rag/text-chunk';
import { embedText } from '../rag/embedding';
import { resolveUniqueFileName } from './name-auto-rename';
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
  async importLocalFile(sourcePath: string): Promise<ImportResult> {
    const resolved = sourcePath;
    const fileName = path.basename(resolved);

    if (await isOversize(resolved, 10)) {
      return { fileId: 0, fileName, mdPath: '', skipped: true, reason: '文件超过 10MB 大小阈值，已拦截' };
    }

    const mdText = await extractTextToMarkdown(resolved);
    const type = detectFileType(resolved) === 'unknown' ? 'md' : detectFileType(resolved);
    return this.commitImport(resolved, fileName, mdText, type as FileType);
  }

  /** 文件夹批量导入：遍历目录下可解析文档，返回带统计的汇总结果 */
  async importFolder(folderPath: string): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const files = await this.scanParseableFiles(folderPath);
    for (const f of files) {
      try {
        results.push(await this.importLocalFile(f));
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

  /** 笔记文本直接新建 MD 知识库文档 */
  async importNote(title: string, noteText: string): Promise<ImportResult> {
    const mdText = `# ${title}\n\n${noteText}`;
    const fileName = `${title}.md`;
    return this.commitImport(`note://${title}`, fileName, mdText, 'note');
  }

  /** 核心入库流程 */
  private async commitImport(
    sourceRef: string,
    rawFileName: string,
    mdText: string,
    fileType: FileType
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
      if (isLocalRef) {
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
      last_sync_time: Date.now()
    });

    // 切片 + 向量化
    await this.reindex(fileId, mdText);

    await writeLog('import', `导入 ${finalMdName} (id=${fileId})`);
    return { fileId, fileName: finalMdName, mdPath, skipped: false };
  }

  /** 重新切片并写入向量库 */
  async reindex(fileId: number, text: string): Promise<void> {
    await deleteChunksByFileId(fileId);
    const chunks = chunkTextSmart(text, this.ctx.chunkSize, this.ctx.chunkOverlap, this.ctx.chunkMode);
    for (const c of chunks) {
      const vec = await embedText(c);
      await insertVectorChunk(fileId, c, vec);
    }
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
        } else if (/\.(pdf|docx|md|txt)$/i.test(e.name)) {
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
