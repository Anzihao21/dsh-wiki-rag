// 渲染进程 → 主进程的 IPC 调用封装。
// 实际 Electron 环境走 window.DSH.api.ipcRenderer.invoke；
// 测试/无宿主环境回退到全局 handlers。
import { t } from './i18n';

type HandlerMap = Record<string, (...args: any[]) => any>;

function getBridge(): { invoke: (ch: string, ...args: any[]) => Promise<any> } | null {
  const dsh = (window as any).DSH;
  if (dsh?.api?.ipcRenderer?.invoke) {
    return dsh.api.ipcRenderer;
  }
  const h: HandlerMap | undefined = (window as any).__WIKI_HANDLERS__;
  if (h) {
    return {
      invoke: (ch: string, ...args: any[]) => {
        const fn = h[ch];
        if (!fn) {
          return Promise.reject(new Error(t('ipc.unknownChannel').replace('{channel}', ch)));
        }
        return Promise.resolve(fn(...args));
      }
    };
  }
  return null;
}

export async function ipc<T = any>(channel: string, ...args: any[]): Promise<T> {
  const bridge = getBridge();
  if (!bridge) {
    throw new Error(t('ipc.bridgeUnavailable'));
  }
  return bridge.invoke(channel, ...args) as Promise<T>;
}
