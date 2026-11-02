import { getAllChunks } from '../db/vector-db';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { embedText, cosineSimilarity } from './embedding';
import { writeLog } from '../db/log-db';
import type { RagSearchResult } from '../types';

/**
 * Agent 调用检索接口：向量相似度检索知识库。
 * 返回原文片段 + 文档名称、来源路径。
 */
export async function ragSearch(query: string, topK = 5): Promise<RagSearchResult[]> {
  const qVec = embedText(query);
  const chunks = await getAllChunks();
  if (chunks.length === 0) {
    return [];
  }

  const scored: Array<{ fileId: number; text: string; score: number }> = [];
  for (const c of chunks) {
    const score = cosineSimilarity(qVec, c.vector_blob);
    scored.push({ fileId: c.file_id, text: c.chunk_text, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, topK));

  const results: RagSearchResult[] = [];
  for (const s of top) {
    const file = await getKnowledgeFileById(s.fileId);
    results.push({
      file_id: s.fileId,
      file_name: file?.file_name ?? '(已删除)',
      source_path: file?.source_path ?? '',
      chunk_text: s.text,
      score: s.score
    });
  }

  await writeLog('rag-search', `query="${query}" hits=${results.length}`);
  return results;
}
