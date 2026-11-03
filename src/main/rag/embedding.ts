/**
 * 文本向量化模块（多 provider）。
 *
 * 支持三种 provider：
 * - local:  本地 ONNX 模型目录（@xenova/transformers）
 * - openai: OpenAI 兼容 embedding API（vLLM / Ollama / 任何 OpenAI 兼容服务）
 * - fallback: 字符 n-gram 哈希向量（离线降级，默认）
 *
 * provider 由 settings.embeddingProvider 决定，运行时按需加载。
 */
import { createHash } from 'crypto';
import type { PluginSettings } from '../types';

let settings: PluginSettings | null = null;
let localEmbedder: any = null;   // @xenova/transformers pipeline 实例
const embedDim = 256;

/** 初始化 embedding 模块（在宿主插件 apply 时调用一次）。 */
export async function initEmbedding(s: PluginSettings): Promise<void> {
  settings = s;
  if (s.embeddingProvider === 'local' && s.embeddingModelPath) {
    try {
      // 动态 import，避免 fallback 模式下引入 transformers 依赖
      const { pipeline } = await import('@xenova/transformers');
      localEmbedder = await pipeline(
        'feature-extraction',
        s.embeddingModelPath,
        { quantized: true }
      );
      console.log('[dsh-wiki-rag] local embedding model loaded:', s.embeddingModelPath);
    } catch (e) {
      console.warn('[dsh-wiki-rag] local embedding failed, fallback to hash:', e);
      localEmbedder = null;
    }
  }
}

/** 文本向量化（统一入口）。 */
export async function embedText(text: string): Promise<Buffer> {
  const provider = settings?.embeddingProvider ?? 'fallback';

  // 1. OpenAI 兼容 API
  if (provider === 'openai' && settings?.embeddingOpenAIAPIKey) {
    return embedOpenAI(text);
  }

  // 2. 本地 ONNX 模型
  if (provider === 'local' && localEmbedder) {
    return embedLocal(text);
  }

  // 3. 降级：哈希向量
  return embedHash(text, embedDim);
}

// ---------- OpenAI 兼容 embedding ----------
async function embedOpenAI(text: string): Promise<Buffer> {
  const baseURL = settings!.embeddingOpenAIBaseURL.replace(/\/+$/, '');
  const resp = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings!.embeddingOpenAIAPIKey}`,
    },
    body: JSON.stringify({
      model: settings!.embeddingOpenAIModel,
      input: text,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI embedding failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as { data: Array<{ embedding: number[] }> };
  const vec = data.data[0].embedding;
  return Buffer.from(new Float32Array(vec).buffer);
}

// ---------- 本地 ONNX embedding ----------
async function embedLocal(text: string): Promise<Buffer> {
  const output = await localEmbedder(text, { pooling: 'mean', normalize: true });
  const arr = output.data as Float32Array;
  return Buffer.from(arr.buffer);
}

// ---------- 降级：哈希向量 ----------
function embedHash(text: string, dim: number): Buffer {
  const vector = new Float32Array(dim);
  const grams = ngrams(text, 3);
  for (const g of grams) {
    const h = createHash('sha256').update(g).digest();
    for (let i = 0; i < 8; i++) {
      const idx = h[i] % dim;
      vector[idx] += 1;
    }
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vector[i] /= norm;
  }
  return Buffer.from(vector.buffer);
}

function ngrams(text: string, n: number): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/\s+/g, ' ').toLowerCase();
  if (cleaned.length < n) return cleaned ? [cleaned] : [];
  for (let i = 0; i <= cleaned.length - n; i++) out.push(cleaned.slice(i, i + n));
  return out;
}

/** 计算两个向量夹角的余弦相似度。 */
export function cosineSimilarity(a: Buffer, b: Buffer): number {
  const va = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const vb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  if (va.length !== vb.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i++) {
    dot += va[i] * vb[i];
    na += va[i] * va[i];
    nb += vb[i] * vb[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
