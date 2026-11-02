import archiver from 'archiver';
import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { sha256File } from './file-utils';

/**
 * 源文件归档模块。
 * 每个知识条目对应一个独立 zip 压缩包，留存原始上传凭证；
 * MD 是编辑后的副本，原始文件不随 MD 修改变动。
 */
export async function archiveSourceFile(
  sourcePath: string,
  zipDir: string,
  baseName: string
): Promise<string> {
  await fs.mkdir(zipDir, { recursive: true });
  const zipPath = path.join(zipDir, `${baseName}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = (archiver as any)('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(sourcePath, { name: path.basename(sourcePath) });
    archive.finalize();
  });

  return zipPath;
}

/** 读取归档包内原始文件的哈希（用于与磁盘源文件比对） */
export async function getArchivedSourceHash(zipPath: string): Promise<string | null> {
  try {
    await fs.access(zipPath);
    return await sha256File(zipPath);
  } catch {
    return null;
  }
}

/** 删除归档包 */
export async function deleteArchive(zipPath: string): Promise<void> {
  try {
    await fs.unlink(zipPath);
  } catch {
    // 文件不存在则忽略
  }
}
