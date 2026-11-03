import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import { parsePptxToMarkdown } from '../pptx-parse';
import { detectFileType, extractTextToMarkdown } from '../file-utils';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-parse-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 用 jszip 造一个最小可解析的 .pptx（含 sldIdLst 顺序 + 每页 a:p/a:t 文本） */
async function makePptx(fileName: string, slides: string[][]): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`
  );
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('');
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`
  );
  const rels = slides
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join('');
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
  );
  slides.forEach((paras, i) => {
    const ps = paras.map((p) => `<a:p><a:r><a:t>${esc(p)}</a:t></a:r></a:p>`).join('');
    const xml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${ps}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${i + 1}.xml`, xml);
  });
  const out = path.join(dir, fileName);
  await fs.writeFile(out, await zip.generateAsync({ type: 'nodebuffer' }));
  return out;
}

describe('parsePptxToMarkdown', () => {
  it('按 presentation 顺序解析多页为 ## Slide N + 文本', async () => {
    const filePath = await makePptx('decks.pptx', [
      ['项目启动会', '目标：上线知识库'],
      ['里程碑', '阶段一', '阶段二'],
    ]);
    const md = await parsePptxToMarkdown(filePath);
    expect(md).toContain('# decks.pptx');
    expect(md.indexOf('## Slide 1')).toBeLessThan(md.indexOf('## Slide 2'));
    expect(md).toContain('项目启动会');
    expect(md).toContain('目标：上线知识库');
    expect(md).toContain('里程碑');
    expect(md).toContain('阶段二');
  });

  it('单元格/要点内 | 被转义，避免破坏文档结构', async () => {
    const filePath = await makePptx('pipe.pptx', [['数据 | 说明', 'A | 1']]);
    const md = await parsePptxToMarkdown(filePath);
    expect(md).toContain('数据 \\| 说明');
    expect(md).not.toContain('数据 | 说明'); // 裸未转义
    expect(md).toContain('A \\| 1');
  });
});

describe('file-utils 集成（PPTX 导入链路）', () => {
  it('detectFileType 识别 .pptx', () => {
    expect(detectFileType('a.pptx')).toBe('pptx');
    expect(detectFileType('a.ppt')).toBe('unknown');
  });

  it('extractTextToMarkdown 对 pptx 返回按页分层的 Markdown（真实解析）', async () => {
    const filePath = await makePptx('集成.pptx', [['第一页标题', '正文要点']]);
    const md = await extractTextToMarkdown(filePath);
    expect(md).toContain('## Slide 1');
    expect(md).toContain('第一页标题');
    expect(md).toContain('正文要点');
  });
});
