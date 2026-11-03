import { promises as fs } from 'fs';
import path from 'path';
import { initDatabase, getDbPath } from './db/sqlite-init';
import { FileImporter } from './file/file-importer';
import { FileWatcher } from './file/file-watcher';
import { ragSearch } from './rag/rag-search';
import { registerIpcHandlers, type IpcBridge } from './ipc-handler';
import { writeLog } from './db/log-db';
import { DEFAULT_SETTINGS, type PluginSettings } from './types';

// DSH 对外暴露的插件 API 命名空间（宿主注入；测试环境可为空桩）
declare global {
  interface Window {
    DSH?: any;
  }
}

const SETTINGS_FILE = 'dsh-wiki-rag-settings.json';
const DATA_DIR = path.join(process.cwd(), '.dsh-wiki-rag');
const DEFAULT_MD_DIR = path.join(DATA_DIR, 'md');
const DEFAULT_ZIP_DIR = path.join(DATA_DIR, 'zip');
const DEFAULT_SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');

let settings: PluginSettings = { ...DEFAULT_SETTINGS };
let bridge: IpcBridge;

async function loadSettings(): Promise<PluginSettings> {
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

async function saveSettingsFile(s: PluginSettings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, SETTINGS_FILE), JSON.stringify(s, null, 2), 'utf-8');
}

/** 插件入口启动：初始化 DB、注册 IPC、注册 DSH 钩子 */
export async function activate(): Promise<void> {
  await initDatabase(path.join(DATA_DIR, 'dsh-wiki-rag.db'));
  await loadSettings();

  bridge = {
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

  const handlers = registerIpcHandlers(bridge);

  // 注册 DSH 插件钩子
  const dsh = (globalThis as any).DSH;
  if (dsh) {
    // 5.1 左侧菜单栏入口
    dsh.api.sidebar.register?.({
      id: 'dsh-wiki-rag',
      name: 'Wiki知识库',
      icon: './assets/icon.svg',
      onClick: () => dsh.api.window.openPluginWindow('dsh-wiki-rag')
    });

    // 5.2 文件右键菜单【从源目录更新】
    dsh.api.contextMenu?.registerFileItem?.({
      label: '从源目录更新',
      onClick: async (fileItem: any) => {
        await handlers['wiki:triggerSync'](
          fileItem.id,
          fileItem.zipArchivePath,
          fileItem.mdPath
        );
      }
    });

    // 5.3 Agent 工具注册（对话调用知识库检索）
    dsh.api.agent.registerTool?.({
      name: 'wiki_rag_search',
      description: '检索Wiki知识库内文档资料',
      parameters: { query: 'string' },
      handler: async ({ query }: { query: string }) => {
        return await ragSearch(query);
      }
    });

    // 桥接 IPC 到 Electron ipcMain（宿主环境）
    if (dsh.api.ipcMain) {
      for (const [channel, fn] of Object.entries(handlers)) {
        dsh.api.ipcMain.handle?.(channel, (_evt: any, ...args: any[]) => fn(...args));
      }
    }
  } else {
    // 无宿主环境：把 handlers 挂到全局，便于测试调用
    (globalThis as any).__WIKI_HANDLERS__ = handlers;
  }

  await writeLog('plugin-activate', `DB=${getDbPath()}`);
  return;
}
