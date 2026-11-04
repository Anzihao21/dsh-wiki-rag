import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase } from '../sqlite-init';
import {
  insertVectorChunk,
  getChunksByFileId,
  deleteChunksByFileId,
  countChunks,
  getChunksForSearch,
} from '../vector-db';
import { insertKnowledgeFile, softDeleteFile } from '../knowledge-db';

let tmpDir = '';
let fileId = 0;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-rag-vdb-'));
  await initDatabase(path.join(tmpDir, 'v.db'));
  fileId = await insertKnowledgeFile({
    file_name: 'a.md',
    source_path: '/src/a.md',
    md_path: '/kb/a.md',
    zip_archive_path: '',
    file_type: 'md',
    create_time: 1,
    last_sync_time: 1,
  });
});

afterEach(async () => {
  closeDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('vector-db 空值跳过', () => {
  it('正常 chunk 入库', async () => {
    await insertVectorChunk(fileId, 'hello world', Buffer.from(new Float32Array([0.1, 0.2]).buffer));
    expect(await countChunks()).toBe(1);
  });

  it('空文本 chunk 被跳过', async () => {
    await insertVectorChunk(fileId, '', Buffer.from(new Float32Array([0.1]).buffer));
    await insertVectorChunk(fileId, '   ', Buffer.from(new Float32Array([0.1]).buffer));
    expect(await countChunks()).toBe(0);
  });

  it('空 vector 被跳过', async () => {
    await insertVectorChunk(fileId, 'some text', Buffer.alloc(0));
    expect(await countChunks()).toBe(0);
  });

  it('deleteChunksByFileId 清空某文件全部切片', async () => {
    await insertVectorChunk(fileId, 'a', Buffer.from(new Float32Array([0.1]).buffer));
    await insertVectorChunk(fileId, 'b', Buffer.from(new Float32Array([0.2]).buffer));
    expect(await countChunks()).toBe(2);
    await deleteChunksByFileId(fileId);
    expect(await countChunks()).toBe(0);
  });

  it('getChunksByFileId 返回对应文件切片', async () => {
    await insertVectorChunk(fileId, 'chunk-1', Buffer.from(new Float32Array([0.1]).buffer));
    const rows = await getChunksByFileId(fileId);
    expect(rows).toHaveLength(1);
    expect(rows[0].chunk_text).toBe('chunk-1');
  });
});

describe('getChunksForSearch 过滤软删文件', () => {
  it('软删文件的 chunks 不进候选池', async () => {
    const activeFile = await insertKnowledgeFile({
      file_name: 'active.md', source_path: '/a.md', md_path: '/a.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    const trashFile = await insertKnowledgeFile({
      file_name: 'trash.md', source_path: '/t.md', md_path: '/t.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await insertVectorChunk(activeFile, 'active chunk content', Buffer.from(new Float32Array([0.1]).buffer));
    await insertVectorChunk(trashFile, 'trash chunk content', Buffer.from(new Float32Array([0.2]).buffer));
    await softDeleteFile(trashFile);
    const rows = await getChunksForSearch(['chunk'], 100);
    const fileIds = rows.map((r) => r.file_id);
    expect(fileIds).toContain(activeFile);
    expect(fileIds).not.toContain(trashFile);
  });
});
