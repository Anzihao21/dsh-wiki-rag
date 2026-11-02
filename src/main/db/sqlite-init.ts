import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

let db: Database.Database | null = null;
let dbPath = '';

// 建表 SQL：知识库主表、文件夹表、向量切片表、操作日志表
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
    folder_id INTEGER DEFAULT NULL
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
    time INTEGER NOT NULL
);
`;

export function getDbPath(): string {
  return dbPath;
}

/**
 * 初始化数据库连接并建表。
 * @param filePath 数据库文件路径，默认放到 DSH 数据目录
 */
export async function initDatabase(filePath?: string): Promise<void> {
  dbPath = filePath || path.join(process.cwd(), 'dsh-wiki-rag.db');
  if (db) {
    return;
  }
  // 确保目录存在
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // WAL 下 synchronous=NORMAL 兼顾安全与吞吐；wal_autocheckpoint 让 SQLite 每 ~1000 页自动回收
  db.pragma('synchronous = NORMAL');
  db.pragma('wal_autocheckpoint = 1000');
  db.pragma('foreign_keys = ON');

  runSchema();
}

/** 逐条执行建表语句 */
function runSchema(): void {
  const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    run(stmt);
  }
  migrate();
}

/**
 * 幂等迁移：对已存在的旧库补列。
 * - knowledge_files.folder_id：CREATE TABLE IF NOT EXISTS 不会给老表补列，
 *   这里用 ALTER TABLE ADD COLUMN，包 try/catch（列已存在则忽略）。
 */
function migrate(): void {
  try {
    db!.prepare('ALTER TABLE knowledge_files ADD COLUMN folder_id INTEGER DEFAULT NULL').run();
  } catch {
    // 列已存在（新库建表时已带 folder_id），忽略
  }
}

function getDb(): Database.Database {
  if (!db) {
    throw new Error('数据库尚未初始化，请先调用 initDatabase()');
  }
  return db;
}

/** 执行 SQL（同步） */
export function run(sql: string, params: any[] = []): void {
  getDb().prepare(sql).run(...params);
}

/** 查询单行（同步） */
export function get<T>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

/** 查询多行（同步） */
export function all<T>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/** 返回最后插入的自增 id（同步） */
export function lastInsertId(): number {
  const row = get<{ id: number }>('SELECT last_insert_rowid() AS id');
  return row?.id ?? 0;
}

/**
 * 手动触发 WAL checkpoint（TRUNCATE 模式把 -wal 文件归零并截断）。
 * 长运行进程可定期调用，避免 -wal 无限增长；关闭数据库前也会自动调用一次。
 */
export function walCheckpoint(mode: 'PASSIVE' | 'FULL' | 'TRUNCATE' = 'TRUNCATE'): void {
  if (!db) return;
  try {
    db.pragma(`wal_checkpoint(${mode})`);
  } catch {
    // 非 WAL 模式或库已关闭时忽略
  }
}

/** 是否已初始化（便于测试 / 重复 init 幂等判断） */
export function isDbInitialized(): boolean {
  return db !== null;
}

/** 关闭数据库连接（同步）：先 checkpoint 再 close，避免 -wal 残留 */
export function closeDatabase(): void {
  if (!db) {
    return;
  }
  try {
    // 关闭前把 WAL 落盘并截断，防止进程退出后 -wal 文件保留
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore
  }
  try {
    db.close();
  } catch {
    // ignore
  }
  db = null;
}
