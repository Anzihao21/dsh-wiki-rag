import { getChunksForSearch, getChunkOrdinal } from '../db/vector-db';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { embedText, cosineSimilarity } from './embedding';
import { rerank } from './rerank';
import { writeLog } from '../db/log-db';
import type { RagSearchResult } from '../types';

/** 单次检索 query 最大字符数（超出截断，避免 n-gram / 远端 API 被打爆） */
const MAX_QUERY_LEN = 4000;
/** topK 上下限 */
const MIN_TOPK = 1;
const MAX_TOPK = 50;

/**
 * 归一化检索入参：
 * - 空串 / 纯空白 → 视为无 query，返回空数组（不进 embedding）
 * - topK 越界 → clamp 到 [1, 50]
 * - query 超长 → 截断到 MAX_QUERY_LEN
 */
export function normalizeSearchInput(
  query: unknown,
  topK: unknown
): { query: string; topK: number } | null {
  if (typeof query !== 'string') return null;
  const trimmed = query.trim().slice(0, MAX_QUERY_LEN);
  if (!trimmed) return null;
  let k = typeof topK === 'number' && Number.isFinite(topK) ? Math.floor(topK) : 5;
  if (Number.isNaN(k)) k = 5;
  k = Math.max(MIN_TOPK, Math.min(MAX_TOPK, k));
  return { query: trimmed, topK: k };
}

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
  const norm = normalizeSearchInput(query, topK);
  if (!norm) {
    await writeLog('rag-search-empty', `query=${JSON.stringify(query)}`);
    return [];
  }
  query = norm.query;
  topK = norm.topK;
  // keywordWeight 越界兜底
  if (!Number.isFinite(keywordWeight) || keywordWeight < 0 || keywordWeight > 1) {
    keywordWeight = 0.3;
  }

  const qVec = await embedText(query);
  // 关键词预过滤：SQL 层 LIKE 命中候选池（上限 1000），避免全表数万 chunk 做向量打分
  const kw = query.split(/\s+/).filter((w) => w.length > 0);
  const chunks = await getChunksForSearch(kw, 1000);
  if (chunks.length === 0) {
    return [];
  }

  // 先取更多候选供 rerank 用
  const candidateCount = Math.max(topK * 3, 10);

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
