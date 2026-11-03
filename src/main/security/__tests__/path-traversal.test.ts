import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import {
  assertInsideDir,
  sanitizeFileName,
  assertZipEntryInside,
} from '../../file/path-guard';

/**
 * 路径穿越防护专项测试。
 * 覆盖：正常路径放行、../ 越界、绝对路径、符号链接、空路径、空格、
 * 特殊字符（~ * ? |）、Windows 风格路径、UNC 路径、长度边界、
 * 多重 ../、normalize 后仍在根内、递归 resolve 的安全性。
 */
describe('security: 路径穿越防护', () => {
  const ROOT = '/home/wiki/kb';

  describe('正常路径放行', () => {
    it('目录内部文件路径通过检查', () => {
      expect(() => assertInsideDir(path.join(ROOT, 'a.md'), ROOT)).not.toThrow();
      expect(() => assertInsideDir(path.join(ROOT, 'sub', 'b.md'), ROOT)).not.toThrow();
    });

    it('目录本身通过检查', () => {
      expect(() => assertInsideDir(ROOT, ROOT)).not.toThrow();
    });
  });

  describe('../ 越界拒绝', () => {
    it('包含 ../ 的路径被拒绝', () => {
      const evil = path.join(ROOT, '..', 'evil.md');
      expect(() => assertInsideDir(evil, ROOT)).toThrow(/越界/);
    });

    it('../../../../etc/passwd 被拒绝', () => {
      const deep = path.join(ROOT, '..', '..', '..', '..', 'etc', 'passwd');
      expect(() => assertInsideDir(deep, ROOT)).toThrow(/越界/);
    });

    it('同时包含多个 ../ 的路径被拒绝', () => {
      const multi = path.join(ROOT, 'a', '..', '..', 'b', '..', '..', 'c.md');
      // normalize 后仍越界
      expect(() => assertInsideDir(multi, ROOT)).toThrow(/越界/);
    });
  });

  describe('绝对路径与 UNC / Windows 风格', () => {
    it('绝对路径 /etc/passwd 被拒绝', () => {
      expect(() => assertInsideDir('/etc/passwd', ROOT)).toThrow(/越界/);
    });

    it('Windows 风格盘符路径被拒绝（Linux 下 normalize 后落在外）', () => {
      // 在 Linux 上 'C:\\Windows' 会被当相对路径处理；只要越界即拒绝
      const win = path.join(ROOT, '..', 'C:\\Windows\\System32');
      expect(() => assertInsideDir(win, ROOT)).toThrow(/越界/);
    });

    it('UNC 路径经 ../ 逃逸的 zip 条目名被拒绝', () => {
      // zip 条目名里以 //server/share/.. 形式拼出逃逸，normalize 后越界
      expect(() => assertZipEntryInside('//server/share/../../evil.md', ROOT)).toThrow(/越界/);
      expect(() => assertZipEntryInside('../../server/share/evil.md', ROOT)).toThrow(/越界/);
    });
  });

  describe('符号链接处理', () => {
    it('符号链接指向外部时，assertInsideDir 基于字符串路径仍拒绝（不解析 symlink）', () => {
      // assertInsideDir 只做字符串级 resolve，不 readlink；
      // 指向外部的 symlink 路径只要 resolve 后落在 ROOT 外即拒绝
      const link = path.join(ROOT, 'link-to-etc');
      const resolved = path.resolve(link, '..', '..', 'etc', 'passwd');
      expect(() => assertInsideDir(resolved, ROOT)).toThrow(/越界/);
    });
  });

  describe('边界输入', () => {
    it('空路径被拒绝（resolve 到 cwd，不在 ROOT 内）', () => {
      expect(() => assertInsideDir('', ROOT)).toThrow(/越界/);
    });

    it('路径中包含空格不影响判定', () => {
      const withSpace = path.join(ROOT, 'my doc', 'a b.md');
      expect(() => assertInsideDir(withSpace, ROOT)).not.toThrow();
      const escaped = path.join(ROOT, '..', 'escape me.md');
      expect(() => assertInsideDir(escaped, ROOT)).toThrow(/越界/);
    });

    it('路径中包含特殊字符 ~ * ? | 不越界时放行', () => {
      const weird = path.join(ROOT, 'file~1*?|.md');
      // 字符串层面只是普通字符，不影响越界判定
      expect(() => assertInsideDir(weird, ROOT)).not.toThrow();
    });
  });

  describe('路径长度边界', () => {
    it('255 字符的文件名路径正常放行', () => {
      const name = 'a'.repeat(250) + '.md';
      const p = path.join(ROOT, name);
      expect(() => assertInsideDir(p, ROOT)).not.toThrow();
      expect(name.length).toBeLessThanOrEqual(255);
    });

    it('1024 字符的深路径正常放行', () => {
      const seg = 'x'.repeat(250);
      const p = path.join(ROOT, seg, seg, seg, seg, 'deep.md');
      expect(p.length).toBeGreaterThan(1024);
      expect(() => assertInsideDir(p, ROOT)).not.toThrow();
    });

    it('4096 字符的超长路径，若越界仍被拒绝', () => {
      const longEscape = path.join(ROOT, '..', 'y'.repeat(4000));
      expect(() => assertInsideDir(longEscape, ROOT)).toThrow(/越界/);
    });
  });

  describe('normalize 后仍在根目录内的路径', () => {
    it('包含 . 与不越界 .. 段时放行', () => {
      // ROOT/a/./b/../c.md → ROOT/a/c.md，仍在 ROOT 内
      const p = path.normalize(path.join(ROOT, 'a', '.', 'b', '..', 'c.md'));
      expect(p.startsWith(ROOT)).toBe(true);
      expect(() => assertInsideDir(p, ROOT)).not.toThrow();
    });
  });

  describe('递归 resolve 的安全性', () => {
    it('多次 resolve 拼接仍不会越界（sanitizeFileName 递归清洗）', () => {
      // 模拟递归调用：对一个恶意文件名反复 sanitize，结果始终不含分隔符
      let name = '../../../../etc/passwd';
      for (let i = 0; i < 5; i++) {
        name = sanitizeFileName(name);
      }
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name).not.toContain('..');
    });

    it('zip-slip 多重 ../ 条目被拒绝', () => {
      expect(() => assertZipEntryInside('../../../../../etc/passwd', ROOT)).toThrow(/越界/);
      expect(() => assertZipEntryInside('a/b/../../../c.md', ROOT)).toThrow(/越界/);
    });
  });

  describe('sanitizeFileName 加固', () => {
    it('文件名中 null 字节被清除', () => {
      const out = sanitizeFileName('evil.md\x00.png');
      expect(out).not.toContain('\0');
    });

    it('纯 ../ 序列清洗后为空', () => {
      expect(sanitizeFileName('../..')).toBe('');
      expect(sanitizeFileName('./././')).toBe('');
    });
  });

  describe('真实文件系统集成（符号链接越界）', () => {
    it('符号链接指向外部时，调用方应基于字符串拒绝（不依赖 readlink）', async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-guard-'));
      const realOutside = path.join(tmp, 'outside');
      await fs.mkdir(realOutside);
      const inside = path.join(tmp, 'kb');
      await fs.mkdir(inside);
      const link = path.join(inside, 'evil-link');
      try {
        await fs.symlink(realOutside, link);
      } catch {
        // 某些环境不允许 symlink，跳过真实校验但仍断言字符串行为
      }
      // 无论 symlink 是否创建，字符串级 resolve 指向外部必须拒绝
      const evilResolved = path.resolve(link, '..', '..', '..', 'outside-file.md');
      expect(() => assertInsideDir(evilResolved, inside)).toThrow(/越界/);
      await fs.rm(tmp, { recursive: true, force: true });
    });
  });
});
