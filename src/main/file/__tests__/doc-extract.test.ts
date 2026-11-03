import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import { parsePdfToMarkdown } from '../pdf-extract';
import { parseDocxToMarkdown } from '../docx-extract';
import { detectFileType, extractTextToMarkdown } from '../file-utils';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-extract-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** 精确生成一个含单页文本的最小有效 PDF（含正确 xref 偏移） */
function makeMinPdf(text: string): Buffer {
  const esc = text.replace(/[\\()]/g, (m) => '\\' + m);
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  ];
  const stream = `BT /F1 24 Tf 100 700 Td (${esc}) Tj ET`;
  objs.push(`4 0 obj<</Length ${Buffer.byteLength(stream, 'latin1')}>>stream\n${stream}\nendstream endobj`);
  objs.push('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj');
  const header = '%PDF-1.4\n';
  let body = header;
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += o + '\n';
  }
  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets.slice(1)) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  body += xref + 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + xrefStart + '\n%%EOF';
  return Buffer.from(body, 'latin1');
}

/** 生成一个无内嵌文本（空页）的最小有效 PDF */
function makeEmptyPdf(): Buffer {
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
  ];
  const header = '%PDF-1.4\n';
  let body = header;
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += o + '\n';
  }
  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = 'xref\n0 4\n0000000000 65535 f \n';
  for (const off of offsets.slice(1)) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  body += xref + 'trailer\n<</Size 4/Root 1 0 R>>\nstartxref\n' + xrefStart + '\n%%EOF';
  return Buffer.from(body, 'latin1');
}

/** 用 jszip 造一个最小 docx（word/document.xml 含 w:t） */
async function makeDocx(fileName: string, paras: string[]): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  const ps = paras
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`)
    .join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${ps}</w:body></w:document>`
  );
  const out = path.join(dir, fileName);
  await fs.writeFile(out, await zip.generateAsync({ type: 'nodebuffer' }));
  return out;
}

describe('parsePdfToMarkdown', () => {
  it('提取文本型 PDF 为 Markdown（标题 + 正文）', async () => {
    const filePath = path.join(dir, 'doc.pdf');
    await fs.writeFile(filePath, makeMinPdf('Hello Wiki Rag'));
    const md = await parsePdfToMarkdown(filePath);
    expect(md).toContain('# doc.pdf');
    expect(md).toContain('Hello Wiki Rag');
  });

  it('无内嵌文本的 PDF 返回扫描件占位说明', async () => {
    const filePath = path.join(dir, 'scan.pdf');
    await fs.writeFile(filePath, makeEmptyPdf());
    const md = await parsePdfToMarkdown(filePath);
    expect(md).toContain('未提取到可读文本');
  });
});

describe('parseDocxToMarkdown', () => {
  it('提取 docx 段落为 Markdown', async () => {
    const filePath = await makeDocx('note.docx', ['第一章 概述', '这是正文要点内容']);
    const md = await parseDocxToMarkdown(filePath);
    expect(md).toContain('# note.docx');
    expect(md).toContain('第一章 概述');
    expect(md).toContain('这是正文要点内容');
  });
});

describe('file-utils 集成（PDF/DOCX 导入链路）', () => {
  it('detectFileType 识别 pdf/docx', () => {
    expect(detectFileType('a.pdf')).toBe('pdf');
    expect(detectFileType('a.docx')).toBe('docx');
  });

  it('extractTextToMarkdown 对 PDF 返回真实提取文本', async () => {
    const filePath = path.join(dir, 'i.pdf');
    await fs.writeFile(filePath, makeMinPdf('Integrated text'));
    const md = await extractTextToMarkdown(filePath);
    expect(md).toContain('Integrated text');
  });

  it('extractTextToMarkdown 对 DOCX 返回真实提取文本', async () => {
    const filePath = await makeDocx('i.docx', ['集成正文']);
    const md = await extractTextToMarkdown(filePath);
    expect(md).toContain('集成正文');
  });
});
