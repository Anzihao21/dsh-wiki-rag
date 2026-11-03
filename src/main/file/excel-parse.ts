import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

/**
 * Excel / CSV 解析模块。
 * 把 .xlsx / .xls / .csv 解析为 Markdown 表格文档，供知识库入库、Tiptap 编辑与 RAG 检索。
 * 多 Sheet 用 `## Sheet名` 分隔；单元格内的 `|` 与换行做转义，保证表格结构合法。
 */

/** 单元格文本清洗：去空串、转义表格分隔符与换行 */
function cellText(v: unknown): string {
  let s = v == null ? '' : String(v).trim();
  s = s.replace(/\|/g, '\\|'); // 转义，避免破坏表格列
  s = s.replace(/\r?\n/g, ' '); // 单元格内换行折叠为空格，保持单行
  return s;
}

/** 把二维行数组转成 Markdown 表格文本；自动剔除全空行，按最长行补列对齐 */
function rowsToTable(rows: (unknown[] | null)[]): string {
  const clean = (rows || []).filter(
    (r): r is unknown[] => Array.isArray(r) && r.some((c) => cellText(c) !== '')
  );
  if (clean.length === 0) return '';

  const maxCols = Math.max(...clean.map((r) => r.length));
  const norm = clean.map((r) => {
    const cells: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      cells.push(cellText(r[i]));
    }
    return cells;
  });

  const header = norm[0];
  const sep = header.map(() => '---');
  const lines = ['| ' + header.join(' | ') + ' |', '| ' + sep.join(' | ') + ' |'];
  for (const row of norm.slice(1)) {
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return lines.join('\n');
}

/**
 * 解析工作簿（.xlsx / .xls / .csv）为 Markdown 字符串。
 * @param filePath 源文件绝对路径
 */
export async function parseWorkbookToMarkdown(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  let wb: XLSX.WorkBook;
  if (ext === '.csv') {
    // CSV 为纯文本，按字符串读入（避免 BOM 干扰首列）
    const text = await fs.readFile(filePath, 'utf-8');
    wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string' });
  } else {
    const buf = await fs.readFile(filePath);
    wb = XLSX.read(buf, { type: 'buffer' });
  }

  const parts: string[] = [`# ${fileName}`];
  for (const sheetName of wb.SheetNames || []) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const table = rowsToTable(rows);
    if (!table) continue;
    parts.push(`## ${sheetName || 'Sheet'}`);
    parts.push(table);
  }
  return parts.join('\n\n');
}

/**
 * 表格行级切片：在 heading（按 `## Sheet` 分块）基础上，对超长 Sheet 内的表格按「表头 + 若干数据行」切块，
 * 保证每块 ≤ chunkSize 且不把表格拦腰截断成无法解析的半表。
 * 未命中 `## ` 标题的普通文本回退到通用固定窗口切片。
 */
export function chunkSheetTable(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const size = Math.max(1, Math.floor(chunkSize));
  const ov = Math.max(0, Math.min(overlap, Math.floor(size / 2)));

  // 按 `## ` 标题切分 Sheet 块
  const lines = normalized.split('\n');
  const sheets: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^#{2}\s+/.test(line) && cur.length > 0) {
      const sec = cur.join('\n').trim();
      if (sec) sheets.push(sec);
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  const tail = cur.join('\n').trim();
  if (tail) sheets.push(tail);

  const out: string[] = [];
  for (const sheet of sheets) {
    if (!sheet) continue;
    if (sheet.length <= size) {
      out.push(sheet);
      continue;
    }
    // 超长：尝试按表格行切分（表头 + 分隔行固定，数据行逐块累积）
    const sl = sheet.split('\n');
    // 定位表头行（首个以 | 开头且含 --- 分隔符的下一个是表头；否则取首个 | 行）
    let headIdx = -1;
    for (let i = 0; i < sl.length; i++) {
      if (sl[i].trim().startsWith('|')) { headIdx = i; break; }
    }
    let sepIdx = -1;
    for (let i = (headIdx >= 0 ? headIdx + 1 : 0); i < sl.length; i++) {
      if (sl[i].trim().startsWith('|') && sl[i].includes('---')) { sepIdx = i; break; }
    }
    const headBlock = sl.slice(0, headIdx >= 0 ? headIdx : 0); // 标题前缀
    const headerRows = headIdx >= 0 ? sl.slice(headIdx, (sepIdx >= 0 ? sepIdx + 1 : headIdx + 1)) : [];
    const dataRows = sepIdx >= 0 ? sl.slice(sepIdx + 1) : sl.slice(headIdx >= 0 ? headIdx + 1 : 0);

    if (headerRows.length === 0) {
      // 无表头结构，退回通用固定窗口
      out.push(...chunkFixed(sheet, size, ov));
      continue;
    }
    const headerText = headerRows.join('\n');
    let block: string[] = [];
    const flush = () => {
      if (block.length === 0) return;
      const prefix = headBlock.length ? headBlock.join('\n') + '\n\n' : '';
      out.push((prefix + headerText + '\n' + block.join('\n')).trim());
      block = [];
    };
    for (const row of dataRows) {
      if (row.trim() === '') continue;
      const candidate = headerText + '\n' + [...block, row].join('\n');
      if (candidate.length > size && block.length > 0) {
        flush();
      }
      block.push(row);
    }
    flush();
  }
  return out;
}

/** 通用固定窗口切片（供无表头结构回退） */
function chunkFixed(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const relCut = text.slice(start, end).lastIndexOf('\n\n');
      if (relCut > chunkSize * 0.5) end = start + relCut + 2;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}
