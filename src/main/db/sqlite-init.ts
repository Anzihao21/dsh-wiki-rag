import { promises as fs } from 'fs';
import path from 'path';

// 简单 JSON 文件存储（替代 SQLite，纯 JS 实现，无需编译）
interface DBData {
  knowledge_files: any[];
  vector_chunks: any[];
  operation_log: any[];
  _autoinc: {
    knowledge_files: number;
    vector_chunks: number;
    operation_log: number;
  };
}

let dbPath = '';
let data: DBData = {
  knowledge_files: [],
  vector_chunks: [],
  operation_log: [],
  _autoinc: {
    knowledge_files: 0,
    vector_chunks: 0,
    operation_log: 0,
  },
};
let dirty = false;

export function getDbPath(): string {
  return dbPath;
}

/**
 * 初始化数据库（JSON 文件）
 */
export async function initDatabase(filePath?: string): Promise<void> {
  dbPath = filePath || path.join(process.cwd(), 'dsh-wiki-rag.db.json');
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });

  try {
    const raw = await fs.readFile(dbPath, 'utf-8');
    data = JSON.parse(raw);
    // 确保表存在
    if (!data.knowledge_files) data.knowledge_files = [];
    if (!data.vector_chunks) data.vector_chunks = [];
    if (!data.operation_log) data.operation_log = [];
    if (!data._autoinc) data._autoinc = { knowledge_files: 0, vector_chunks: 0, operation_log: 0 };
  } catch {
    // 文件不存在，用空数据
    data = {
      knowledge_files: [],
      vector_chunks: [],
      operation_log: [],
      _autoinc: { knowledge_files: 0, vector_chunks: 0, operation_log: 0 },
    };
  }
}

/** 持久化到文件 */
async function save(): Promise<void> {
  if (!dirty) return;
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  dirty = false;
}

/** 模拟 SQL 执行（简化版，只支持 INSERT/SELECT/DELETE/WHERE id=?） */
export function run(sql: string, params: any[] = []): void {
  dirty = true;

  // INSERT INTO knowledge_files (...) VALUES (?, ?, ...)
  if (sql.startsWith('INSERT INTO knowledge_files')) {
    const id = ++data._autoinc.knowledge_files;
    data.knowledge_files.push({
      id,
      file_name: params[0],
      source_path: params[1],
      md_path: params[2],
      zip_archive_path: params[3],
      file_type: params[4],
      create_time: params[5],
      last_sync_time: params[6] || 0,
    });
    return;
  }

  // INSERT INTO vector_chunks (...) VALUES (?, ?, ...)
  if (sql.startsWith('INSERT INTO vector_chunks')) {
    const id = ++data._autoinc.vector_chunks;
    data.vector_chunks.push({
      id,
      file_id: params[0],
      chunk_text: params[1],
      vector_blob: params[2],
    });
    return;
  }

  // INSERT INTO operation_log (...) VALUES (?, ?, ...)
  if (sql.startsWith('INSERT INTO operation_log')) {
    const id = ++data._autoinc.operation_log;
    data.operation_log.push({
      id,
      action: params[0],
      detail: params[1],
      time: params[2],
    });
    return;
  }

  // DELETE FROM knowledge_files WHERE id = ?
  if (sql.startsWith('DELETE FROM knowledge_files WHERE id = ?')) {
    data.knowledge_files = data.knowledge_files.filter((r) => r.id !== params[0]);
    // 级联删除 vector_chunks
    data.vector_chunks = data.vector_chunks.filter((r) => r.file_id !== params[0]);
    return;
  }

  // UPDATE knowledge_files SET last_sync_time = ? WHERE id = ?
  if (sql.startsWith('UPDATE knowledge_files SET last_sync_time')) {
    const row = data.knowledge_files.find((r) => r.id === params[1]);
    if (row) row.last_sync_time = params[0];
    return;
  }
}

/** 查询单行 */
export function get<T>(sql: string, params: any[] = []): T | undefined {
  // SELECT * FROM knowledge_files WHERE id = ?
  if (sql.startsWith('SELECT * FROM knowledge_files WHERE id = ?')) {
    return data.knowledge_files.find((r) => r.id === params[0]) as T | undefined;
  }

  // SELECT last_insert_rowid() AS id
  if (sql.includes('last_insert_rowid')) {
    return { id: data._autoinc.knowledge_files } as T;
  }

  return undefined;
}

/** 查询多行 */
export function all<T>(sql: string, params: any[] = []): T[] {
  // SELECT * FROM knowledge_files ORDER BY create_time DESC
  if (sql.startsWith('SELECT * FROM knowledge_files')) {
    return [...data.knowledge_files].sort((a, b) => b.create_time - a.create_time) as T[];
  }

  // SELECT * FROM vector_chunks WHERE file_id = ?
  if (sql.startsWith('SELECT * FROM vector_chunks WHERE file_id = ?')) {
    return data.vector_chunks.filter((r) => r.file_id === params[0]) as T[];
  }

  // SELECT * FROM operation_log ORDER BY time DESC
  if (sql.startsWith('SELECT * FROM operation_log')) {
    return [...data.operation_log].sort((a, b) => b.time - a.time) as T[];
  }

  return [];
}

/** 返回最后插入的自增 id */
export function lastInsertId(): number {
  return data._autoinc.knowledge_files;
}

/** 关闭数据库（保存到文件） */
export async function closeDatabase(): Promise<void> {
  await save();
}
