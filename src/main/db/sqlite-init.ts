import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

let db: Database.Database | null = null;
let dbPath = '';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    source_path TEXT NOT NULL,
    md_path TEXT NOT NULL,
    zip_archive_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    create_time INTEGER NOT NULL,
    last_sync_time INTEGER NOT NULL DEFAULT 0,
    folder_id INTEGER DEFAULT NULL,
    sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    create_time INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS vector_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    FOREIGN KEY(file_id) REFERENCES knowledge_files(id)
);

CREATE INDEX IF NOT EXISTS idx_vector_file_id ON vector_chunks(file_id);

-- FTS5 trigram 全文索引（中文友好；external content 模式，触发器维护）
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    chunk_text,
    content='vector_chunks',
    content_rowid='id',
    tokenize='trigram'
);

CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    time INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    meta TEXT
);

CREATE TABLE IF NOT EXISTS file_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    create_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fv_file ON file_versions(file_id, version);
`;

export function getDbPath(): string {
  return dbPath;
}

export function isDbInitialized(): boolean {
  return db !== null;
}

export async function initDatabase(filePath?: string): Promise<void> {
  dbPath = filePath || path.join(process.cwd(), '.dsh-wiki-rag', 'wiki.db');
  if (db) return;
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });

  // 打开 + 初始化 schema 可能因 DB 损坏/磁盘错误失败；失败时备份损坏文件并重建空库
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runSchema();
    migrate();
  } catch (e) {
    // 关闭可能已部分打开的连接
    try { db?.close(); } catch { /* ignore */ }
    db = null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dbPath}.corrupt-${stamp}`;
    try {
      await fs.rename(dbPath, backupPath);
    } catch {
      // 源文件已不存在或不可改名：忽略，直接建新库
    }
    // 顺手把 -wal / -shm 一并清走，避免与新库混在一起
    for (const suffix of ['-wal', '-shm']) {
      await fs.rm(`${dbPath}${suffix}`, { force: true }).catch(() => {});
    }
    console.warn(`[dsh-wiki-rag] DB 初始化失败，已备份损坏文件到 ${backupPath} 并重建空库: ${(e as Error).message}`);
    // 重建空库（二次失败直接抛，让宿主知道这次真救不回来）
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runSchema();
    migrate();
  }
}

/** 当前 schema 版本（user_version） */
export const SCHEMA_VERSION = 6;

/**
 * 迁移清单：索引 i 对应「把库从版本 i+1 升到 i+2」。
 * 迁移必须幂等、只做增量（新增列/表/索引），不破坏已有数据。
 */
const MIGRATIONS: Array<() => void> = [
  // v1 → v2：knowledge_files 补 sha256（内容哈希，供冲突检测/去重）与 status（索引状态 ready/stale/error）
  () => {
    ensureColumn('knowledge_files', 'sha256', 'TEXT');
    ensureColumn('knowledge_files', 'status', "TEXT NOT NULL DEFAULT 'ready'");
  },
  // v2 → v3：operation_log 加 level（info/warn/error）与 meta（结构化 JSON），支持结构化日志/过滤
  () => {
    ensureColumn('operation_log', 'level', "TEXT NOT NULL DEFAULT 'info'");
    ensureColumn('operation_log', 'meta', 'TEXT');
  },
  // v3 → v4：file_versions 历史版本表（每文件最多保留 3 个历史版本，人工编辑保存时滚动写入）
  () => {
    getDb().prepare(`CREATE TABLE IF NOT EXISTS file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      create_time INTEGER NOT NULL
    )`).run();
    getDb().prepare(`CREATE INDEX IF NOT EXISTS idx_fv_file ON file_versions(file_id, version)`).run();
  },
  // v4 → v5：回收站软删除——knowledge_files / folders 加 deleted_at（NULL=未删除，否则为删除时间戳）
  () => {
    ensureColumn('knowledge_files', 'deleted_at', 'INTEGER');
    ensureColumn('folders', 'deleted_at', 'INTEGER');
  },
  // v5 → v6：FTS5 trigram 全文索引（中文友好）；external content 模式，需触发器维护
  () => {
    getDb().prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      chunk_text, content='vector_chunks', content_rowid='id', tokenize='trigram'
    )`).run();
    // 全量回填（external content 表初始为空）
    getDb().prepare(`INSERT INTO chunks_fts(rowid, chunk_text) SELECT id, chunk_text FROM vector_chunks`).run();
    // 触发器：INSERT/DELETE/UPDATE 同步 FTS
    getDb().prepare(`CREATE TRIGGER IF NOT EXISTS vector_chunks_ai AFTER INSERT ON vector_chunks BEGIN
      INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END`).run();
    getDb().prepare(`CREATE TRIGGER IF NOT EXISTS vector_chunks_ad AFTER DELETE ON vector_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
    END`).run();
    getDb().prepare(`CREATE TRIGGER IF NOT EXISTS vector_chunks_au AFTER UPDATE ON vector_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
      INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END`).run();
  },
];

/** 若目标列不存在则补列（老库升级，CREATE IF NOT EXISTS 不会重建已有表） */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    getDb().prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
  }
}

function migrate(): void {
  const current = getDb().pragma('user_version', { simple: true }) as number;
  for (let i = current; i < SCHEMA_VERSION; i++) {
    MIGRATIONS[i - 1]?.();
  }
  getDb().pragma(`user_version = ${SCHEMA_VERSION}`);
}

function runSchema(): void {
  const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    run(stmt);
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error('数据库尚未初始化，请先调用 initDatabase()');
  return db;
}

export function run(sql: string, params: any[] = []): void {
  getDb().prepare(sql).run(...params);
}

/** 在单个事务中执行 fn（BEGIN…COMMIT/ROLLBACK 由 better-sqlite3 管理），批量写入显著减少提交开销 */
export function runInTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

export function get<T>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function lastInsertId(): number {
  const row = get<{ id: number }>('SELECT last_insert_rowid() AS id');
  return row?.id ?? 0;
}

export function closeDatabase(): void {
  if (!db) return;
  db.close();
  db = null;
}

export function walCheckpoint(mode: 'PASSIVE' | 'FULL' | 'TRUNCATE' = 'TRUNCATE'): void {
  if (!db) return;
  db.pragma(`wal_checkpoint(${mode})`);
}
