import { startEngine } from './engine';
import { ragSearch } from './rag/rag-search';
import { registerIpcHandlers } from './ipc-handler';

// DSH 对外暴露的插件 API 命名空间（宿主注入；测试环境可为空桩）
declare global {
  interface Window {
    DSH?: any;
  }
}

/**
 * 桌面/独立宿主入口：初始化引擎并注册 IPC 与宿主钩子。
 *
 * 作为 DSH 组合包加载时，由 `./bundle` 入口（dsh-bundle.ts）接管，本文件
 * 不会被 cordis Loader 加载，因此可以保留 Electron 主进程相关逻辑。
 * @returns 引擎就绪后 resolve。
 */
export async function activate(): Promise<void> {
  const bridge = await startEngine();
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

  return;
}
