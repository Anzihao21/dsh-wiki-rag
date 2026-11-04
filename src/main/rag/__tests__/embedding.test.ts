import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedText, cosineSimilarity, initEmbedding } from '../embedding';
import type { PluginSettings } from '../../types';

// 未调用 initEmbedding 时 settings=null，provider 默认 'fallback' 哈希向量
const DIM_BYTES = 256 * 4; // embedDim=256, Float32Array

afterEach(() => {
  vi.unstubAllGlobals();
  // 重置回 fallback，避免污染其它用例
  initEmbedding({ embeddingProvider: 'fallback' } as PluginSettings);
});

describe('embedding fallback 哈希向量', () => {
  it('同一文本两次嵌入结果字节完全一致（确定性）', async () => {
    const a = await embedText('DeepSeek Harness 知识库 RAG');
    const b = await embedText('DeepSeek Harness 知识库 RAG');
    expect(a.equals(b)).toBe(true);
  });

  it('输出 Buffer 维度稳定为 256 维 float32', async () => {
    const v = await embedText('任意一段文本');
    expect(v.length).toBe(DIM_BYTES);
  });

  it('向量已 L2 归一化（模长 ≈ 1）', async () => {
    const v = await embedText('normalized vector check');
    const f32 = new Float32Array(v.buffer, v.byteOffset, v.length / 4);
    let norm = 0;
    for (const x of f32) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 4);
  });

  it('相同文本余弦相似度为 1，不同文本小于 1', async () => {
    const a = await embedText('如何配置 dsh-wiki-rag 的切片大小');
    const b = await embedText('如何配置 dsh-wiki-rag 的切片大小');
    const c = await embedText('今天天气真好适合出门散步');
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
    expect(cosineSimilarity(a, c)).toBeLessThan(0.999);
    expect(cosineSimilarity(a, c)).toBeGreaterThan(0);
  });

  it('空文本产出零向量 Buffer', async () => {
    const v = await embedText('');
    expect(v.length).toBe(DIM_BYTES);
    // 零向量自相似按代码定义返回 0
    expect(cosineSimilarity(v, v)).toBe(0);
  });
});

describe('embedding openai provider 校验', () => {
  const baseCfg: PluginSettings = {
    embeddingProvider: 'openai',
    embeddingOpenAIBaseURL: 'https://api.example.com/v1/',
    embeddingOpenAIAPIKey: 'sk-test',
    embeddingOpenAIModel: 'text-embedding-test',
  } as PluginSettings;

  it('缺 baseURL 抛清晰错误，不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await initEmbedding({ ...baseCfg, embeddingOpenAIBaseURL: '' });
    await expect(embedText('hello')).rejects.toThrow(/embeddingOpenAIBaseURL/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('缺 model 抛清晰错误，不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await initEmbedding({ ...baseCfg, embeddingOpenAIModel: '   ' });
    await expect(embedText('hello')).rejects.toThrow(/embeddingOpenAIModel/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('缺 API Key 抛清晰错误，不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await initEmbedding({ ...baseCfg, embeddingOpenAIAPIKey: '' });
    await expect(embedText('hello')).rejects.toThrow(/embeddingOpenAIAPIKey/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('baseURL 尾部斜杠归一后拼出正确 URL，POST 体含 model/input', async () => {
    let captured: { url: string; opts: any } | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: any) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [{ embedding: new Array(8).fill(0.1) }] };
        },
      } as any;
    }));
    await initEmbedding({ ...baseCfg, embeddingOpenAIBaseURL: 'https://api.example.com/v1///' });
    await embedText('你好');
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://api.example.com/v1/embeddings');
    expect(captured!.opts.method).toBe('POST');
    const body = JSON.parse(captured!.opts.body);
    expect(body.model).toBe('text-embedding-test');
    expect(body.input).toBe('你好');
    expect(captured!.opts.headers.Authorization).toBe('Bearer sk-test');
  });

  it('网络错误时错误信息包含 [embedding/openai] provider 标记', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    await initEmbedding(baseCfg);
    await expect(embedText('x')).rejects.toThrow(/\[embedding\/openai\]/);
  });
});

describe('fallback LRU memo', () => {
  it('重复文本第二次命中缓存（hits 增加）', async () => {
    const { clearFallbackCache, fallbackCacheStats } = await import('../embedding');
    clearFallbackCache();
    await embedText('lru test text alpha');
    expect(fallbackCacheStats().misses).toBe(1);
    expect(fallbackCacheStats().hits).toBe(0);
    await embedText('lru test text alpha');
    expect(fallbackCacheStats().hits).toBe(1);
    // 命中返回相同 Buffer
    const a = await embedText('lru test text alpha');
    const b = await embedText('lru test text alpha');
    expect(a.equals(b)).toBe(true);
  });

  it('LRU 淘汰：超过上限后最久未用被逐出', async () => {
    const { clearFallbackCache, fallbackCacheStats } = await import('../embedding');
    clearFallbackCache();
    for (let i = 0; i < 2005; i++) {
      await embedText(`unique text number ${i}`);
    }
    // 缓存 size 不超过上限+少量
    expect(fallbackCacheStats().size).toBeLessThanOrEqual(2000);
    expect(fallbackCacheStats().size).toBeGreaterThan(1900);
  });
});
