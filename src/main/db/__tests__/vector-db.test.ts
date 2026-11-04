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

describe('FTS5 trigram 端到端召回', () => {
  it('中文 ≥3 字符查询 MATCH 命中正确文档', async () => {
    const f1 = await insertKnowledgeFile({
      file_name: 'wiki.md', source_path: '/w.md', md_path: '/w.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    const f2 = await insertKnowledgeFile({
      file_name: 'other.md', source_path: '/o.md', md_path: '/o.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await insertVectorChunk(f1, '这是一个知识库 RAG 检索增强文档', Buffer.from(new Float32Array([0.1]).buffer));
    await insertVectorChunk(f2, '这是完全无关的图片下载说明', Buffer.from(new Float32Array([0.2]).buffer));
    // 中文 trigram 查询（小库 <=200 chunk 走全表分支，关键词不过滤但软删过滤生效）
    const rows = await getChunksForSearch(['知识库'], 10);
    const fileIds = rows.map((r) => r.file_id);
    expect(fileIds).toContain(f1);
    expect(fileIds).toContain(f2); // 小库全表分支返回所有存活 chunk
  });

  it('英文 ≥3 字符查询 MATCH 命中', async () => {
    const f1 = await insertKnowledgeFile({
      file_name: 'emb.md', source_path: '/e.md', md_path: '/e.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    await insertVectorChunk(f1, 'embedding vector model local onnx', Buffer.from(new Float32Array([0.1]).buffer));
    const rows = await getChunksForSearch(['embedding'], 10);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].file_id).toBe(f1);
  });
});

describe('FTS5 MATCH 大库分支（>200 chunks）', () => {
  it('大库下 MATCH 路径命中目标文件且过滤软删', async () => {
    // 灌入 250 chunk 触发大库分支
    const fTarget = await insertKnowledgeFile({
      file_name: 'target.md', source_path: '/t.md', md_path: '/t.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    const fTrash = await insertKnowledgeFile({
      file_name: 'trash.md', source_path: '/tr.md', md_path: '/tr.md',
      zip_archive_path: '', file_type: 'md', create_time: Date.now(), last_sync_time: 0,
      folder_id: null,
    });
    // 200 filler chunks
    for (let i = 0; i < 200; i++) {
      await insertVectorChunk(fileId, `filler chunk number ${i} unrelated text`, Buffer.from(new Float32Array([0.001]).buffer));
    }
    // target 含关键词
    await insertVectorChunk(fTarget, '回收站软删除 deleted_at 字段说明', Buffer.from(new Float32Array([0.5]).buffer));
    // trash 含关键词但被软删
    await insertVectorChunk(fTrash, '回收站软删除测试用例', Buffer.from(new Float32Array([0.6]).buffer));
    await softDeleteFile(fTrash);
    const rows = await getChunksForSearch(['回收站'], 50);
    const fileIds = rows.map((r) => r.file_id);
    expect(fileIds).toContain(fTarget);
    expect(fileIds).not.toContain(fTrash);
  }, 30000);
});
