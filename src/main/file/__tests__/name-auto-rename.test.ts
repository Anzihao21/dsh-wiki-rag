import { describe, it, expect } from 'vitest';
import { resolveUniqueFileName, isUncPath } from '../name-auto-rename';

describe('resolveUniqueFileName 同名自动加序号', () => {
  it('无冲突时保持原名', () => {
    expect(resolveUniqueFileName('说明.docx', ['a.pdf', 'b.md'])).toBe('说明.docx');
  });

  it('冲突时追加 (1)', () => {
    expect(resolveUniqueFileName('说明.docx', ['说明.docx'])).toBe('说明(1).docx');
  });

  it('(1) 也被占用时顺延到 (2)(3)', () => {
    const existing = ['报告.md', '报告(1).md', '报告(2).md'];
    expect(resolveUniqueFileName('报告.md', existing)).toBe('报告(3).md');
  });

  it('无扩展名文件也能正确加序号', () => {
    expect(resolveUniqueFileName('README', ['README'])).toBe('README(1)');
  });

  it('多级扩展名按最后一段 extname 处理（与 path.extname 一致）', () => {
    // path.extname('archive.tar.gz') === '.gz'，故 base='archive.tar'
    expect(resolveUniqueFileName('archive.tar.gz', ['archive.tar.gz'])).toBe('archive.tar(1).gz');
  });

  it('isUncPath 识别 UNC / 双斜杠路径', () => {
    expect(isUncPath('\\\\server\\share')).toBe(true);
    expect(isUncPath('//server/share')).toBe(true);
    expect(isUncPath('/home/user')).toBe(false);
    expect(isUncPath('')).toBe(false);
  });
});
