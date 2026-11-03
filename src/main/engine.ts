import { promises as fs } from 'fs';
import path from 'path';
import { initDatabase, getDbPath } from './db/sqlite-init';
import { FileImporter } from './file/file-importer';
import { FileWatcher } from './file/file-watcher';
import { initEmbedding } from './rag/embedding';
import { writeLog } from './db/log-db';
import { DEFAULT_SETTINGS, type PluginSettings } from './types';
import type { IpcBridge } from './ipc-handler';

/**
 * 引擎共享运行时状态与数据目录。
 *
 * 数据默认落在 `<cwd>/.dsh-wiki-rag` 下，与桌面端保持一致，便于复用已建索引。
 * 作为 DSH 组合包加载时，cwd 即宿主 profile 目录。
 */

export const DATA_DIR = path.join(process.cwd(), '.dsh-wiki-rag');
export const DEFAULT_MD_DIR = path.join(DATA_DIR, 'md');
export const DEFAULT_ZIP_DIR = path.join(DATA_DIR, 'zip');
export const DEFAULT_SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');

const SETTINGS_FILE = 'dsh-wiki-rag-settings.json';

let settings: PluginSettings = { ...DEFAULT_SETTINGS };

export function getSettings(): PluginSettings {
  return settings;
}

export async function loadSettings(): Promise<PluginSettings> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, SETTINGS_FILE), 'utf-8');
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  settings.mdStoragePath = settings.mdStoragePath || DEFAULT_MD_DIR;
  settings.zipStoragePath = settings.zipStoragePath || DEFAULT_ZIP_DIR;
  return settings;
}

export async function saveSettingsFile(s: PluginSettings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, SETTINGS_FILE), JSON.stringify(s, null, 2), 'utf-8');
}

/**
 * 启动 Wiki RAG 引擎：初始化数据库、加载设置、创建导入器/监听器、初始化
 * embedding。
 *
 * 供两种入口共用：
 * - 桌面/独立宿主入口 `index.ts` 的 `activate()`
 * - DSH cordis 组合包入口 `dsh-bundle.ts` 的 `apply()`
 *
 * 这样同一份引擎既能在桌面进程运行，也能作为 DSH 插件被加载。
 * @returns 已就绪的引擎桥接对象。
 */
export async function startEngine(): Promise<IpcBridge> {
  await initDatabase(path.join(DATA_DIR, 'dsh-wiki-rag.db'));
  settings = await loadSettings();

  const bridge: IpcBridge = {
    ctx: {
      mdDir: settings.mdStoragePath,
      zipDir: settings.zipStoragePath,
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
      webMode: settings.webMode,
      webTimeout: settings.webTimeout
    },
    importer: new FileImporter({
      mdDir: settings.mdStoragePath,
      zipDir: settings.zipStoragePath,
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
      chunkMode: settings.chunkMode,
      webTimeout: settings.webTimeout
    }),
    watcher: new FileWatcher(),
    reindex: (fileId, text) => bridge.importer.reindex(fileId, text),
    applyUpdate: async (fileId, newText) => {
      const { getKnowledgeFileById } = await import('./db/knowledge-db');
      const file = await getKnowledgeFileById(fileId);
      if (!file) return;
      await bridge.reindex(fileId, newText);
      await fs.mkdir(path.dirname(file.md_path), { recursive: true });
      await fs.writeFile(file.md_path, newText, 'utf-8');
    },
    settings: async () => settings,
    saveSettings: async (s) => {
      settings = { ...DEFAULT_SETTINGS, ...s };
      settings.mdStoragePath = settings.mdStoragePath || DEFAULT_MD_DIR;
      settings.zipStoragePath = settings.zipStoragePath || DEFAULT_ZIP_DIR;
      await saveSettingsFile(settings);
    }
  };

  await initEmbedding(settings);
  await writeLog('engine-start', `DB=${getDbPath()}`);
  return bridge;
}
