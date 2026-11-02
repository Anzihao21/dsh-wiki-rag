import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/** 计算文件 SHA-256 哈希 */
export async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/** 计算文本内容哈希 */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 依据扩展名判定文档类型 */
export function detectFileType(filePath: string): 'pdf' | 'docx' | 'md' | 'txt' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.md':
      return 'md';
    case '.txt':
      return 'txt';
    default:
      return 'unknown';
  }
}

/** 文件大小是否超过阈值（默认 100MB，避免内存溢出） */
export function isOversize(filePath: string, thresholdMb = 100): Promise<boolean> {
  return fs.stat(filePath).then((st) => st.size > thresholdMb * 1024 * 1024);
}

/**
 * 从原始文件提取正文文本，统一转成 Markdown 字符串。
 * pdf/docx 在此用降级方案：返回占位说明 + 可读文件名（真实环境中由 DSH 宿主注入解析器）。
 */
export async function extractTextToMarkdown(filePath: string): Promise<string> {
  const type = detectFileType(filePath);
  const fileName = path.basename(filePath);

  if (type === 'md' || type === 'txt') {
    return await fs.readFile(filePath, 'utf-8');
  }

  // pdf / docx / unknown：记录来源，正文由宿主解析器补充
  const note =
    type === 'unknown'
      ? '（未知/不支持格式，未提取正文）'
      : `（${type.toUpperCase()} 格式，正文由 DSH 宿主解析器注入）`;
  return `# ${fileName}\n\n${note}\n\n> 源文件：\`${filePath}\`\n`;
}

/** 生成 Markdown 文档名（保持扩展名为 .md） */
export function toMdFileName(fileName: string): string {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, fileName.length - ext.length) : fileName;
  return `${base}.md`;
}
