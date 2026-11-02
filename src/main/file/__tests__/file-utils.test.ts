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

  it('extractTextToMarkdown 对 pdf 输出宿主注入占位说明', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-fu-'));
    const pdf = path.join(dir, 'paper.pdf');
    await fs.writeFile(pdf, 'fake-bytes');
    const out = await extractTextToMarkdown(pdf);
    expect(out).toContain('paper.pdf');
    expect(out).toContain('PDF');
    expect(out).toContain('宿主');
  });
});
