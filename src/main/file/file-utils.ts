import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { parseWorkbookToMarkdown } from './excel-parse';
import { parsePptxToMarkdown } from './pptx-parse';

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
export function detectFileType(filePath: string): 'pdf' | 'docx' | 'md' | 'txt' | 'sheet' | 'pptx' | 'unknown' {
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
    case '.xlsx':
    case '.xls':
    case '.csv':
      return 'sheet';
    case '.pptx':
      return 'pptx';
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

  // Excel / CSV：解析为 Markdown 表格文档（真实解析，可入库、可编辑、可检索）
  if (type === 'sheet') {
    return await parseWorkbookToMarkdown(filePath);
  }

  // PPTX：解析为「每页 ## Slide N + 要点文本」的 Markdown 文档（真实解析）
  if (type === 'pptx') {
    return await parsePptxToMarkdown(filePath);
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

/**
 * 判定是否为「本地文件系统绝对路径」（跨平台）。
 * 覆盖：Windows 盘符路径（C:\ / C:/）、Unix 绝对路径（/foo）、UNC 共享（\\server\share / //server/share）。
 * 与 isUncPath（仅 UNC，不含盘符）区分：本函数额外识别 Windows 盘符绝对路径，
 * 使本地源文件（如 C:\Users\...\doc.txt）在 Windows 上被正确识别为可同步的本地引用。
 */
export function isLocalFsPath(p: string): boolean {
  if (!p) return false;
  // Windows 盘符绝对路径：C:\ 或 C:/
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  // Unix 绝对路径 /foo 或 UNC \\server 或 //server
  return p.startsWith('/') || p.startsWith('\\\\') || p.startsWith('//');
}
