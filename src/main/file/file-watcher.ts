import chokidar, { type FSWatcher } from 'chokidar';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';

export type WatchCallback = (change: {
  fileId: number;
  fileName: string;
  sourcePath: string;
}) => void;

/**
 * 文件监听模块：使用 chokidar 监听知识库内各条目的源目录路径。
 * 源文件被外部软件修改时捕获变更事件，交由上层触发 diff 弹窗。
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private callback: WatchCallback | null = null;
  private watchedPaths = new Set<string>();

  setCallback(cb: WatchCallback): void {
    this.callback = cb;
  }

  /** 启动对某知识条目的源文件监听 */
  watchSource(fileId: number): void {
    const record = getKnowledgeFileById(fileId);
    record.then((file) => {
      if (!file || this.watchedPaths.has(file.source_path)) {
        return;
      }
      this.watchedPaths.add(file.source_path);
      if (!this.watcher) {
        this.watcher = chokidar.watch([], { ignoreInitial: true });
        this.watcher.on('change', (p) => {
          writeLog('watch-change', `源文件变更: ${p}`);
          this.callback?.({
            fileId,
            fileName: file.file_name,
            sourcePath: p
          });
        });
        this.watcher.on('error', (e) => {
          writeLog('watch-error', (e as Error).message);
        });
      }
      this.watcher.add(file.source_path);
    });
  }

  /** 停止全部监听 */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.watchedPaths.clear();
    }
  }
}
