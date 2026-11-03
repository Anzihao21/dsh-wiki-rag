/**
 * 文档文本切片模块。
 * 按 chunkSize 与重叠长度将长文本切成若干片，供向量化。
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized) {
    return [];
  }
  const size = Math.max(1, Math.floor(chunkSize));
  const ov = Math.max(0, Math.min(overlap, Math.floor(size / 2)));

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    // 尽量在段落/换行处断句
    if (end < normalized.length) {
      const relCut = normalized.slice(start, end).lastIndexOf('\n\n');
      if (relCut > size * 0.5) {
        end = start + relCut + 2;
      }
    }
    const piece = normalized.slice(start, end).trim();
    if (piece) {
      chunks.push(piece);
    }
    if (end >= normalized.length) {
      break;
    }
    start = end - ov;
  }
  return chunks;
}

/**
 * 智能切片入口：按配置的切片模式分发。
 * - fixed：原固定窗口切片逻辑（与 chunkText 一致）
 * - heading：按 # / ## / ### 标题分层切分；
 *   每段（标题 + 其后正文，到下一个标题前）不超过 chunkSize 时作为一片，
 *   超长段再退回固定窗口切片，保证单片长度约束。
 */
export function chunkTextSmart(
  text: string,
  chunkSize: number,
  overlap: number,
  mode: 'fixed' | 'heading' = 'fixed'
): string[] {
  if (mode !== 'heading') {
    return chunkText(text, chunkSize, overlap);
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }
  const size = Math.max(1, Math.floor(chunkSize));

  // 按标题行切分章节：标题行作为新章节起点（preamble 归入首章）
  const lines = normalized.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  const isHeading = (line: string): boolean => /^#{1,6}\s/.test(line.trim());
  for (const line of lines) {
    if (isHeading(line) && current.length > 0) {
      const sec = current.join('\n').trim();
      if (sec) sections.push(sec);
      current = [line];
    } else {
      current.push(line);
    }
  }
  const tail = current.join('\n').trim();
  if (tail) sections.push(tail);

  const out: string[] = [];
  for (const sec of sections) {
    if (!sec) continue;
    if (sec.length <= size) {
      out.push(sec);
    } else {
      out.push(...chunkText(sec, size, overlap));
    }
  }
  return out;
}
