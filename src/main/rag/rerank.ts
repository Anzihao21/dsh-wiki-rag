/**
 * 重排模型模块（多 provider）。
 *
 * 支持三种 provider：
 * - local:  本地 ONNX cross-encoder 模型目录（@xenova/transformers）
 * - openai: OpenAI 兼容 rerank API（Cohere / Jina / vLLM rerank endpoint）
 * - none:   不重排（默认，直接返回向量检索结果）
 *
 * provider 由 settings.rerankProvider 决定。
 */
import type { PluginSettings } from '../types';
import type { RagSearchResult } from '../types';

let settings: PluginSettings | null = null;
let localReranker: any = null;

/** 初始化 rerank 模块（在宿主插件 apply 时调用一次）。 */
export async function initRerank(s: PluginSettings): Promise<void> {
  settings = s;
  if (s.rerankProvider === 'local' && s.rerankModelPath) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      localReranker = await pipeline(
        'text-classification',
        s.rerankModelPath,
        { quantized: true }
      );
      console.log('[dsh-wiki-rag] local rerank model loaded:', s.rerankModelPath);
    } catch (e) {
      console.warn('[dsh-wiki-rag] local rerank failed, disabled:', e);
      localReranker = null;
    }
  }
}

/**
 * 对检索结果做重排。
 * @param query 原始查询
 * @param results 向量检索返回的候选结果
 * @returns 重排后的结果（按相关性降序，取 topK）
 */
export async function rerank(
  query: string,
  results: RagSearchResult[]
): Promise<RagSearchResult[]> {
  const provider = settings?.rerankProvider ?? 'none';
  if (provider === 'none' || results.length === 0) {
    return results.slice(0, settings?.rerankTopK ?? 5);
  }

  // 1. OpenAI 兼容 rerank API
  if (provider === 'openai' && settings?.rerankOpenAIAPIKey) {
    return rerankOpenAI(query, results);
  }

  // 2. 本地 cross-encoder
  if (provider === 'local' && localReranker) {
    return rerankLocal(query, results);
  }

  // 3. 不可用则直接返回原结果
  return results.slice(0, settings?.rerankTopK ?? 5);
}

// ---------- OpenAI 兼容 rerank ----------
async function rerankOpenAI(
  query: string,
  results: RagSearchResult[]
): Promise<RagSearchResult[]> {
  const s = settings!;
  const baseURL = (s.rerankOpenAIBaseURL || '').trim().replace(/\/+$/, '');
  const model = (s.rerankOpenAIModel || '').trim();
  const apiKey = (s.rerankOpenAIAPIKey || '').trim();

  if (!baseURL) {
    throw new Error('rerankProvider=openai 但 rerankOpenAIBaseURL 为空');
  }
  if (!model) {
    throw new Error('rerankProvider=openai 但 rerankOpenAIModel 为空');
  }
  if (!apiKey) {
    throw new Error('rerankProvider=openai 但 rerankOpenAIAPIKey 为空');
  }

  const documents = results.map((r) => r.chunk_text);
  const url = `${baseURL}/rerank`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, query, documents, top_n: s.rerankTopK }),
    });
  } catch (e) {
    // 网络错误降级为原结果，但在日志中带 provider 名
    console.warn(`[rerank/openai] 网络请求失败 ${url}: ${(e as Error).message}`);
    return results.slice(0, s.rerankTopK);
  }

  if (!resp.ok) {
    console.warn(`[rerank/openai] ${url} 返回 ${resp.status}，降级为原结果`);
    return results.slice(0, s.rerankTopK);
  }

  const data = await resp.json() as {
    results: Array<{ index: number; relevance_score: number }>;
  };

  // 按 rerank 结果重排
  const reranked: RagSearchResult[] = [];
  for (const r of data.results) {
    const original = results[r.index];
    if (original) {
      reranked.push({ ...original, score: r.relevance_score });
    }
  }
  return reranked;
}

// ---------- 本地 cross-encoder ----------
async function rerankLocal(
  query: string,
  results: RagSearchResult[]
): Promise<RagSearchResult[]> {
  const scored: Array<{ result: RagSearchResult; score: number }> = [];

  for (const r of results) {
    try {
      const output = await localReranker(
        `${query} [SEP] ${r.chunk_text}`,
        { topk: 1 }
      );
      // cross-encoder 输出 [ { label: 'LABEL_1', score: 0.95 } ]
      const score = output[0]?.score ?? 0;
      scored.push({ result: r, score });
    } catch (e) {
      scored.push({ result: r, score: r.score }); // 失败则保留原分
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored
    .slice(0, settings?.rerankTopK ?? 5)
    .map((s) => ({ ...s.result, score: s.score }));
}
