import { diffLines, type Change } from 'diff';
import type { DiffResult } from '../types';

/**
 * MD 新旧内容 diff 对比，使用 diff 库生成行级差异。
 * 供 DiffModal 渲染 删除/新增 行。
 */
export function compareMarkdown(oldText: string, newText: string): Array<{
  added: boolean;
  removed: boolean;
  value: string;
}> {
  const parts = diffLines(oldText, newText);
  return parts.map((p: Change) => ({
    added: !!p.added,
    removed: !!p.removed,
    value: p.value
  }));
}

/** 生成完整 DiffResult 结构 */
export function buildDiffResult(
  fileId: number,
  fileName: string,
  oldText: string,
  newText: string
): DiffResult {
  return {
    fileId,
    fileName,
    diff: compareMarkdown(oldText, newText),
    oldText,
    newText
  };
}

/** 判断两段文本是否一致 */
export function isTextSame(a: string, b: string): boolean {
  return a === b;
}
