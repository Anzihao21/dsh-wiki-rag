import archiver from 'archiver';
import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { listKnowledgeFiles } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { assertZipEntryInside } from '../file/path-guard';

/**
 * 快照备份模块。
 * 约定：快照只是备份手段，不做自动多版本历史管理。
 * - 手动快照：一键打包全部知识库 MD + 归档 zip
 * - 恢复：选择快照包覆盖当前知识库（高危，调用方需二次确认）
 */
export async function createSnapshot(mdDir: string, zipDir: string, snapshotDir: string): Promise<string> {
  await fs.mkdir(snapshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(snapshotDir, `snapshot-${stamp}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = (archiver as any)('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(mdDir, 'md');
    archive.directory(zipDir, 'zip');
    archive.finalize();
  });

  await writeLog('snapshot-create', outPath);
  return outPath;
}

/** 列出快照文件 */
export async function listSnapshots(snapshotDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(snapshotDir);
    return files.filter((f) => f.endsWith('.zip')).sort().reverse();
  } catch {
    return [];
  }
}

/** 恢复快照：解压覆盖（仅返回目标目录，实际覆盖由调用方按需执行） */
export async function restoreSnapshot(snapshotZip: string, targetDir: string): Promise<string[]> {
  const { default: extract } = await import('extract-zip');
  await fs.mkdir(targetDir, { recursive: true });
  // zip-slip 防护：每个条目解压前先断言落在 targetDir 内，越界直接抛错中断
  await extract(snapshotZip, {
    dir: targetDir,
    onEntry: (entry) => {
      assertZipEntryInside(entry.fileName, targetDir);
    },
  });
  const restored = await fs.readdir(targetDir);
  await writeLog('snapshot-restore', snapshotZip);
  return restored;
}

/** 预览恢复：对比当前 MD 目录和快照内容，返回 Diff 预览 */
export async function previewRestore(snapshotZip: string, currentMdDir: string): Promise<{
  added: string[];      // 快照里有、当前没有的文件（恢复后新增）
  removed: string[];    // 当前有、快照里没有的文件（恢复后删除）
  modified: string[];   // 两边都有但内容不同（恢复后覆盖）
}> {
  const { default: extract } = await import('extract-zip');
  const os = await import('os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-preview-'));
  try {
    // 解压快照到临时目录
    await extract(snapshotZip, { dir: tmpDir });
    const snapshotMdDir = path.join(tmpDir, 'md');

    // 列出当前 MD 文件
    let currentFiles: string[] = [];
    try { currentFiles = await fs.readdir(currentMdDir); } catch { currentFiles = []; }

    // 列出快照 MD 文件
    let snapshotFiles: string[] = [];
    try { snapshotFiles = await fs.readdir(snapshotMdDir); } catch { snapshotFiles = []; }

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // 快照里有、当前没有 → 新增
    for (const f of snapshotFiles) {
      if (!currentFiles.includes(f)) added.push(f);
    }

    // 当前有、快照里没有 → 删除
    for (const f of currentFiles) {
      if (!snapshotFiles.includes(f)) removed.push(f);
    }

    // 两边都有但内容不同 → 修改
    for (const f of snapshotFiles) {
      if (currentFiles.includes(f)) {
        const currentContent = await fs.readFile(path.join(currentMdDir, f)).catch(() => null);
        const snapshotContent = await fs.readFile(path.join(snapshotMdDir, f)).catch(() => null);
        if (currentContent && snapshotContent && !currentContent.equals(snapshotContent)) {
          modified.push(f);
        }
      }
    }

    return { added, removed, modified };
  } finally {
    // 清理临时目录
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
