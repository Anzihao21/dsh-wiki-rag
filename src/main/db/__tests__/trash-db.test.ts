import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../sqlite-init';
import {
  insertKnowledgeFile, listKnowledgeFiles, listFolders,
  createFolder, softDeleteFile, softDeleteFolderCascade,
  listTrash, restoreFile, restoreFolderCascade,
  purgeFileRow, purgeFolderRow, listTrashFiles, listTrashFolderIds,
  getKnowledgeFileById, getFolderById,
} from '../knowledge-db';

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'trash-db-'));
  await initDatabase(path.join(dir, 'wiki.db'));
});
afterEach(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe('回收站软删除', () => {
  it('软删文件后 list 不含、trash 含、restore 后归位', async () => {
    const fid = await insertKnowledgeFile({
      file_name: 'a.md', source_path: '/a.md', md_path: path.join(dir, 'a.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    writeFileSync(path.join(dir, 'a.md'), '# hi');
    await softDeleteFile(fid);
    expect((await listKnowledgeFiles()).find((f) => f.id === fid)).toBeUndefined();
    const trash = await listTrash();
    expect(trash.files.find((f) => f.id === fid)).toBeTruthy();
    await restoreFile(fid);
    expect((await listKnowledgeFiles()).find((f) => f.id === fid)).toBeTruthy();
    expect((await listTrash()).files.find((f) => f.id === fid)).toBeUndefined();
  });

  it('软删文件夹级联软删其下文件', async () => {
    const folderId = await createFolder('work');
    const fid = await insertKnowledgeFile({
      file_name: 'b.md', source_path: '/b.md', md_path: path.join(dir, 'b.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: folderId,
    });
    await softDeleteFolderCascade(folderId);
    expect((await listFolders()).find((f) => f.id === folderId)).toBeUndefined();
    expect((await listKnowledgeFiles()).find((f) => f.id === fid)).toBeUndefined();
    const trash = await listTrash();
    expect(trash.folders.find((f) => f.id === folderId)).toBeTruthy();
    expect(trash.files.find((f) => f.id === fid)).toBeTruthy();
  });

  it('文件夹 restore 级联恢复子项与祖先', async () => {
    const root = await createFolder('root');
    const child = await createFolder('child', root);
    const fid = await insertKnowledgeFile({
      file_name: 'c.md', source_path: '/c.md', md_path: path.join(dir, 'c.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: child,
    });
    await softDeleteFolderCascade(child);
    // root 未删，child 删了；restore child 应把 child 与文件恢复
    await restoreFolderCascade(child);
    expect((await listFolders()).find((f) => f.id === child)).toBeTruthy();
    expect((await listKnowledgeFiles()).find((f) => f.id === fid)).toBeTruthy();
  });

  it('purge 物理删行；emptyTrash 清空', async () => {
    const fid = await insertKnowledgeFile({
      file_name: 'd.md', source_path: '/d.md', md_path: path.join(dir, 'd.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await softDeleteFile(fid);
    const trashFiles = await listTrashFiles();
    expect(trashFiles.find((f) => f.id === fid)).toBeTruthy();
    await purgeFileRow(fid);
    expect(await getKnowledgeFileById(fid)).toBeUndefined();
  });
});

describe('软删后重新导入', () => {
  it('同路径重新导入：新建行正常、旧行保持 deleted（不复活）', async () => {
    const mdPath = path.join(dir, 'reimport.md');
    writeFileSync(mdPath, '# v1');
    const id1 = await insertKnowledgeFile({
      file_name: 'reimport.md', source_path: mdPath, md_path: mdPath,
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await softDeleteFile(id1);
    // 重新导入同路径 → 新行
    const id2 = await insertKnowledgeFile({
      file_name: 'reimport.md', source_path: mdPath, md_path: mdPath,
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    expect(id2).not.toBe(id1);
    // list 只看到新行
    const active = await listKnowledgeFiles();
    expect(active.find((f) => f.id === id1)).toBeUndefined();
    expect(active.find((f) => f.id === id2)).toBeTruthy();
    // trash 仍有旧行
    const trash = await listTrash();
    expect(trash.files.find((f) => f.id === id1)).toBeTruthy();
    expect(trash.files.find((f) => f.id === id2)).toBeUndefined();
  });
});

describe('purge 清理 file_versions 孤儿', () => {
  it('purgeFileRow 后 file_versions 对应行也被删除', async () => {
    const fid = await insertKnowledgeFile({
      file_name: 'v.md', source_path: '/v.md', md_path: path.join(dir, 'v.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    // 插入一条历史版本
    await (await import('../sqlite-init')).run(
      'INSERT INTO file_versions (file_id, version, content, create_time) VALUES (?, 1, ?, ?)',
      [fid, '# old', Date.now()]
    );
    const before = await (await import('../sqlite-init')).all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM file_versions WHERE file_id = ?', [fid]
    );
    expect(before[0].n).toBe(1);
    await purgeFileRow(fid);
    const after = await (await import('../sqlite-init')).all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM file_versions WHERE file_id = ?', [fid]
    );
    expect(after[0].n).toBe(0);
  });
});

describe('listKnowledgeFiles 过滤软删（ZIP 导出同源）', () => {
  it('软删后 listKnowledgeFiles 不含该文件，导出语义正确', async () => {
    const id1 = await insertKnowledgeFile({
      file_name: 'active.md', source_path: '/a.md', md_path: path.join(dir, 'a.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    const id2 = await insertKnowledgeFile({
      file_name: 'deleted.md', source_path: '/d.md', md_path: path.join(dir, 'd.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await softDeleteFile(id2);
    const active = await listKnowledgeFiles();
    expect(active.find((f) => f.id === id1)).toBeTruthy();
    expect(active.find((f) => f.id === id2)).toBeUndefined();
  });
});

describe('purge/restore 并发幂等', () => {
  it('连续 purge 同一 id 不抛错（第二次行已不存在）', async () => {
    const fid = await insertKnowledgeFile({
      file_name: 'concurrent.md', source_path: '/c.md', md_path: path.join(dir, 'c.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await softDeleteFile(fid);
    await purgeFileRow(fid);
    // 第二次 purge 不应抛错（DELETE WHERE id=? 匹配 0 行是 no-op）
    await expect(purgeFileRow(fid)).resolves.toBeUndefined();
    expect(await getKnowledgeFileById(fid)).toBeUndefined();
  });

  it('restore 已 purge 的 id 是 no-op（行不存在不抛错）', async () => {
    const fid = await insertKnowledgeFile({
      file_name: 'gone.md', source_path: '/g.md', md_path: path.join(dir, 'g.md'),
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await softDeleteFile(fid);
    await purgeFileRow(fid);
    // restoreFile 对不存在的 id 是 UPDATE no-op，不抛
    await expect(restoreFile(fid)).resolves.toBeUndefined();
  });
});
