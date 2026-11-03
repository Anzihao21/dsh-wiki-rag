import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  sha256File,
  sha256Text,
  detectFileType,
  extractTextToMarkdown,
  toMdFileName,
} from '../file-utils';

describe('file-utils 文件工具', () => {
  it('sha256Text 与已知向量一致', () => {
    // echo -n 'abc' | sha256sum
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('sha256File 读取临时文件内容哈希', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-fu-'));
    const p = path.join(dir, 'note.txt');
    await fs.writeFile(p, 'hello-hash');
    expect(await sha256File(p)).toBe(sha256Text('hello-hash'));
  });

  it('detectFileType 按扩展名识别', () => {
    expect(detectFileType('/tmp/a.PDF')).toBe('pdf');
    expect(detectFileType('a.docx')).toBe('docx');
    expect(detectFileType('a.md')).toBe('md');
    expect(detectFileType('a.txt')).toBe('txt');
    expect(detectFileType('a.xyz')).toBe('unknown');
  });

  it('toMdFileName 统一改成 .md', () => {
    expect(toMdFileName('报告.docx')).toBe('报告.md');
    expect(toMdFileName('README')).toBe('README.md');
    expect(toMdFileName('已经是.md')).toBe('已经是.md');
  });

  it('extractTextToMarkdown 对 md/txt 直接读原文', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-fu-'));
    const md = path.join(dir, 'doc.md');
    await fs.writeFile(md, '# 标题\n正文内容');
    expect(await extractTextToMarkdown(md)).toBe('# 标题\n正文内容');
  });

  it('extractTextToMarkdown 对 pdf 走真实解析', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-fu-'));
    const pdf = path.join(dir, 'paper.pdf');
    await fs.writeFile(pdf, makeMinPdf('Hello Real PDF'));
    const out = await extractTextToMarkdown(pdf);
    expect(out).toContain('paper.pdf');
    expect(out).toContain('Hello Real PDF');
  });
});

/** 生成一个含单页文本的最小有效 PDF（正确 xref） */
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
