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

/**
 * 检索候选池预过滤：
 * - 小库（chunk 数 < SMALL_DB_THRESHOLD）直接全表返回，避免预过滤误伤向量兜底
 * - 大库时传入关键词集合，用 chunk_text LIKE '%kw%' 做 OR 命中预过滤
 * - 命中行作为候选池（maxCandidates 截断），避免对全表数万 chunk 做向量打分
 * - 若关键词命中为 0（纯语义查询），退化为按 rowid 取最近 maxCandidates 条
 */
export async function getChunksForSearch(
  keywords: string[],
  maxCandidates = 1000
): Promise<VectorChunk[]> {
  const SMALL_DB_THRESHOLD = 200;
  const total = await countChunks();
  // 小库全表分支：过滤软删文件
  if (total <= SMALL_DB_THRESHOLD) {
    return all<VectorChunk>(
      `SELECT vc.* FROM vector_chunks vc
       JOIN knowledge_files kf ON kf.id = vc.file_id
       WHERE kf.deleted_at IS NULL`
    );
  }

  const safeKw = (keywords || []).filter((k) => typeof k === 'string' && k.length > 0);
  if (safeKw.length === 0) {
    return all<VectorChunk>(
      `SELECT vc.* FROM vector_chunks vc
       JOIN knowledge_files kf ON kf.id = vc.file_id
       WHERE kf.deleted_at IS NULL
       ORDER BY vc.id DESC LIMIT ?`,
      [maxCandidates]
    );
  }
  // FTS5 trigram 预过滤（≥3 字符走 MATCH，短词退回 LIKE 子串）；两路都 JOIN knowledge_files 过滤软删
  const longKw = safeKw.filter((k) => k.length >= 3);
  const shortKw = safeKw.filter((k) => k.length < 3);
  let rows: VectorChunk[] = [];
  if (longKw.length > 0) {
    const matchExpr = longKw.map((k) => `"${k.replace(/"/g, '""')}"`).join(' OR ');
    try {
      rows = await all<VectorChunk>(
        `SELECT vc.* FROM vector_chunks vc
         JOIN chunks_fts ON chunks_fts.rowid = vc.id
         JOIN knowledge_files kf ON kf.id = vc.file_id
         WHERE chunks_fts MATCH ? AND kf.deleted_at IS NULL
         LIMIT ?`,
        [matchExpr, maxCandidates]
      );
    } catch {
      rows = [];
    }
  }
  if (rows.length === 0 && shortKw.length > 0) {
    const clauses = shortKw.map(() => 'vc.chunk_text LIKE ?').join(' OR ');
    const params = shortKw.map((k) => `%${k}%`);
    rows = await all<VectorChunk>(
      `SELECT vc.* FROM vector_chunks vc
       JOIN knowledge_files kf ON kf.id = vc.file_id
       WHERE (${clauses}) AND kf.deleted_at IS NULL
       LIMIT ?`,
      [...params, maxCandidates]
    );
  }
  if (rows.length > 0) return rows;
  // 关键词零命中：纯语义查询，退化为最近 N 条（过滤软删）
  return all<VectorChunk>(
    `SELECT vc.* FROM vector_chunks vc
     JOIN knowledge_files kf ON kf.id = vc.file_id
     WHERE kf.deleted_at IS NULL
     ORDER BY vc.id DESC LIMIT ?`,
    [maxCandidates]
  );
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
