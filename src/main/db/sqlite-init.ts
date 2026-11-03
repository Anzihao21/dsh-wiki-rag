import { promises as fs } from 'fs';
import path from 'path';

// 纯 JS JSON 文件存储（替代 SQLite，零原生依赖，Windows 直接可用）
interface DBData {
  knowledge_files: any[];
  folders: any[];
  vector_chunks: any[];
  operation_log: any[];
  settings: Record<string, any>;
  _autoinc: {
    knowledge_files: number;
    folders: number;
    vector_chunks: number;
    operation_log: number;
  };
}

let dbPath = '';
let data: DBData = {
  knowledge_files: [],
  folders: [],
  vector_chunks: [],
  operation_log: [],
  settings: {},
  _autoinc: { knowledge_files: 0, folders: 0, vector_chunks: 0, operation_log: 0 },
};
let dirty = false;

export function getDbPath(): string {
  return dbPath;
}

export async function initDatabase(filePath?: string): Promise<void> {
  dbPath = filePath || path.join(process.cwd(), '.dsh-wiki-rag', 'db.json');
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });

  try {
    const raw = await fs.readFile(dbPath, 'utf-8');
    data = JSON.parse(raw);
    if (!data.knowledge_files) data.knowledge_files = [];
    if (!data.folders) data.folders = [];
    if (!data.vector_chunks) data.vector_chunks = [];
    if (!data.operation_log) data.operation_log = [];
    if (!data.settings) data.settings = {};
    if (!data._autoinc) data._autoinc = { knowledge_files: 0, folders: 0, vector_chunks: 0, operation_log: 0 };
  } catch {
    data = {
      knowledge_files: [], folders: [], vector_chunks: [], operation_log: [], settings: {},
      _autoinc: { knowledge_files: 0, folders: 0, vector_chunks: 0, operation_log: 0 },
    };
  }
}

async function save(): Promise<void> {
  if (!dirty) return;
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  dirty = false;
}

export function run(sql: string, params: any[] = []): void {
  dirty = true;
  const s = sql.trim();

  // INSERT INTO knowledge_files
  if (s.startsWith('INSERT INTO knowledge_files')) {
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
      folder_id: params[7] || null,
    });
    return;
  }

  // INSERT INTO folders
  if (s.startsWith('INSERT INTO folders')) {
    const id = ++data._autoinc.folders;
    data.folders.push({
      id,
      name: params[0],
      parent_id: params[1] || null,
      create_time: params[2],
    });
    return;
  }

  // INSERT INTO vector_chunks
  if (s.startsWith('INSERT INTO vector_chunks')) {
    const id = ++data._autoinc.vector_chunks;
    data.vector_chunks.push({
      id,
      file_id: params[0],
      chunk_text: params[1],
      vector_blob: params[2],
    });
    return;
  }

  // INSERT INTO operation_log
  if (s.startsWith('INSERT INTO operation_log')) {
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
  if (s.startsWith('DELETE FROM knowledge_files WHERE id = ?')) {
    data.knowledge_files = data.knowledge_files.filter((r) => r.id !== params[0]);
    data.vector_chunks = data.vector_chunks.filter((r) => r.file_id !== params[0]);
    return;
  }

  // DELETE FROM vector_chunks WHERE file_id = ?
  if (s.startsWith('DELETE FROM vector_chunks WHERE file_id = ?')) {
    data.vector_chunks = data.vector_chunks.filter((r) => r.file_id !== params[0]);
    return;
  }

  // UPDATE knowledge_files SET ... WHERE id = ?
  if (s.startsWith('UPDATE knowledge_files SET')) {
    const row = data.knowledge_files.find((r) => r.id === params[params.length - 1]);
    if (row) {
      // 简单处理：根据 SET 子句更新字段
      if (s.includes('last_sync_time')) row.last_sync_time = params[0];
      if (s.includes('file_name')) row.file_name = params[0];
      if (s.includes('md_path')) row.md_path = params[0];
      if (s.includes('zip_archive_path')) row.zip_archive_path = params[0];
      if (s.includes('folder_id')) row.folder_id = params[0];
    }
    return;
  }

  // UPDATE folders SET name = ? WHERE id = ?
  if (s.startsWith('UPDATE folders SET')) {
    const row = data.folders.find((r) => r.id === params[params.length - 1]);
    if (row && s.includes('name')) row.name = params[0];
    return;
  }
}

export function get<T>(sql: string, params: any[] = []): T | undefined {
  const s = sql.trim();

  if (s.startsWith('SELECT * FROM knowledge_files WHERE id = ?')) {
    return data.knowledge_files.find((r) => r.id === params[0]) as T | undefined;
  }

  if (s.startsWith('SELECT * FROM folders WHERE id = ?')) {
    return data.folders.find((r) => r.id === params[0]) as T | undefined;
  }

  if (s.includes('last_insert_rowid')) {
    return { id: data._autoinc.knowledge_files } as T;
  }

  if (s.startsWith('SELECT * FROM settings WHERE key = ?')) {
    return { key: params[0], value: data.settings[params[0]] } as T;
  }

  return undefined;
}

export function all<T>(sql: string, params: any[] = []): T[] {
  const s = sql.trim();

  if (s.startsWith('SELECT * FROM knowledge_files')) {
    return [...data.knowledge_files].sort((a, b) => b.create_time - a.create_time) as T[];
  }

  if (s.startsWith('SELECT * FROM folders')) {
    return [...data.folders] as T[];
  }

  if (s.startsWith('SELECT * FROM vector_chunks WHERE file_id = ?')) {
    return data.vector_chunks.filter((r) => r.file_id === params[0]) as T[];
  }

  if (s.startsWith('SELECT * FROM operation_log')) {
    return [...data.operation_log].sort((a, b) => b.time - a.time) as T[];
  }

  if (s.startsWith('SELECT * FROM settings')) {
    return Object.entries(data.settings).map(([key, value]) => ({ key, value })) as T[];
  }

  return [];
}

export function lastInsertId(): number {
  return data._autoinc.knowledge_files;
}

export async function closeDatabase(): Promise<void> {
  await save();
}

export async function walCheckpoint(): Promise<void> {
  await save();
}
