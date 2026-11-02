import { getAllChunks } from '../db/vector-db';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { embedText, cosineSimilarity } from './embedding';
import { writeLog } from '../db/log-db';
import type { RagSearchResult } from '../types';

/**
 * Agent 调用检索接口：向量相似度 + 关键词加权 混合检索知识库。
 * 返回原文片段 + 文档名称、来源路径。
 * @param query 检索词
 * @param topK 返回条数
 * @param keywordWeight 关键词匹配权重（0~1），默认 0.3
 */
export async function ragSearch(
  query: string,
  topK = 5,
  keywordWeight = 0.3
): Promise<RagSearchResult[]> {
  const qVec = embedText(query);
  const chunks = await getAllChunks();
  if (chunks.length === 0) {
    return [];
  }

  const kw = query.split(/\s+/).filter((w) => w.length > 0);
  const scored: Array<{ fileId: number; text: string; score: number }> = [];
  for (const c of chunks) {
    const vecScore = cosineSimilarity(qVec, c.vector_blob);
    // 关键词命中率作为辅助信号，缓解纯向量检索的近似误差
    const kwScore = kw.length
      ? kw.filter((w) => c.chunk_text.toLowerCase().includes(w.toLowerCase())).length / kw.length
      : 0;
    const score = (1 - keywordWeight) * vecScore + keywordWeight * kwScore;
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
