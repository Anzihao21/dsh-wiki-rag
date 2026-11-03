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
