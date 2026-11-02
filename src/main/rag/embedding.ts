import { createHash } from 'crypto';

/**
 * 文本向量化模块。
 * 真实环境中对接 DSH 宿主的 embedding 模型；
 * 这里提供确定性降级方案（基于字符 n-gram 的哈希向量），
 * 保证离线可用、可复算、可测试。
 */
export function embedText(text: string, dim = 256): Buffer {
  const vector = new Float32Array(dim);
  const grams = ngrams(text, 3);

  for (const g of grams) {
    const h = createHash('sha256').update(g).digest();
    // 取前 8 字节映射到 dim 维
    for (let i = 0; i < 8; i++) {
      const idx = h[i] % dim;
      vector[idx] += 1;
    }
  }

  // L2 归一化
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] /= norm;
    }
  }

  return Buffer.from(vector.buffer);
}

function ngrams(text: string, n: number): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/\s+/g, ' ').toLowerCase();
  if (cleaned.length < n) {
    return cleaned ? [cleaned] : [];
  }
  for (let i = 0; i <= cleaned.length - n; i++) {
    out.push(cleaned.slice(i, i + n));
  }
  return out;
}

/** 计算两个向量夹角的余弦相似度 */
export function cosineSimilarity(a: Buffer, b: Buffer): number {
  const va = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const vb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  if (va.length !== vb.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < va.length; i++) {
    dot += va[i] * vb[i];
    na += va[i] * va[i];
    nb += vb[i] * vb[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
