import { promises as fs } from 'fs';
import path from 'path';
import { getKnowledgeFileById, updateSyncTime } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { sha256File, extractTextToMarkdown, sha256Text, isLocalFsPath } from './file-utils';
import { buildDiffResult } from './diff-compare';
import type { DiffResult } from '../types';

export interface SourceSyncOutcome {
  status: 'no-change' | 'needs-confirm' | 'source-lost';
  diff?: DiffResult;
  reason?: string;
}

/**
 * 【从源目录更新】核心同步逻辑。
 * 1. 读取数据库记录内 source_path
 * 2. 源文件是否存在 → 不存在提示重新绑定
 * 3. 哈希对比 zip 归档 vs 磁盘当前 → 一致跳过 / 不一致生成 diff 等待确认
 */
export async function triggerSourceSync(
  fileId: number,
  zipArchivePath: string,
  mdPath: string
): Promise<SourceSyncOutcome> {
  const record = await getKnowledgeFileById(fileId);
  if (!record) {
    return { status: 'source-lost', reason: '知识条目不存在' };
  }

  const sourcePath = record.source_path;
  const isLocalRef = isLocalFsPath(sourcePath);

  if (!isLocalRef) {
    // 网页/笔记条目无本地源文件，跳过
    return { status: 'no-change', reason: '该条目无本地源文件（网页/笔记），无需同步' };
  }

  // 源文件是否仍存在
  let sourceHash: string;
  try {
    await fs.access(sourcePath);
    sourceHash = await sha256File(sourcePath);
  } catch {
    return { status: 'source-lost', reason: `源文件丢失: ${sourcePath}` };
  }

  // 归档包哈希对比（此处以磁盘 MD 哈希作为变更判据，归档对比见 zip-archive）
  let archiveHash: string | null = null;
  try {
    await fs.access(zipArchivePath);
    archiveHash = await sha256File(zipArchivePath);
  } catch {
    archiveHash = null;
  }

  // 读取旧 MD 与新提取文本做 diff
  let oldText = '';
  try {
    oldText = await fs.readFile(mdPath, 'utf-8');
  } catch {
    oldText = '';
  }
  const newText = await extractTextToMarkdown(sourcePath);

  // 用内容哈希判据：新旧文本一致视为无改动（zip 哈希仅作归档一致性参考）
  if (oldText && sha256Text(oldText) === sha256Text(newText)) {
    return { status: 'no-change', reason: '文件无改动，跳过更新' };
  }

  return {
    status: 'needs-confirm',
    diff: buildDiffResult(fileId, record.file_name, oldText, newText)
  };
}

/** 确认更新：覆盖 MD，刷新向量库（由调用方注入 reindex 逻辑） */
export async function applySourceUpdate(
  fileId: number,
  newText: string,
  mdPath: string,
  reindex: (fileId: number, text: string) => Promise<void>
): Promise<void> {
  // 覆盖前读取旧内容，审计日志记录新旧内容哈希
  let oldText = '';
  try {
    oldText = await fs.readFile(mdPath, 'utf-8');
  } catch {
    oldText = '';
  }
  await fs.mkdir(path.dirname(mdPath), { recursive: true });
  await fs.writeFile(mdPath, newText, 'utf-8');
  await reindex(fileId, newText);
  await updateSyncTime(fileId, Date.now());
  await writeLog(
    'source-sync',
    `已接受更新 fileId=${fileId} old=${sha256Text(oldText)} new=${sha256Text(newText)}`
  );
}
