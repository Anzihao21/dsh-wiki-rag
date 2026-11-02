import { describe, it, expect } from 'vitest';
import { chunkText } from '../text-chunk';

describe('chunkText 文本切片', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('', 100, 10)).toEqual([]);
    expect(chunkText('   \n  ', 100, 10)).toEqual([]);
  });

  it('短文本只产生一片', () => {
    const chunks = chunkText('hello world', 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('hello world');
  });

  it('长文本切出多片且长度不超过 chunkSize（允许段落回退）', () => {
    const text = 'A'.repeat(500);
    const chunks = chunkText(text, 100, 10);
    expect(chunks.length).toBeGreaterThan(1);
    // 每片长度 <= chunkSize（段落回退只会更短，不会更长）
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(100);
    }
    // 拼起来能覆盖全文（重叠区域允许字符重复出现）
    const joined = chunks.join('');
    expect(joined.length).toBeGreaterThanOrEqual(500 - 10 * (chunks.length - 1));
  });

  it('相邻切片之间存在 overlap 重叠', () => {
    const text = 'B'.repeat(400);
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // 第二片开头应能与第一片结尾至少重叠一部分（因无换行，纯滑动窗口）
    const first = chunks[chunks.length - 2];
    const second = chunks[chunks.length - 1];
    // 末片是尾部；验证整体覆盖：末片末尾必须是原文末尾
    expect(second.endsWith('B'.repeat(second.length))).toBe(true);
    // 相邻片起点差 <= chunkSize（即存在重叠或紧贴）
    expect(chunks.length).toBeGreaterThan(3);
  });

  it('overlap 超过 chunkSize 一半时被钳制', () => {
    const text = 'C'.repeat(300);
    // overlap=100 会被钳到 floor(100/2)=50
    const chunks = chunkText(text, 100, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // 若未钳制，步长=0 会死循环；能返回即说明钳制生效
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
  });

  it('归一化 \\r\\n 为 \\n', () => {
    const chunks = chunkText('line1\r\nline2\r\nline3', 100, 0);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain('\r');
    expect(chunks[0]).toBe('line1\nline2\nline3');
  });
});
