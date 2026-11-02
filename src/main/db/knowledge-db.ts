import { all, get, lastInsertId, run } from './sqlite-init';
import type { KnowledgeFile, FileType } from '../types';

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
