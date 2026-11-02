import { describe, it, expect } from 'vitest';
import { normalizeSearchInput } from '../rag-search';

describe('normalizeSearchInput 入参归一化', () => {
  it('空串 / 纯空白返回 null', () => {
    expect(normalizeSearchInput('', 5)).toBeNull();
    expect(normalizeSearchInput('   ', 5)).toBeNull();
    expect(normalizeSearchInput(null, 5)).toBeNull();
    expect(normalizeSearchInput(undefined, 5)).toBeNull();
    expect(normalizeSearchInput(123 as any, 5)).toBeNull();
  });

  it('正常 query + 默认 topK', () => {
    const r = normalizeSearchInput('向量检索', undefined);
    expect(r).toEqual({ query: '向量检索', topK: 5 });
  });

  it('topK 越界 clamp 到 [1, 50]', () => {
    expect(normalizeSearchInput('q', 0)!.topK).toBe(1);
    expect(normalizeSearchInput('q', -100)!.topK).toBe(1);
    expect(normalizeSearchInput('q', 9999)!.topK).toBe(50);
    expect(normalizeSearchInput('q', 20)!.topK).toBe(20);
  });

  it('topK 非数字 / NaN 时回退 5', () => {
    expect(normalizeSearchInput('q', 'abc' as any)!.topK).toBe(5);
    expect(normalizeSearchInput('q', NaN)!.topK).toBe(5);
  });

  it('query 超长截断到 4000', () => {
    const long = 'a'.repeat(10000);
    const r = normalizeSearchInput(long, 5)!;
    expect(r.query.length).toBe(4000);
  });

  it('query 首尾空白被 trim', () => {
    expect(normalizeSearchInput('  hello  ', 5)!.query).toBe('hello');
  });
});
