import { describe, it, expect } from 'vitest';
import { validateSettingsPatch } from '../settings-validation';

describe('validateSettingsPatch chunking', () => {
  it('合法 chunkSize 通过', () => {
    expect(validateSettingsPatch({ chunkSize: 800 })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkSize: 1 })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkSize: 20000 })).toEqual({ ok: true });
  });
  it('chunkSize 越界或非数字被拒', () => {
    expect(validateSettingsPatch({ chunkSize: 0 }).ok).toBe(false);
    expect(validateSettingsPatch({ chunkSize: 20001 }).ok).toBe(false);
    expect(validateSettingsPatch({ chunkSize: '800' }).ok).toBe(false);
    expect(validateSettingsPatch({ chunkSize: NaN }).ok).toBe(false);
  });
  it('chunkOverlap 合法通过，越界被拒', () => {
    expect(validateSettingsPatch({ chunkOverlap: 120 })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkOverlap: 0 })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkOverlap: 5000 })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkOverlap: -1 }).ok).toBe(false);
    expect(validateSettingsPatch({ chunkOverlap: 5001 }).ok).toBe(false);
  });
  it('chunkMode 仅 fixed|heading', () => {
    expect(validateSettingsPatch({ chunkMode: 'fixed' })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkMode: 'heading' })).toEqual({ ok: true });
    expect(validateSettingsPatch({ chunkMode: 'foo' }).ok).toBe(false);
  });
});

describe('validateSettingsPatch embedding', () => {
  it('openai 缺 BaseURL/Key/Model 任一都被拒', () => {
    const base = { embeddingProvider: 'openai' };
    expect(validateSettingsPatch({ ...base }).ok).toBe(false);
    expect(validateSettingsPatch({ ...base, embeddingOpenAIBaseURL: 'x' }).ok).toBe(false);
    expect(validateSettingsPatch({
      ...base, embeddingOpenAIBaseURL: 'x', embeddingOpenAIAPIKey: 'k',
    }).ok).toBe(false);
    expect(validateSettingsPatch({
      ...base, embeddingOpenAIBaseURL: 'x', embeddingOpenAIAPIKey: 'k', embeddingOpenAIModel: 'm',
    })).toEqual({ ok: true });
  });
  it('openai 空字符串视为缺失', () => {
    expect(validateSettingsPatch({
      embeddingProvider: 'openai',
      embeddingOpenAIBaseURL: '   ',
      embeddingOpenAIAPIKey: 'k',
      embeddingOpenAIModel: 'm',
    }).ok).toBe(false);
  });
  it('local 缺 embeddingModelPath 被拒', () => {
    expect(validateSettingsPatch({ embeddingProvider: 'local' }).ok).toBe(false);
    expect(validateSettingsPatch({
      embeddingProvider: 'local', embeddingModelPath: '/path/to/model',
    })).toEqual({ ok: true });
  });
  it('fallback 不需要配套字段', () => {
    expect(validateSettingsPatch({ embeddingProvider: 'fallback' })).toEqual({ ok: true });
  });
  it('非法 provider 被拒', () => {
    expect(validateSettingsPatch({ embeddingProvider: 'cohere' }).ok).toBe(false);
  });
});

describe('validateSettingsPatch rerank', () => {
  it('openai 三件套缺一不可', () => {
    expect(validateSettingsPatch({ rerankProvider: 'openai' }).ok).toBe(false);
    expect(validateSettingsPatch({
      rerankProvider: 'openai', rerankOpenAIBaseURL: 'b', rerankOpenAIAPIKey: 'k',
    }).ok).toBe(false);
    expect(validateSettingsPatch({
      rerankProvider: 'openai', rerankOpenAIBaseURL: 'b', rerankOpenAIAPIKey: 'k', rerankOpenAIModel: 'm',
    })).toEqual({ ok: true });
  });
  it('local 缺 rerankModelPath 被拒', () => {
    expect(validateSettingsPatch({ rerankProvider: 'local' }).ok).toBe(false);
    expect(validateSettingsPatch({
      rerankProvider: 'local', rerankModelPath: '/path',
    })).toEqual({ ok: true });
  });
  it('none 不需要配套字段', () => {
    expect(validateSettingsPatch({ rerankProvider: 'none' })).toEqual({ ok: true });
  });
});

describe('validateSettingsPatch 组合与空 patch', () => {
  it('空 patch 通过', () => {
    expect(validateSettingsPatch({})).toEqual({ ok: true });
  });
  it('错误信息为中文友好描述', () => {
    const r = validateSettingsPatch({ embeddingProvider: 'openai' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/BaseURL/);
  });
  it('多字段同时合法一次性通过', () => {
    expect(validateSettingsPatch({
      chunkSize: 1000, chunkOverlap: 100, chunkMode: 'heading',
      embeddingProvider: 'fallback', rerankProvider: 'none',
    })).toEqual({ ok: true });
  });
});
