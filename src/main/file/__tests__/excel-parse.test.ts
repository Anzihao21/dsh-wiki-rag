import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx';
import { parseWorkbookToMarkdown, chunkSheetTable } from '../excel-parse';
import { detectFileType, extractTextToMarkdown } from '../file-utils';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-parse-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** 用 XLSX 造一个含多 Sheet 的 .xlsx */
async function makeXlsx(fileName: string): Promise<string> {
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet([
    ['姓名', '部门', '薪资'],
    ['张伟', '研发', 12000],
    ['李娜', '市场', 9800],
  ]);
  XLSX.utils.book_append_sheet(wb, s1, '员工表');
  const s2 = XLSX.utils.aoa_to_sheet([
    ['商品', '数量', '单价'],
    ['苹果', 10, '含|管道符号'],
    ['香蕉', 5, 3.5],
  ]);
  XLSX.utils.book_append_sheet(wb, s2, '库存表');
  const filePath = path.join(dir, fileName);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('parseWorkbookToMarkdown', () => {
  it('解析 .xlsx 多 Sheet 为 Markdown 表格：含标题、Sheet 名、单元格、| 转义', async () => {
    const filePath = await makeXlsx('book.xlsx');
    const md = await parseWorkbookToMarkdown(filePath);
    expect(md).toContain('# book.xlsx');
    expect(md).toContain('## 员工表');
    expect(md).toContain('## 库存表');
    expect(md).toContain('张伟');
    expect(md).toContain('12000');
    // 单元格内含 | 会被转义，避免破坏表格列
    expect(md).toContain('含\\|管道符号');
    // 表头分隔行存在
    expect(md).toMatch(/\| *姓名 *\| *部门 *\| *薪资 *\|/);
    expect(md).toMatch(/\| *--- *\| *--- *\| *--- *\|/);
  });

  it('解析 .csv 为 Markdown 表格', async () => {
    const filePath = path.join(dir, 'data.csv');
    await fs.writeFile(filePath, '城市,人口(万)\n上海,2487\n北京,2184\n', 'utf-8');
    const md = await parseWorkbookToMarkdown(filePath);
    expect(md).toContain('# data.csv');
    expect(md).toContain('上海');
    expect(md).toContain('2487');
  });

  it('空/全空 Sheet 不产出空块', async () => {
    const filePath = await makeXlsx('empty.xlsx');
    // 追加一个全空 sheet
    const buf = await fs.readFile(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), '空表');
    XLSX.writeFile(wb, filePath);
    const md = await parseWorkbookToMarkdown(filePath);
    expect(md).not.toContain('空表');
    expect(md.split('## ').length - 1).toBe(2); // 只有两个非空 sheet
  });
});

describe('file-utils 集成（导入链路）', () => {
  it('detectFileType 识别 xlsx/xls/csv 为 sheet', () => {
    expect(detectFileType('a.xlsx')).toBe('sheet');
    expect(detectFileType('a.xls')).toBe('sheet');
    expect(detectFileType('a.CSV')).toBe('sheet');
  });

  it('extractTextToMarkdown 对 xlsx 返回 Markdown 表格（真实解析）', async () => {
    const filePath = await makeXlsx('集成.xlsx');
    const md = await extractTextToMarkdown(filePath);
    expect(md).toContain('## 员工表');
    expect(md).toContain('张伟');
  });
});

describe('chunkSheetTable', () => {
  it('小表格整块返回（不超过 chunkSize）', () => {
    const md = '## 员工表\n\n| 姓名 | 部门 |\n| --- | --- |\n| 张伟 | 研发 |';
    const chunks = chunkSheetTable(md, 800, 120);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('张伟');
  });

  it('超长表格按行分块，每块保留表头且不截断行', () => {
    // 造一个表头 + 40 行数据的表格
    const rows: string[] = ['## 大表', '', '| 序号 | 数据 |', '| --- | --- |'];
    for (let i = 1; i <= 40; i++) rows.push(`| ${i} | 内容${i} |`);
    const md = rows.join('\n');
    const chunks = chunkSheetTable(md, 200, 40);
    // 多块且都含表头
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c).toContain('| 序号 | 数据 |');
      expect(c).toContain('| --- | --- |');
      expect(c.length).toBeLessThanOrEqual(240); // 略宽于 chunkSize（含表头固定开销）
    }
    // 所有数据行都被覆盖（首尾行出现在结果里）
    const all = chunks.join('\n');
    expect(all).toContain('| 1 | 内容1 |');
    expect(all).toContain('| 40 | 内容40 |');
  });

  it('无表头的纯文本回退到固定窗口切片', () => {
    const text = '普通段落\n\n'.repeat(50);
    const chunks = chunkSheetTable(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(210);
  });
});
