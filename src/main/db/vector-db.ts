import { all, get, run, runInTransaction } from './sqlite-init';
import type { VectorChunk } from '../types';

/** 写入向量切片；空文本 / 空向量直接跳过（不入库，避免污染相似度计算） */
export async function insertVectorChunk(
  fileId: number,
  chunkText: string,
  vector: Buffer
): Promise<void> {
  if (!chunkText || !chunkText.trim()) return;
  if (!vector || vector.length === 0) return;
  await run(
    'INSERT INTO vector_chunks (file_id, chunk_text, vector_blob) VALUES (?, ?, ?)',
    [fileId, chunkText, vector]
  );
}

/**
 * 在单个事务内「先删后插」批量替换某文件的全部向量切片。
 * 相比逐条 INSERT（每条一次提交），把 delete + 全部 insert 合成一个事务，
 * 大幅降低 WAL 提交与 fsync 开销，是导入/重建索引的主要性能优化。
 */
export async function replaceFileChunks(
  fileId: number,
  rows: Array<{ text: string; vector: Buffer }>
): Promise<void> {
  runInTransaction(() => {
    run('DELETE FROM vector_chunks WHERE file_id = ?', [fileId]);
    for (const r of rows) {
      if (!r.text || !r.text.trim()) continue;
      if (!r.vector || r.vector.length === 0) continue;
      run('INSERT INTO vector_chunks (file_id, chunk_text, vector_blob) VALUES (?, ?, ?)', [
        fileId,
        r.text,
        r.vector,
      ]);
    }
  });
}

/** 删除某文件全部向量切片 */
export async function deleteChunksByFileId(fileId: number): Promise<void> {
  await run('DELETE FROM vector_chunks WHERE file_id = ?', [fileId]);
}

/** 查询某文件全部切片 */
export async function getChunksByFileId(fileId: number): Promise<VectorChunk[]> {
  return all<VectorChunk>('SELECT * FROM vector_chunks WHERE file_id = ?', [fileId]);
}

/** 查询全部切片（用于全库检索） */
export async function getAllChunks(): Promise<VectorChunk[]> {
  return all<VectorChunk>('SELECT * FROM vector_chunks');
}

/** 获取切片总数 */
export async function countChunks(): Promise<number> {
  const row = await get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM vector_chunks');
  return row ? row.cnt : 0;
}

/**
 * 计算某切片在其所属文件内的 0-based 序号（按切片写入顺序，即 rowid 顺序）。
 * 用于检索溯源的 chunkIndex 字段。
 */
export async function getChunkOrdinal(fileId: number, chunkId: number): Promise<number> {
  const row = await get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM vector_chunks WHERE file_id = ? AND id < ?',
    [fileId, chunkId]
  );
  return row ? row.n : 0;
}
