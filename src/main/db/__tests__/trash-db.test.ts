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
