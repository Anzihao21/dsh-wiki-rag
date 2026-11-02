import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { insertKnowledgeFile, listFileNamesByPath } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { deleteChunksByFileId, insertVectorChunk } from '../db/vector-db';
import { chunkText } from '../rag/text-chunk';
import { embedText } from '../rag/embedding';
import { resolveUniqueFileName, isUncPath } from './name-auto-rename';
import { archiveSourceFile } from './zip-archive';
import { extractTextToMarkdown, isOversize, toMdFileName, detectFileType } from './file-utils';
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

    if (await isOversize(resolved)) {
      return { fileId: 0, fileName, mdPath: '', skipped: true, reason: '文件超过大小阈值，已拦截' };
    }

    const mdText = await extractTextToMarkdown(resolved);
    const type = detectFileType(resolved) === 'unknown' ? 'md' : detectFileType(resolved);
    return this.commitImport(resolved, fileName, mdText, type as FileType);
  }

  /** 文件夹批量导入：遍历目录下可解析文档 */
  async importFolder(folderPath: string): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const files = await this.scanParseableFiles(folderPath);
    for (const f of files) {
      try {
        results.push(await this.importLocalFile(f));
      } catch (e) {
        await writeLog('import-folder-error', `${f}: ${(e as Error).message}`);
      }
    }
    return results;
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
    await fs.mkdir(this.ctx.mdDir, { recursive: true });
    await fs.mkdir(this.ctx.zipDir, { recursive: true });

    // 同名自动重命名（基于知识库目录已有文件名）
    const existing = await listFileNamesByPath(this.ctx.mdDir);
    const finalMdName = resolveUniqueFileName(rawFileName, existing);
    const mdPath = path.join(this.ctx.mdDir, finalMdName);

    await fs.writeFile(mdPath, mdText, 'utf-8');

    // 归档原始文件（网页/笔记无本地源文件时，归档 MD 本身作凭证）
    const baseName = finalMdName.replace(/\.md$/i, '');
    const isLocalRef = sourceRef.startsWith('/') || isUncPath(sourceRef);
    let zipPath: string;
    if (isLocalRef) {
      zipPath = await archiveSourceFile(sourceRef, this.ctx.zipDir, `${baseName}-src`);
    } else {
      zipPath = await archiveSourceFile(mdPath, this.ctx.zipDir, `${baseName}-meta`);
    }

    const fileId = await insertKnowledgeFile({
      file_name: finalMdName,
      source_path: isLocalRef ? sourceRef : `ref://${sourceRef}`,
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
    const chunks = chunkText(text, this.ctx.chunkSize, this.ctx.chunkOverlap);
    for (const c of chunks) {
      const vec = embedText(c);
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
