import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';

/**
 * PPTX 解析模块。
 * 用 jszip 解压 .pptx，按 presentation.xml 的 slide 顺序提取每页文本，
 * 输出 Markdown：每页 `## Slide N` + 段落要点文本。
 * 仅提取文本（标题/正文/表格文字），图片、图表、动画等媒体不保留。
 */
export async function parsePptxToMarkdown(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buf);
  const fileName = path.basename(filePath);

  // 按 presentation.xml 的 sldIdLst 顺序解析 slide 顺序（rId → slideN.xml）
  let orderedSlides: string[] = [];
  const pres = zip.file('ppt/presentation.xml');
  const rels = zip.file('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const presXml = await pres.async('string');
    const relsXml = await rels.async('string');
    const ridToTarget: Record<string, string> = {};
    for (const m of relsXml.matchAll(/<Relationship\s+Id="([^"]+)"\s+Target="([^"]+)"/g)) {
      ridToTarget[m[1]] = m[2];
    }
    for (const m of presXml.matchAll(/<p:sldId\s+[^>]*r:id="([^"]+)"/g)) {
      const target = ridToTarget[m[1]];
      if (!target) continue;
      const rel = target.replace(/^slides\//, 'ppt/slides/');
      orderedSlides.push(rel.endsWith('.xml') ? rel : `${rel}.xml`);
    }
  }
  // 回退：按 slide 编号排序
  if (orderedSlides.length === 0) {
    orderedSlides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  }

  const parts: string[] = [`# ${fileName}`];
  let idx = 1;
  for (const slidePath of orderedSlides) {
    const f = zip.file(slidePath);
    if (!f) continue;
    const xml = await f.async('string');
    const text = extractSlideText(xml);
    if (!text) continue;
    parts.push(`## Slide ${idx}`);
    parts.push(text);
    idx++;
  }
  return parts.join('\n\n');
}

/** 从单个 slide XML 提取段落文本（a:p → a:t），表格等嵌入文本同样落入 */
function extractSlideText(xml: string): string {
  const paras: string[] = [];
  const paraRe = /<a:p[^>]*>([\s\S]*?)<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(xml)) !== null) {
    const inner = m[1];
    let text = '';
    const tRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner)) !== null) text += tm[1];
    text = text.trim();
    if (text) paras.push(text.replace(/\|/g, '\\|'));
  }
  // 罕见无 a:p 结构：直接收集全部 a:t
  if (paras.length === 0) {
    const all =
      xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)
        ?.map((s) => s.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean) || [];
    return all.map((s) => s.replace(/\|/g, '\\|')).join('\n');
  }
  return paras.join('\n\n');
}
