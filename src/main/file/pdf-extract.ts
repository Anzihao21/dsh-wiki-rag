import { promises as fs } from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

/**
 * PDF 解析模块。
 * 用 pdf-parse 提取 PDF 文本，转成 Markdown（标题 + 正文文本）。
 * 仅支持文本型 PDF；扫描件/图片型 PDF 无内嵌文本时返回占位说明。
 */
export async function parsePdfToMarkdown(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = (result?.text || '').replace(/\u0000/g, '').trim();
    const fileName = path.basename(filePath);
    // pdf-parse 对无内嵌文本的页返回 `-- N of M --` 标记，视为无文本（扫描件/图片型）
    const noText = !text || /^--\s*\d+\s+of\s+\d+\s*--$/.test(text);
    if (noText) {
      return `# ${fileName}\n\n（PDF 未提取到可读文本，可能是扫描件/图片型 PDF，请转成可编辑格式后导入）\n`;
    }
    return `# ${fileName}\n\n${text}`;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
