import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase, getDbPath } from '../../db/sqlite-init';
import {
  insertKnowledgeFile,
  getKnowledgeFileById,
  listKnowledgeFiles,
  listFileNamesByPath,
  updateSyncTime,
  updateMdPath,
  deleteKnowledgeFile,
  countByType,
} from '../knowledge-db';
import type { KnowledgeFile } from '../../types';

let tmpDir = '';
let dbFile = '';

function sample(over: Partial<KnowledgeFile> = {}): Omit<KnowledgeFile, 'id'> {
  return {
    file_name: 'doc1.md',
    source_path: '/src/doc1.pdf',
    md_path: '/kb/doc1.md',
    zip_archive_path: '/kb/doc1.zip',
    file_type: 'pdf',
    create_time: 1000,
    last_sync_time: 0,
    ...over,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-kdb-'));
  dbFile = path.join(tmpDir, 'test.db');
  await initDatabase(dbFile);
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('knowledge-db CRUD', () => {
  it('initDatabase 落到指定临时文件', () => {
    expect(getDbPath()).toBe(dbFile);
  });

  it('insert 后按 id 读回字段一致', async () => {
    const id = await insertKnowledgeFile(sample());
    expect(id).toBeGreaterThan(0);
    const row = await getKnowledgeFileById(id);
    expect(row).toBeDefined();
    expect(row!.file_name).toBe('doc1.md');
    expect(row!.source_path).toBe('/src/doc1.pdf');
    expect(row!.file_type).toBe('pdf');
  });

  it('listKnowledgeFiles 按 create_time 倒序', async () => {
    await insertKnowledgeFile(sample({ file_name: 'a.md', create_time: 100 }));
    await insertKnowledgeFile(sample({ file_name: 'b.md', create_time: 300 }));
    await insertKnowledgeFile(sample({ file_name: 'c.md', create_time: 200 }));
    const rows = await listKnowledgeFiles();
    expect(rows.map((r) => r.file_name)).toEqual(['b.md', 'c.md', 'a.md']);
  });

  it('listFileNamesByPath 按 md_path 前缀过滤', async () => {
    await insertKnowledgeFile(sample({ file_name: 'x.md', md_path: '/kb/sub/x.md' }));
    await insertKnowledgeFile(sample({ file_name: 'y.md', md_path: '/kb/sub/y.md' }));
    await insertKnowledgeFile(sample({ file_name: 'z.md', md_path: '/other/z.md' }));
    const names = await listFileNamesByPath('/kb/sub/');
    expect(names.sort()).toEqual(['x.md', 'y.md']);
  });

  it('updateSyncTime / updateMdPath 落库', async () => {
    const id = await insertKnowledgeFile(sample());
    await updateSyncTime(id, 9999);
    let row = await getKnowledgeFileById(id);
    expect(row!.last_sync_time).toBe(9999);
    await updateMdPath(id, 'renamed.md', '/kb/renamed.md');
    row = await getKnowledgeFileById(id);
    expect(row!.file_name).toBe('renamed.md');
    expect(row!.md_path).toBe('/kb/renamed.md');
  });

  it('delete 后读不到', async () => {
    const id = await insertKnowledgeFile(sample());
    await deleteKnowledgeFile(id);
    expect(await getKnowledgeFileById(id)).toBeUndefined();
  });

  it('countByType 按类型聚合', async () => {
    await insertKnowledgeFile(sample({ file_type: 'pdf' }));
    await insertKnowledgeFile(sample({ file_type: 'pdf' }));
    await insertKnowledgeFile(sample({ file_type: 'md' }));
    const c = await countByType();
    expect(c.pdf).toBe(2);
    expect(c.md).toBe(1);
  });
});
