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
