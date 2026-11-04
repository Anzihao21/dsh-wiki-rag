import { all, get, lastInsertId, run } from './sqlite-init';
import type { KnowledgeFile, KnowledgeFolder, FileType } from '../types';

/** 新增知识文件记录，返回自增 id */
export async function insertKnowledgeFile(record: Omit<KnowledgeFile, 'id'>): Promise<number> {
  await run(
    `INSERT INTO knowledge_files
     (file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time, folder_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.file_name,
      record.source_path,
      record.md_path,
      record.zip_archive_path,
      record.file_type,
      record.create_time,
      record.last_sync_time,
      record.folder_id ?? null
    ]
  );
  return lastInsertId();
}

/** 更新来源路径（重新绑定源文件时使用） */
export async function updateSourcePath(id: number, sourcePath: string): Promise<void> {
  await run('UPDATE knowledge_files SET source_path = ? WHERE id = ?', [sourcePath, id]);
}

/** 按 id 查询 */
export async function getKnowledgeFileById(id: number): Promise<KnowledgeFile | undefined> {
  return get<KnowledgeFile>('SELECT * FROM knowledge_files WHERE id = ?', [id]);
}

/** 查询全部知识文件（不含回收站软删） */
export async function listKnowledgeFiles(): Promise<KnowledgeFile[]> {
  return all<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE deleted_at IS NULL ORDER BY create_time DESC'
  );
}

/** 按 source_path 精确查找（用于重复导入去重） */
export async function findKnowledgeFileBySourcePath(
  sourcePath: string
): Promise<KnowledgeFile | undefined> {
  return get<KnowledgeFile>('SELECT * FROM knowledge_files WHERE source_path = ?', [sourcePath]);
}

/** 查询某目录下已存在的文件名列表（用于同名重命名判定；不含回收站） */
export async function listFileNamesByPath(mdDir: string): Promise<string[]> {
  const rows = await all<{ file_name: string }>(
    'SELECT file_name FROM knowledge_files WHERE md_path LIKE ? AND deleted_at IS NULL',
    [`${mdDir}%`]
  );
  return rows.map((r) => r.file_name);
}

/** 更新最后同步时间 */
export async function updateSyncTime(id: number, time: number): Promise<void> {
  await run('UPDATE knowledge_files SET last_sync_time = ? WHERE id = ?', [time, id]);
}

/** 更新 MD 路径与文件名 */
export async function updateMdPath(id: number, fileName: string, mdPath: string): Promise<void> {
  await run('UPDATE knowledge_files SET file_name = ?, md_path = ? WHERE id = ?', [
    fileName,
    mdPath,
    id
  ]);
}

/** 删除知识文件记录 */
export async function deleteKnowledgeFile(id: number): Promise<void> {
  await run('DELETE FROM knowledge_files WHERE id = ?', [id]);
}

/** 按文件类型统计（不含回收站软删） */
export async function countByType(): Promise<Record<string, number>> {
  const rows = await all<{ file_type: FileType; cnt: number }>(
    'SELECT file_type, COUNT(*) AS cnt FROM knowledge_files WHERE deleted_at IS NULL GROUP BY file_type'
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.file_type] = r.cnt;
  }
  return result;
}

/** 更新 zip 归档路径（用于自定义存储目录迁移） */
export async function updateZipPath(id: number, zipPath: string): Promise<void> {
  await run('UPDATE knowledge_files SET zip_archive_path = ? WHERE id = ?', [zipPath, id]);
}

/** 按文件夹过滤文档（folderId 为 null 表示根目录；不含回收站软删） */
export async function listKnowledgeFilesByFolder(folderId: number | null): Promise<KnowledgeFile[]> {
  if (folderId === null) {
    return all<KnowledgeFile>(
      'SELECT * FROM knowledge_files WHERE folder_id IS NULL AND deleted_at IS NULL ORDER BY create_time DESC'
    );
  }
  return all<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE folder_id = ? AND deleted_at IS NULL ORDER BY create_time DESC',
    [folderId]
  );
}

// ---------- 文件夹 ----------

/** 列出全部文件夹（不含回收站软删） */
export async function listFolders(): Promise<KnowledgeFolder[]> {
  return all<KnowledgeFolder>(
    'SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY parent_id, id'
  );
}

/** 按 id 查询文件夹 */
export async function getFolderById(id: number): Promise<KnowledgeFolder | undefined> {
  return get<KnowledgeFolder>('SELECT * FROM folders WHERE id = ?', [id]);
}

/** 新建文件夹，返回自增 id */
export async function createFolder(name: string, parentId: number | null = null): Promise<number> {
  await run('INSERT INTO folders (name, parent_id, create_time) VALUES (?, ?, ?)', [
    name,
    parentId,
    Date.now()
  ]);
  return lastInsertId();
}

/** 重命名文件夹 */
export async function renameFolder(id: number, name: string): Promise<void> {
  await run('UPDATE folders SET name = ? WHERE id = ?', [name, id]);
}

/** 移动文件夹到新父目录 */
export async function moveFolder(id: number, parentId: number | null): Promise<void> {
  await run('UPDATE folders SET parent_id = ? WHERE id = ?', [parentId, id]);
}

/**
 * 删除文件夹：其下文档 folder_id 置 NULL（移入根，不删文档），
 * 其子文件夹 parent_id 置 NULL（移入根）。
 */
export async function deleteFolder(id: number): Promise<void> {
  await run('UPDATE knowledge_files SET folder_id = NULL WHERE folder_id = ?', [id]);
  await run('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', [id]);
  await run('DELETE FROM folders WHERE id = ?', [id]);
}

/** 把文档移动到某文件夹（folderId 为 null 表示根目录） */
export async function moveFileToFolder(fileId: number, folderId: number | null): Promise<void> {
  await run('UPDATE knowledge_files SET folder_id = ? WHERE id = ?', [folderId, fileId]);
}

// ---------- 回收站（软删除） ----------

/** 软删除文件（deleted_at=now），不动物理文件 */
export async function softDeleteFile(id: number): Promise<void> {
  await run('UPDATE knowledge_files SET deleted_at = ? WHERE id = ?', [Date.now(), id]);
}

/** 软删除文件夹 + 级联软删其下所有文档与子文件夹（递归） */
export async function softDeleteFolderCascade(id: number): Promise<void> {
  const now = Date.now();
  // 递归收集子文件夹 id（SQLite 无 CTE，用循环）
  const queue: number[] = [id];
  const allFolderIds: number[] = [];
  while (queue.length) {
    const fid = queue.shift()!;
    allFolderIds.push(fid);
    const children = await all<{ id: number }>('SELECT id FROM folders WHERE parent_id = ? AND deleted_at IS NULL', [fid]);
    for (const c of children) queue.push(c.id);
  }
  for (const fid of allFolderIds) {
    await run('UPDATE folders SET deleted_at = ? WHERE id = ?', [now, fid]);
    await run('UPDATE knowledge_files SET deleted_at = ? WHERE folder_id = ?', [now, fid]);
  }
}

/** 回收站列表：所有 deleted_at IS NOT NULL 的文件与文件夹 */
export async function listTrash(): Promise<{
  files: Array<{ id: number; file_name: string; deleted_at: number; md_path: string; folder_id: number | null }>;
  folders: Array<{ id: number; name: string; deleted_at: number; parent_id: number | null }>;
}> {
  const files = await all<{ id: number; file_name: string; deleted_at: number; md_path: string; folder_id: number | null }>(
    'SELECT id, file_name, deleted_at, md_path, folder_id FROM knowledge_files WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
  );
  const folders = await all<{ id: number; name: string; deleted_at: number; parent_id: number | null }>(
    'SELECT id, name, deleted_at, parent_id FROM folders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
  );
  return { files, folders };
}

/** 恢复文件：清 deleted_at；若原父文件夹已被软删则置根 */
export async function restoreFile(id: number): Promise<void> {
  const row = await get<{ folder_id: number | null }>('SELECT folder_id FROM knowledge_files WHERE id = ?', [id]);
  if (row?.folder_id != null) {
    const parent = await get<{ deleted_at: number | null }>('SELECT deleted_at FROM folders WHERE id = ?', [row.folder_id]);
    if (parent && parent.deleted_at != null) {
      await run('UPDATE knowledge_files SET folder_id = NULL WHERE id = ?', [id]);
    }
  }
  await run('UPDATE knowledge_files SET deleted_at = NULL WHERE id = ?', [id]);
}

/** 恢复文件夹：清 deleted_at；递归恢复其子文件夹与文档；父链若在回收站则一并恢复 */
export async function restoreFolderCascade(id: number): Promise<void> {
  // 先沿父链向上恢复祖先
  let cur: number | null = id;
  while (cur != null) {
    await run('UPDATE folders SET deleted_at = NULL WHERE id = ?', [cur]);
    const parent = await get<{ parent_id: number | null; deleted_at: number | null }>(
      'SELECT parent_id, deleted_at FROM folders WHERE id = ?', [cur]
    );
    cur = parent?.parent_id ?? null;
  }
  // 递归向下恢复子文件夹与文档（含自身目录下的文件）
  const queue: number[] = [id];
  while (queue.length) {
    const fid = queue.shift()!;
    await run('UPDATE knowledge_files SET deleted_at = NULL WHERE folder_id = ?', [fid]);
    const children = await all<{ id: number }>('SELECT id FROM folders WHERE parent_id = ?', [fid]);
    for (const c of children) {
      await run('UPDATE folders SET deleted_at = NULL WHERE id = ?', [c.id]);
      queue.push(c.id);
    }
  }
}

/** 物理删除文件（连同 DB 行；调用方负责动物理文件） */
export async function purgeFileRow(id: number): Promise<void> {
  await run('DELETE FROM knowledge_files WHERE id = ?', [id]);
}

/** 物理删除文件夹行（调用方负责级联清理子项） */
export async function purgeFolderRow(id: number): Promise<void> {
  await run('DELETE FROM folders WHERE id = ?', [id]);
}

/** 清空回收站：返回所有待物理删除的文件行（调用方动物理文件） */
export async function listTrashFiles(): Promise<Array<{ id: number; md_path: string; zip_archive_path: string }>> {
  return all<{ id: number; md_path: string; zip_archive_path: string }>(
    'SELECT id, md_path, zip_archive_path FROM knowledge_files WHERE deleted_at IS NOT NULL'
  );
}

export async function listTrashFolderIds(): Promise<number[]> {
  const rows = await all<{ id: number }>('SELECT id FROM folders WHERE deleted_at IS NOT NULL');
  return rows.map((r) => r.id);
}
