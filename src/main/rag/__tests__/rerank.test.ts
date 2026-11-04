import { describe, it, expect, vi, afterEach } from 'vitest';
import { rerank, initRerank } from '../rerank';
import type { PluginSettings, RagSearchResult } from '../../types';

afterEach(() => {
  vi.unstubAllGlobals();
  // 重置为 none
  initRerank({ rerankProvider: 'none' } as PluginSettings);
});

function makeResults(n: number): RagSearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    file_id: i + 1,
    file_name: `doc${i}.md`,
    source_path: `/src/doc${i}.md`,
    chunk_text: `chunk text ${i}`,
    score: 0.5 - i * 0.1,
    md_path: `/kb/doc${i}.md`,
    chunk_id: i + 1,
    chunk_index: 0,
  }));
}

describe('rerank openai 降级路径', () => {
  it('响应缺 results 字段时降级为原结果（不抛错）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      async json() { return {}; }, // 缺 results
    })));
    await initRerank({
      rerankProvider: 'openai',
      rerankOpenAIBaseURL: 'https://api.example.com/v1',
      rerankOpenAIAPIKey: 'k',
      rerankOpenAIModel: 'rerank-m',
      rerankTopK: 3,
    } as PluginSettings);
    const input = makeResults(5);
    const out = await rerank('query', input);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0].file_name).toBe('doc0.md');
  });

  it('响应 results 全越界时降级为原结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      async json() { return { results: [{ index: 999, relevance_score: 0.9 }] }; },
    })));
    await initRerank({
      rerankProvider: 'openai',
      rerankOpenAIBaseURL: 'https://api.example.com/v1',
      rerankOpenAIAPIKey: 'k',
      rerankOpenAIModel: 'rerank-m',
      rerankTopK: 2,
    } as PluginSettings);
    const input = makeResults(3);
    const out = await rerank('q', input);
    expect(out.length).toBe(2);
  });

  it('provider=none 时直接截断不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await initRerank({ rerankProvider: 'none' } as PluginSettings);
    const input = makeResults(5);
    const out = await rerank('q', input);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
