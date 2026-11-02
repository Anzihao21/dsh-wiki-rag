import { getAllChunks, getChunkOrdinal } from '../db/vector-db';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { embedText, cosineSimilarity } from './embedding';
import { rerank } from './rerank';
import { writeLog } from '../db/log-db';
import type { RagSearchResult } from '../types';

/**
 * Agent 调用检索接口：向量相似度 + 关键词加权 混合检索 → 重排（可选）。
 *
 * 流程：
 * 1. 向量 + 关键词混合检索，取 topK * 3 候选
 * 2. 若配置了 rerank provider，用 rerank 模型重排候选，取 topK
 * 3. 否则直接返回 topK 个候选
 *
 * @param query 检索词
 * @param topK 返回条数
 * @param keywordWeight 关键词匹配权重（0~1），默认 0.3
 */
export async function ragSearch(
  query: string,
  topK = 5,
  keywordWeight = 0.3
): Promise<RagSearchResult[]> {
  const qVec = await embedText(query);
  const chunks = await getAllChunks();
  if (chunks.length === 0) {
    return [];
  }

  // 先取更多候选供 rerank 用
  const candidateCount = Math.max(topK * 3, 10);

  const kw = query.split(/\s+/).filter((w) => w.length > 0);
  const scored: Array<{ fileId: number; chunkId: number; text: string; score: number }> = [];
  for (const c of chunks) {
    const vecScore = cosineSimilarity(qVec, c.vector_blob);
    const kwScore = kw.length
      ? kw.filter((w) => c.chunk_text.toLowerCase().includes(w.toLowerCase())).length / kw.length
      : 0;
    const score = (1 - keywordWeight) * vecScore + keywordWeight * kwScore;
    scored.push({ fileId: c.file_id, chunkId: c.id, text: c.chunk_text, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, candidateCount);

  // 组装候选结果
  let results: RagSearchResult[] = [];
  for (const s of candidates) {
    const file = await getKnowledgeFileById(s.fileId);
    results.push({
      file_id: s.fileId,
      file_name: file?.file_name ?? '(已删除)',
      source_path: file?.source_path ?? '',
      chunk_text: s.text,
      score: s.score,
      md_path: file?.md_path ?? '',
      chunk_id: s.chunkId,
      chunk_index: await getChunkOrdinal(s.fileId, s.chunkId)
    });
  }

  // 重排阶段（若配置了 rerank provider）
  results = await rerank(query, results);

  // 最终截取 topK
  results = results.slice(0, topK);

  await writeLog('rag-search', `query="${query}" hits=${results.length}`);
  return results;
}
