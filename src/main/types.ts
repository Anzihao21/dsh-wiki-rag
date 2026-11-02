// 全局共享类型定义
export type FileType = 'pdf' | 'docx' | 'md' | 'url' | 'note' | 'txt';

export interface KnowledgeFile {
  id: number;
  file_name: string;
  source_path: string;
  md_path: string;
  zip_archive_path: string;
  file_type: FileType;
  create_time: number;
  last_sync_time: number;
}

export interface VectorChunk {
  id: number;
  file_id: number;
  chunk_text: string;
  vector_blob: Buffer;
}

export interface OperationLog {
  id: number;
  action: string;
  detail: string;
  time: number;
}

export interface RagSearchResult {
  file_id: number;
  file_name: string;
  source_path: string;
  chunk_text: string;
  score: number;
}

export interface DiffResult {
  fileId: number;
  fileName: string;
  diff: Array<{
    added: boolean;
    removed: boolean;
    value: string;
  }>;
  oldText: string;
  newText: string;
}

export interface PluginSettings {
  mdStoragePath: string;
  zipStoragePath: string;
  webMode: 'intranet' | 'extranet';
  webTimeout: number;
  chunkSize: number;
  chunkOverlap: number;
  autoSnapshot: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  mdStoragePath: '',
  zipStoragePath: '',
  webMode: 'extranet',
  webTimeout: 30000,
  chunkSize: 800,
  chunkOverlap: 120,
  autoSnapshot: false
};
