import path from 'path';

/**
 * 与资源管理器一致的同名文件自动重命名算法。
 * 例如冲突 `项目说明.docx`，依次尝试 `项目说明(1).docx`、`项目说明(2).docx`…
 */
export function resolveUniqueFileName(
  desiredName: string,
  existingNames: string[]
): string {
  if (!existingNames.includes(desiredName)) {
    return desiredName;
  }

  const ext = path.extname(desiredName);
  const base = desiredName.slice(0, desiredName.length - ext.length);

  let counter = 1;
  while (true) {
    const candidate = `${base}(${counter})${ext}`;
    if (!existingNames.includes(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

/** 解析局域网共享路径（UNC）是否有效形式 */
export function isUncPath(p: string): boolean {
  if (!p) return false;
  return p.startsWith('\\\\') || p.startsWith('//');
}
