import path from 'path';
import mammoth from 'mammoth';

/**
 * DOCX 解析模块。
 * 用 mammoth 提取 docx 纯文本（标题 + 正文），转成 Markdown。
 * 图片、批注、复杂排版不保留（对知识检索足够）。
 */
export async function parseDocxToMarkdown(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = (result?.value || '').trim();
  const fileName = path.basename(filePath);
  return `# ${fileName}\n\n${text}`;
}
