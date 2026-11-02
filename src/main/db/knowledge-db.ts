import { all, get, lastInsertId, run } from './sqlite-init';
import type { KnowledgeFile, KnowledgeFolder, FileType } from '../types';

/** 新增知识文件记录，返回自增 id */
export async function insertKnowledgeFile(record: Omit<KnowledgeFile, 'id'>): Promise<number> {
  await run(
    `INSERT INTO knowledge_files
     (file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.file_name,
      record.source_path,
      record.md_path,
      record.zip_archive_path,
      record.file_type,
      record.create_time,
      record.last_sync_time
    ]
  );
  return lastInsertId();
}

/** 按 id 查询 */
export async function getKnowledgeFileById(id: number): Promise<KnowledgeFile | undefined> {
  return get<KnowledgeFile>('SELECT * FROM knowledge_files WHERE id = ?', [id]);
}

/** 查询全部知识文件 */
export async function listKnowledgeFiles(): Promise<KnowledgeFile[]> {
  return all<KnowledgeFile>('SELECT * FROM knowledge_files ORDER BY create_time DESC');
}

/** 按 source_path 精确查找（用于重复导入去重） */
export async function findKnowledgeFileBySourcePath(
  sourcePath: string
): Promise<KnowledgeFile | undefined> {
  return get<KnowledgeFile>('SELECT * FROM knowledge_files WHERE source_path = ?', [sourcePath]);
}

/** 查询某目录下已存在的文件名列表（用于同名重命名判定） */
export async function listFileNamesByPath(mdDir: string): Promise<string[]> {
  const rows = await all<{ file_name: string }>(
    'SELECT file_name FROM knowledge_files WHERE md_path LIKE ?',
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

/** 按文件类型统计 */
export async function countByType(): Promise<Record<string, number>> {
  const rows = await all<{ file_type: FileType; cnt: number }>(
    'SELECT file_type, COUNT(*) AS cnt FROM knowledge_files GROUP BY file_type'
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

/** 按文件夹过滤文档（folderId 为 null 表示根目录） */
export async function listKnowledgeFilesByFolder(folderId: number | null): Promise<KnowledgeFile[]> {
  if (folderId === null) {
    return all<KnowledgeFile>(
      'SELECT * FROM knowledge_files WHERE folder_id IS NULL ORDER BY create_time DESC'
    );
  }
  return all<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE folder_id = ? ORDER BY create_time DESC',
    [folderId]
  );
}

// ---------- 文件夹 ----------

/** 列出全部文件夹 */
export async function listFolders(): Promise<KnowledgeFolder[]> {
  return all<KnowledgeFolder>('SELECT * FROM folders ORDER BY parent_id, id');
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
