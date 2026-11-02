import type { PluginSettings, DiffResult } from './types';
import { FileImporter } from './file/file-importer';
import { FileWatcher } from './file/file-watcher';
import { triggerSourceSync, applySourceUpdate } from './file/source-sync';
import { ragSearch } from './rag/rag-search';
import { createSnapshot, listSnapshots } from './snapshot/snapshot-backup';
import { listKnowledgeFiles, deleteKnowledgeFile, getKnowledgeFileById } from './db/knowledge-db';
import { promises as fs } from 'fs';
import { listLogs } from './db/log-db';
import { writeLog } from './db/log-db';
import { deleteChunksByFileId } from './db/vector-db';
import { deleteArchive } from './file/zip-archive';
import { initDatabase } from './db/sqlite-init';

/**
 * IPC 事件统一注册层。
 * UI（渲染进程）↔ 主进程之间所有请求经由这里转发，
 * 渲染进程禁止直接读写文件与数据库。
 */

export interface IpcBridge {
  ctx: {
    mdDir: string;
    zipDir: string;
    chunkSize: number;
    chunkOverlap: number;
    webMode: 'intranet' | 'extranet';
    webTimeout: number;
  };
  importer: FileImporter;
  watcher: FileWatcher;
  reindex: (fileId: number, text: string) => Promise<void>;
  applyUpdate: (fileId: number, newText: string) => Promise<void>;
  settings: () => Promise<PluginSettings>;
  saveSettings: (s: PluginSettings) => Promise<void>;
}

/**
 * 统一注册所有 IPC 处理函数。
 * 适配 Electron ipcMain；在无 Electron 环境（测试）时退化为一个
 * 可直接调用的 handlers 对象。
 */
export function registerIpcHandlers(bridge: IpcBridge): Record<string, Function> {
  const handlers: Record<string, Function> = {};

  handlers['wiki:listFiles'] = async () => listKnowledgeFiles();
  handlers['wiki:readMd'] = async (id: number) => {
    const file = await getKnowledgeFileById(id);
    if (!file) return '';
    try {
      return await fs.readFile(file.md_path, 'utf-8');
    } catch {
      return '';
    }
  };
  handlers['wiki:importFile'] = async (path: string) => bridge.importer.importLocalFile(path);
  handlers['wiki:importFolder'] = async (folder: string) => bridge.importer.importFolder(folder);
  handlers['wiki:importUrl'] = async (url: string) =>
    bridge.importer.importUrl(url, bridge.ctx.webMode === 'intranet');
  handlers['wiki:importNote'] = async (title: string, text: string) =>
    bridge.importer.importNote(title, text);
  handlers['wiki:deleteFile'] = async (id: number) => {
    const file = await getKnowledgeFileById(id);
    await deleteChunksByFileId(id);
    if (file) {
      await deleteArchive(file.zip_archive_path);
    }
    await deleteKnowledgeFile(id);
    await writeLog('delete', `删除条目 id=${id}`);
  };
  handlers['wiki:editMd'] = async (id: number, text: string) => {
    await bridge.applyUpdate(id, text);
  };
  handlers['wiki:triggerSync'] = async (id: number, zipPath: string, mdPath: string) =>
    triggerSourceSync(id, zipPath, mdPath);
  handlers['wiki:applySync'] = async (id: number, newText: string) => {
    await bridge.applyUpdate(id, newText);
  };
  handlers['wiki:ragSearch'] = async (query: string, topK?: number) => ragSearch(query, topK);
  handlers['wiki:createSnapshot'] = async () =>
    createSnapshot(bridge.ctx.mdDir, bridge.ctx.zipDir, 'snapshots');
  handlers['wiki:listSnapshots'] = async () => listSnapshots('snapshots');
  handlers['wiki:listLogs'] = async (limit?: number) => listLogs(limit);
  handlers['wiki:getSettings'] = async () => bridge.settings();
  handlers['wiki:saveSettings'] = async (s: PluginSettings) => bridge.saveSettings(s);
  handlers['wiki:watchSource'] = async (id: number) => bridge.watcher.watchSource(id);

  return handlers;
}
