import { describe, it, expect } from 'vitest';
import { embedText, cosineSimilarity } from '../embedding';

// 未调用 initEmbedding 时 settings=null，provider 默认 'fallback' 哈希向量
const DIM_BYTES = 256 * 4; // embedDim=256, Float32Array

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
