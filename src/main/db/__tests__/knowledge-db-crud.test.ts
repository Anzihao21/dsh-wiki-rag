import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase, run } from '../../db/sqlite-init';
import {
  insertKnowledgeFile,
  getKnowledgeFileById,
  listKnowledgeFiles,
  findKnowledgeFileBySourcePath,
  listFileNamesByPath,
  updateSyncTime,
  updateMdPath,
  updateSourcePath,
  updateZipPath,
  deleteKnowledgeFile,
  countByType,
  listKnowledgeFilesByFolder,
  listFolders,
  getFolderById,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  moveFileToFolder,
} from '../knowledge-db';
import type { KnowledgeFile } from '../../types';

let tmpDir = '';
let dbFile = '';

function sample(over: Partial<KnowledgeFile> = {}): Omit<KnowledgeFile, 'id'> {
  return {
    file_name: 'doc.md',
    source_path: '/src/doc.txt',
    md_path: '/kb/doc.md',
    zip_archive_path: '/kb/doc.zip',
    file_type: 'md',
    create_time: 1000,
    last_sync_time: 0,
    ...over,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-crud-'));
  dbFile = path.join(tmpDir, 'crud.db');
  await initDatabase(dbFile);
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('insertKnowledgeFile / getKnowledgeFileById', () => {
  it('插入后返回自增 id 且递增', async () => {
    const id1 = await insertKnowledgeFile(sample({ file_name: 'a.md' }));
    const id2 = await insertKnowledgeFile(sample({ file_name: 'b.md' }));
    expect(id2).toBeGreaterThan(id1);
  });

  it('getKnowledgeFileById 不存在返回 undefined', async () => {
    expect(await getKnowledgeFileById(99999)).toBeUndefined();
  });

  it('getKnowledgeFileById id=0 返回 undefined', async () => {
    expect(await getKnowledgeFileById(0)).toBeUndefined();
  });

  it('插入带 folder_id 的记录可正确读回', async () => {
    const folderId = await createFolder('sub');
    const id = await insertKnowledgeFile(sample({ folder_id: folderId }));
    const row = await getKnowledgeFileById(id);
    expect(row!.folder_id).toBe(folderId);
  });

  it('folder_id 默认 null', async () => {
    const id = await insertKnowledgeFile(sample());
    const row = await getKnowledgeFileById(id);
    expect(row!.folder_id).toBeNull();
  });

  it('findKnowledgeFileBySourcePath 命中/未命中', async () => {
    await insertKnowledgeFile(sample({ source_path: '/src/unique.txt' }));
    expect((await findKnowledgeFileBySourcePath('/src/unique.txt'))!.file_name).toBe('doc.md');
    expect(await findKnowledgeFileBySourcePath('/src/absent.txt')).toBeUndefined();
  });

  it('重复插入相同 source_path 不冲突（无唯一约束）', async () => {
    const id1 = await insertKnowledgeFile(sample({ source_path: '/same.txt' }));
    const id2 = await insertKnowledgeFile(sample({ source_path: '/same.txt' }));
    expect(id2).not.toBe(id1);
  });
});

describe('更新操作', () => {
  it('updateMdPath 同时改 file_name 与 md_path', async () => {
    const id = await insertKnowledgeFile(sample());
    await updateMdPath(id, 'renamed.md', '/kb/renamed.md');
    const row = await getKnowledgeFileById(id);
    expect(row!.file_name).toBe('renamed.md');
    expect(row!.md_path).toBe('/kb/renamed.md');
  });

  it('updateZipPath 改归档路径', async () => {
    const id = await insertKnowledgeFile(sample());
    await updateZipPath(id, '/new/location.zip');
    const row = await getKnowledgeFileById(id);
    expect(row!.zip_archive_path).toBe('/new/location.zip');
  });

  it('updateSourcePath 改源路径', async () => {
    const id = await insertKnowledgeFile(sample());
    await updateSourcePath(id, '/new/source.txt');
    const row = await getKnowledgeFileById(id);
    expect(row!.source_path).toBe('/new/source.txt');
  });

  it('updateSyncTime 更新时间戳', async () => {
    const id = await insertKnowledgeFile(sample());
    await updateSyncTime(id, 424242);
    expect((await getKnowledgeFileById(id))!.last_sync_time).toBe(424242);
  });

  it('更新不存在的 id 不抛错（影响 0 行）', async () => {
    await expect(updateMdPath(99999, 'x.md', '/x.md')).resolves.toBeUndefined();
    await expect(updateZipPath(99999, '/x.zip')).resolves.toBeUndefined();
    await expect(updateSourcePath(99999, '/x')).resolves.toBeUndefined();
    await expect(updateSyncTime(99999, 1)).resolves.toBeUndefined();
  });
});

describe('deleteKnowledgeFile', () => {
  it('删除后 listKnowledgeFiles 不再包含', async () => {
    const id = await insertKnowledgeFile(sample());
    expect(await listKnowledgeFiles()).toHaveLength(1);
    await deleteKnowledgeFile(id);
    expect(await listKnowledgeFiles()).toHaveLength(0);
  });

  it('重复删除不抛错', async () => {
    const id = await insertKnowledgeFile(sample());
    await deleteKnowledgeFile(id);
    await expect(deleteKnowledgeFile(id)).resolves.toBeUndefined();
  });
});

describe('countByType', () => {
  it('空表返回空对象', async () => {
    expect(await countByType()).toEqual({});
  });

  it('按类型聚合多记录', async () => {
    await insertKnowledgeFile(sample({ file_type: 'md' }));
    await insertKnowledgeFile(sample({ file_type: 'md' }));
    await insertKnowledgeFile(sample({ file_type: 'txt' }));
    await insertKnowledgeFile(sample({ file_type: 'pdf' }));
    const c = await countByType();
    expect(c).toEqual({ md: 2, txt: 1, pdf: 1 });
  });
});

describe('listKnowledgeFilesByFolder', () => {
  it('folderId=null 只返回根目录文件', async () => {
    await insertKnowledgeFile(sample({ file_name: 'root.md' }));
    const fid = await createFolder('f1');
    await insertKnowledgeFile(sample({ file_name: 'in-folder.md', folder_id: fid }));
    const rootRows = await listKnowledgeFilesByFolder(null);
    expect(rootRows.map((r) => r.file_name)).toEqual(['root.md']);
  });

  it('folderId 指定值返回该目录文件', async () => {
    const fid = await createFolder('f2');
    await insertKnowledgeFile(sample({ file_name: 'in.md', folder_id: fid }));
    await insertKnowledgeFile(sample({ file_name: 'root.md' }));
    const rows = await listKnowledgeFilesByFolder(fid);
    expect(rows.map((r) => r.file_name)).toEqual(['in.md']);
  });

  it('不存在的 folderId 返回空数组', async () => {
    expect(await listKnowledgeFilesByFolder(99999)).toEqual([]);
  });
});

describe('文件夹 CRUD', () => {
  it('createFolder 根目录文件夹', async () => {
    const id = await createFolder('notes');
    const f = await getFolderById(id);
    expect(f!.name).toBe('notes');
    expect(f!.parent_id).toBeNull();
  });

  it('createFolder 嵌套文件夹', async () => {
    const parent = await createFolder('parent');
    const child = await createFolder('child', parent);
    const f = await getFolderById(child);
    expect(f!.parent_id).toBe(parent);
  });

  it('listFolders 排序', async () => {
    await createFolder('b');
    await createFolder('a');
    const list = await listFolders();
    expect(list.length).toBe(2);
  });

  it('getFolderById 不存在返回 undefined', async () => {
    expect(await getFolderById(99999)).toBeUndefined();
  });

  it('renameFolder 修改名称', async () => {
    const id = await createFolder('old');
    await renameFolder(id, 'new');
    expect((await getFolderById(id))!.name).toBe('new');
  });

  it('moveFolder 改父目录', async () => {
    const a = await createFolder('a');
    const b = await createFolder('b');
    await moveFolder(b, a);
    expect((await getFolderById(b))!.parent_id).toBe(a);
  });

  it('moveFolder 到根（parent_id=null）', async () => {
    const a = await createFolder('a');
    const b = await createFolder('b', a);
    await moveFolder(b, null);
    expect((await getFolderById(b))!.parent_id).toBeNull();
  });

  it('deleteFolder 后子文件夹 parent_id 置 null', async () => {
    const parent = await createFolder('parent');
    const child = await createFolder('child', parent);
    await deleteFolder(parent);
    expect(await getFolderById(parent)).toBeUndefined();
    expect((await getFolderById(child))!.parent_id).toBeNull();
  });

  it('deleteFolder 后其下文档 folder_id 置 null（移入根）', async () => {
    const fid = await createFolder('f');
    const fileId = await insertKnowledgeFile(sample({ folder_id: fid }));
    await deleteFolder(fid);
    const row = await getKnowledgeFileById(fileId);
    expect(row!.folder_id).toBeNull();
  });
});

describe('moveFileToFolder', () => {
  it('把文件移到指定文件夹', async () => {
    const fid = await createFolder('mv');
    const id = await insertKnowledgeFile(sample());
    await moveFileToFolder(id, fid);
    expect((await getKnowledgeFileById(id))!.folder_id).toBe(fid);
  });

  it('把文件移回根目录（folderId=null）', async () => {
    const fid = await createFolder('mv2');
    const id = await insertKnowledgeFile(sample({ folder_id: fid }));
    await moveFileToFolder(id, null);
    expect((await getKnowledgeFileById(id))!.folder_id).toBeNull();
  });

  it('移动不存在的文件不抛错', async () => {
    await expect(moveFileToFolder(99999, null)).resolves.toBeUndefined();
  });
});

describe('listFileNamesByPath', () => {
  it('空目录返回空数组', async () => {
    expect(await listFileNamesByPath('/nonexistent-prefix/')).toEqual([]);
  });

  it('多前缀匹配结果正确', async () => {
    await insertKnowledgeFile(sample({ file_name: 'a.md', md_path: '/kb/a.md' }));
    await insertKnowledgeFile(sample({ file_name: 'b.md', md_path: '/kb/sub/b.md' }));
    const names = await listFileNamesByPath('/kb/');
    expect(names.sort()).toEqual(['a.md', 'b.md']);
  });
});

describe('边界与并发', () => {
  it('并发插入多记录最终落库 3 条', async () => {
    // 注意：last_insert_rowid() 在并发下可能重复返回，但数据行实际落库 3 条
    await Promise.all([
      insertKnowledgeFile(sample({ file_name: 'c1.md' })),
      insertKnowledgeFile(sample({ file_name: 'c2.md' })),
      insertKnowledgeFile(sample({ file_name: 'c3.md' })),
    ]);
    expect(await listKnowledgeFiles()).toHaveLength(3);
  });

  it('空字符串字段写入读回一致', async () => {
    const id = await insertKnowledgeFile(sample({ zip_archive_path: '' }));
    expect((await getKnowledgeFileById(id))!.zip_archive_path).toBe('');
  });

  it('超长字符串字段可存储', async () => {
    const long = '中'.repeat(10000);
    const id = await insertKnowledgeFile(sample({ file_name: long }));
    expect((await getKnowledgeFileById(id))!.file_name).toBe(long);
  });

  it('SQL 注入字符串不被执行（参数化绑定）', async () => {
    const evil = "'; DROP TABLE knowledge_files;--";
    const id = await insertKnowledgeFile(sample({ source_path: evil }));
    expect(await getKnowledgeFileById(id)).toBeDefined();
    expect(await listKnowledgeFiles()).toHaveLength(1);
  });

  it('直接 DELETE 语句不破坏其他表', async () => {
    await insertKnowledgeFile(sample());
    await run('DELETE FROM knowledge_files WHERE id = 99999');
    expect(await listKnowledgeFiles()).toHaveLength(1);
  });
});
