// 全局共享类型定义
export type FileType = 'pdf' | 'docx' | 'md' | 'url' | 'note' | 'txt' | 'sheet' | 'pptx';

export interface KnowledgeFile {
  id: number;
  file_name: string;
  source_path: string;
  md_path: string;
  zip_archive_path: string;
  file_type: FileType;
  create_time: number;
  last_sync_time: number;
  folder_id?: number | null;
}

/** 知识库树形文件夹 */
export interface KnowledgeFolder {
  id: number;
  name: string;
  parent_id: number | null;
  create_time: number;
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
  // 以下为检索溯源补充字段（可选，向后兼容）
  md_path?: string;
  chunk_id?: number;
  chunk_index?: number;
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
  /** 切片模式：fixed=固定窗口，heading=按标题分层 */
  chunkMode: 'fixed' | 'heading';
  autoSnapshot: boolean;
  /** 快照保留份数 */
  snapshotKeep: number;
  // ---- Embedding 配置 ----
  embeddingProvider: 'local' | 'openai' | 'fallback';
  embeddingModelPath: string;      // local provider：本地模型目录路径
  embeddingOpenAIBaseURL: string;  // openai provider：API 地址
  embeddingOpenAIAPIKey: string;  // openai provider：API Key
  embeddingOpenAIModel: string;   // openai provider：模型名（如 text-embedding-3-small）
  // ---- Rerank 配置 ----
  rerankProvider: 'local' | 'openai' | 'none';
  rerankModelPath: string;         // local provider：本地 cross-encoder 模型目录
  rerankOpenAIBaseURL: string;     // openai provider：rerank API 地址
  rerankOpenAIAPIKey: string;
  rerankOpenAIModel: string;       // 如 rerank-multilingual-v3
  rerankTopK: number;              // rerank 后返回条数
}

export const DEFAULT_SETTINGS: PluginSettings = {
  mdStoragePath: '',
  zipStoragePath: '',
  webMode: 'extranet',
  webTimeout: 30000,
  chunkSize: 800,
  chunkOverlap: 120,
  chunkMode: 'fixed',
  autoSnapshot: false,
  snapshotKeep: 3,
  embeddingProvider: 'fallback',
  embeddingModelPath: '',
  embeddingOpenAIBaseURL: 'https://api.openai.com/v1',
  embeddingOpenAIAPIKey: '',
  embeddingOpenAIModel: 'text-embedding-3-small',
  rerankProvider: 'none',
  rerankModelPath: '',
  rerankOpenAIBaseURL: 'https://api.openai.com/v1',
  rerankOpenAIAPIKey: '',
  rerankOpenAIModel: 'rerank-multilingual-v3',
  rerankTopK: 5,
};
