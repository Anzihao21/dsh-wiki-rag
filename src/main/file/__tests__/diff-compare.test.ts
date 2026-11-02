import { describe, it, expect } from 'vitest';
import { compareMarkdown, buildDiffResult, isTextSame } from '../diff-compare';

describe('diff-compare MD 行级对比', () => {
  it('增 / 删 / 改三态：被删除行 removed=true，新增行 added=true', () => {
    const oldText = '标题一\n旧内容行\n共同行';
    const newText = '标题一\n新内容行\n共同行\n追加行';
    const parts = compareMarkdown(oldText, newText);

    const removed = parts.filter((p) => p.removed).map((p) => p.value).join('');
    const added = parts.filter((p) => p.added).map((p) => p.value).join('');

    // 改：旧行被删（diffLines 会把相邻上下文并入同一 removed hunk）
    expect(removed).toContain('旧内容行');
    expect(removed).not.toContain('新内容行');
    // 增：新行 + 追加行
    expect(added).toContain('新内容行');
    expect(added).toContain('追加行');
    // 未变行既不 added 也不 removed（顶部共同的标题行）
    const unchanged = parts.find((p) => !p.added && !p.removed && p.value.includes('标题一'));
    expect(unchanged).toBeTruthy();
  });

  it('完全相同的文本没有 added/removed 片段', () => {
    const parts = compareMarkdown('aaa\nbbb', 'aaa\nbbb');
    expect(parts.every((p) => !p.added && !p.removed)).toBe(true);
  });

  it('buildDiffResult 携带文件元信息与新旧全文', () => {
    const r = buildDiffResult(7, 'note.md', 'old', 'new');
    expect(r.fileId).toBe(7);
    expect(r.fileName).toBe('note.md');
    expect(r.oldText).toBe('old');
    expect(r.newText).toBe('new');
    expect(r.diff.length).toBeGreaterThan(0);
  });

  it('isTextSame 判定一致', () => {
    expect(isTextSame('x', 'x')).toBe(true);
    expect(isTextSame('x', 'y')).toBe(false);
  });
});
