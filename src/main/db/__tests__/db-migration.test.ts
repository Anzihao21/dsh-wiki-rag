import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, closeDatabase, get, all, run, lastInsertId, SCHEMA_VERSION } from '../sqlite-init';

let dir: string;
let dbPath: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'db-mig-'));
  dbPath = path.join(dir, 'wiki.db');
});
afterEach(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

function colNames(): string[] {
  return all<{ name: string }>('PRAGMA table_info(knowledge_files)').map((c) => c.name);
}

describe('DB 迁移机制', () => {
  it('新库建全 schema：knowledge_files 含 sha256/status 列，user_version=SCHEMA_VERSION', async () => {
    await initDatabase(dbPath);
    const names = colNames();
    expect(names).toContain('sha256');
    expect(names).toContain('status');
    const v = get<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(SCHEMA_VERSION);
  });

  it('老库（缺 sha256/status 列）升级：补列、保留已有数据、新列带默认值', async () => {
    // 手工构造 v1 老库（knowledge_files 无 sha256/status）
    const raw = new Database(dbPath);
    raw.exec(
      `CREATE TABLE knowledge_files (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         file_name TEXT NOT NULL,
         source_path TEXT NOT NULL,
         md_path TEXT NOT NULL,
         zip_archive_path TEXT NOT NULL,
         file_type TEXT NOT NULL,
         create_time INTEGER NOT NULL,
         last_sync_time INTEGER NOT NULL DEFAULT 0,
         folder_id INTEGER DEFAULT NULL
       );`
    );
    raw
      .prepare(
        `INSERT INTO knowledge_files (file_name, source_path, md_path, zip_archive_path, file_type, create_time)
         VALUES ('a.md', '/a.md', '/a.md.m', '/a.zip', 'md', 123)`
      )
      .run();
    raw.pragma('user_version = 1');
    raw.close();

    await initDatabase(dbPath);

    const names = colNames();
    expect(names).toContain('sha256');
    expect(names).toContain('status');
    // 数据保留
    const row = get<{ file_name: string; sha256: string | null; status: string }>(
      'SELECT file_name, sha256, status FROM knowledge_files WHERE file_name = ?',
      ['a.md']
    );
    expect(row?.file_name).toBe('a.md');
    expect(row?.sha256).toBeNull();
    expect(row?.status).toBe('ready');
    // 版本已推进
    const v = get<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(SCHEMA_VERSION);
  });

  it('已是最新版本时再次初始化不重复迁移', async () => {
    await initDatabase(dbPath);
    const v1 = get<{ user_version: number }>('PRAGMA user_version')?.user_version;
    closeDatabase();
    await initDatabase(dbPath); // 重新打开
    const v2 = get<{ user_version: number }>('PRAGMA user_version')?.user_version;
    expect(v1).toBe(SCHEMA_VERSION);
    expect(v2).toBe(SCHEMA_VERSION);
  });

  it('v4→v5：knowledge_files 与 folders 补 deleted_at 列，已有数据为 NULL', async () => {
    // 手工构造 v4 老库（无 deleted_at）
    const raw = new Database(dbPath);
    raw.exec(
      `CREATE TABLE knowledge_files (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         file_name TEXT NOT NULL, source_path TEXT NOT NULL, md_path TEXT NOT NULL,
         zip_archive_path TEXT NOT NULL, file_type TEXT NOT NULL,
         create_time INTEGER NOT NULL, last_sync_time INTEGER NOT NULL DEFAULT 0,
         folder_id INTEGER DEFAULT NULL, sha256 TEXT, status TEXT NOT NULL DEFAULT 'ready'
       );
       CREATE TABLE folders (
         id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
         parent_id INTEGER, create_time INTEGER NOT NULL
       );
       CREATE TABLE operation_log (
         id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT,
         time INTEGER NOT NULL, level TEXT NOT NULL DEFAULT 'info', meta TEXT
       );
       CREATE TABLE file_versions (
         id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL,
         version INTEGER NOT NULL, content TEXT NOT NULL, create_time INTEGER NOT NULL
       );
       CREATE TABLE vector_chunks (
         id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL,
         chunk_text TEXT NOT NULL, vector_blob BLOB NOT NULL
       );`
    );
    raw.prepare(`INSERT INTO knowledge_files (file_name, source_path, md_path, zip_archive_path, file_type, create_time)
                 VALUES ('a.md', '/a.md', '/a.md.m', '/a.zip', 'md', 123)`).run();
    raw.prepare(`INSERT INTO folders (name, parent_id, create_time) VALUES ('work', NULL, 1)`).run();
    raw.pragma('user_version = 4');
    raw.close();

    await initDatabase(dbPath);

    const kfCols = all<{ name: string }>('PRAGMA table_info(knowledge_files)').map((c) => c.name);
    expect(kfCols).toContain('deleted_at');
    const foCols = all<{ name: string }>('PRAGMA table_info(folders)').map((c) => c.name);
    expect(foCols).toContain('deleted_at');
    // 已有数据 deleted_at 为 NULL（未删除）
    const f = get<{ deleted_at: number | null }>('SELECT deleted_at FROM knowledge_files WHERE file_name = ?', ['a.md']);
    expect(f?.deleted_at).toBeNull();
    const fo = get<{ deleted_at: number | null }>('SELECT deleted_at FROM folders WHERE name = ?', ['work']);
    expect(fo?.deleted_at).toBeNull();
    const v = get<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(SCHEMA_VERSION);
  });

  it('deleted_at 列幂等：重复 initDatabase 不报错', async () => {
    await initDatabase(dbPath);
    closeDatabase();
    await initDatabase(dbPath);
    const cols = all<{ name: string }>('PRAGMA table_info(knowledge_files)').map((c) => c.name);
    expect(cols).toContain('deleted_at');
  });
});

describe('v5 兼容性', () => {
  it('v5 库用不引用 deleted_at 的旧查询路径访问正常（多列不影响 INSERT/SELECT *）', async () => {
    await initDatabase(dbPath);
    // 旧路径：不指定 deleted_at 的 INSERT（应为 NULL）
    await run(
      `INSERT INTO knowledge_files (file_name, source_path, md_path, zip_archive_path, file_type, create_time)
       VALUES ('old.md', '/old.md', '/old.md.m', '/old.zip', 'md', 123)`
    );
    // 旧 SELECT * 不感知 deleted_at
    const row = get<{ file_name: string; deleted_at: number | null }>(
      'SELECT * FROM knowledge_files WHERE file_name = ?', ['old.md']
    );
    expect(row?.file_name).toBe('old.md');
    expect(row?.deleted_at).toBeNull();
  });
});

describe('v6 FTS5 幂等', () => {
  it('v6 库重复 init 不 double-insert chunks_fts（行数 = vector_chunks 行数）', async () => {
    await initDatabase(dbPath);
    // 插入一个 chunk
    await run(`INSERT INTO knowledge_files (file_name, source_path, md_path, zip_archive_path, file_type, create_time)
               VALUES ('x.md', '/x.md', '/x.md.m', '/x.zip', 'md', 1)`);
    const fid = lastInsertId();
    await run(`INSERT INTO vector_chunks (file_id, chunk_text, vector_blob) VALUES (?, 'hello fts', x'00')`, [fid]);
    const before = get<{ n: number }>('SELECT COUNT(*) AS n FROM chunks_fts');
    const vcCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM vector_chunks');
    expect(before?.n).toBe(vcCount?.n);
    // 重复 init
    closeDatabase();
    await initDatabase(dbPath);
    const after = get<{ n: number }>('SELECT COUNT(*) AS n FROM chunks_fts');
    expect(after?.n).toBe(vcCount?.n);
  });
});
