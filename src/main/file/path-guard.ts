import path from 'path';

/**
 * 路径穿越防护工具。
 *
 * 背景：本插件会把用户可控的文件名 / zip 条目名拼到本地目录下写盘，
 * 若不做校验，恶意文件名（`../../etc/passwd`）或恶意快照 zip（zip-slip）
 * 会导致写到目录之外。本模块统一收口这类校验。
 */

/**
 * 断言 resolvedPath 位于 baseDir 之内（resolve 之后比较）。
 * 任一解析后落在 baseDir 之外的路径都会抛错。
 */
export function assertInsideDir(resolvedPath: string, baseDir: string): void {
  const root = path.resolve(baseDir);
  const target = path.resolve(resolvedPath);
  const rel = path.relative(root, target);
  if (rel === '' ) return; // 同一目录本身允许
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界：${resolvedPath} 不在 ${baseDir} 之下`);
  }
}

/**
 * 清洗一个“纯文件名”（不含目录分隔）：
 * - 去掉任何目录分隔符（/ \）
 * - 去掉 `..` / `.` 段
 * - 去掉首尾空白与控制字符
 * - 去掉空名
 */
export function sanitizeFileName(raw: string): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/[\\/]+/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .trim();
  // 按 _ 分隔后过滤掉 . / .. 段，再拼回
  const segs = cleaned.split('_').filter((s) => s !== '' && s !== '.' && s !== '..');
  return segs.join('_');
}

/**
 * 校验 zip 条目名（entry.fileName）落在 targetDir 内。
 * 供 extract-zip 的 onEntry 回调使用；越界时直接抛错，中断解压。
 */
export function assertZipEntryInside(entryName: string, targetDir: string): void {
  // zip 条目名总是用 / 分隔，先归一为平台分隔再 join
  const normalized = entryName.split('/').join(path.sep);
  const resolved = path.resolve(targetDir, normalized);
  assertInsideDir(resolved, targetDir);
}
