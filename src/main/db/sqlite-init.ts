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
    status TEXT NOT NULL DEFAULT 'ready'
);

CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    create_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vector_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    FOREIGN KEY(file_id) REFERENCES knowledge_files(id)
);

CREATE INDEX IF NOT EXISTS idx_vector_file_id ON vector_chunks(file_id);

CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    time INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    meta TEXT
);
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

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runSchema();
  migrate();
}

/** 当前 schema 版本（user_version） */
export const SCHEMA_VERSION = 3;

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
