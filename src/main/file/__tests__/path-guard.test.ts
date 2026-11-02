import { describe, it, expect } from 'vitest';
import { assertInsideDir, sanitizeFileName, assertZipEntryInside } from '../path-guard';
import path from 'path';

describe('path-guard 路径穿越防护', () => {
  describe('assertInsideDir', () => {
    it('目录内部路径放行', () => {
      const base = '/tmp/wiki/md';
      expect(() => assertInsideDir(path.join(base, 'a.md'), base)).not.toThrow();
      expect(() => assertInsideDir(path.join(base, 'sub', 'a.md'), base)).not.toThrow();
    });

    it('目录本身放行', () => {
      expect(() => assertInsideDir('/tmp/wiki/md', '/tmp/wiki/md')).not.toThrow();
    });

    it('.. 越界抛错', () => {
      const base = '/tmp/wiki/md';
      expect(() => assertInsideDir('/tmp/wiki/evil.md', base)).toThrow(/越界/);
      expect(() => assertInsideDir('/etc/passwd', base)).toThrow(/越界/);
    });
  });

  describe('sanitizeFileName', () => {
    it('剔除目录分隔符', () => {
      expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
      expect(sanitizeFileName('..\\..\\windows\\system32')).not.toContain('\\');
    });

    it('剔除 .. 与 . 段', () => {
      expect(sanitizeFileName('./foo/../bar.md')).toBe('foo_bar.md');
    });

    it('空名降级', () => {
      expect(sanitizeFileName('')).toBe('');
      expect(sanitizeFileName('..')).toBe('');
    });

    it('正常文件名保留', () => {
      expect(sanitizeFileName('项目说明.md')).toBe('项目说明.md');
    });
  });

  describe('assertZipEntryInside', () => {
    it('正常 zip 条目放行', () => {
      const base = '/tmp/wiki/restored';
      expect(() => assertZipEntryInside('md/doc-a.md', base)).not.toThrow();
      expect(() => assertZipEntryInside('zip/doc-a.zip', base)).not.toThrow();
    });

    it('zip-slip 条目抛错', () => {
      const base = '/tmp/wiki/restored';
      expect(() => assertZipEntryInside('../../../etc/passwd', base)).toThrow(/越界/);
      expect(() => assertZipEntryInside('..\\..\\windows\\system32.dll', base)).toThrow(/越界/);
    });
  });
});
