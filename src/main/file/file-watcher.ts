import chokidar, { type FSWatcher } from 'chokidar';
import { getKnowledgeFileById } from '../db/knowledge-db';
import { writeLog } from '../db/log-db';
import { isUncPath } from './name-auto-rename';
import { checkUncAccess } from './unc-retry';

export type WatchCallback = (change: {
  fileId: number;
  fileName: string;
  sourcePath: string;
}) => void;

/** 同一文件 N 毫秒内的连续 change 只触发一次回调（编辑器保存/写盘抖动） */
const DEBOUNCE_MS = 500;

/**
 * 文件监听模块：使用 chokidar 监听知识库内各条目的源目录路径。
 * - 单例 chokidar 实例，按 source_path 增量 add/unwatch
 * - 路径 → fileId/fileName 映射，change 事件按路径反查真实归属，避免闭包串号
 * - 同一路径 500ms 防抖，避免编辑器连续写盘触发多次 diff 弹窗
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private callback: WatchCallback | null = null;
  /** source_path → { fileId, fileName }；与 chokidar 内部监听集保持一致 */
  private watched = new Map<string, { fileId: number; fileName: string }>();
  /** 路径 → 防抖定时器 */
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  setCallback(cb: WatchCallback): void {
    this.callback = cb;
  }

  private ensureWatcher(): FSWatcher {
    if (!this.watcher) {
      this.watcher = chokidar.watch([], { ignoreInitial: true });
      this.watcher.on('change', (p) => this.handleChange(p));
      this.watcher.on('error', (e) => {
        writeLog('watch-error', (e as Error).message);
      });
    }
    return this.watcher;
  }

  private handleChange(p: string): void {
    writeLog('watch-change', `源文件变更: ${p}`);
    const meta = this.watched.get(p);
    if (!meta) return;
    // 防抖：同一路径 500ms 内只回调一次
    const prev = this.debounceTimers.get(p);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(p);
      this.callback?.({
        fileId: meta.fileId,
        fileName: meta.fileName,
        sourcePath: p,
      });
    }, DEBOUNCE_MS);
    this.debounceTimers.set(p, timer);
  }

  /** 启动对某知识条目的源文件监听；重复监听同一路径幂等 */
  watchSource(fileId: number): void {
    void getKnowledgeFileById(fileId).then(async (file) => {
      if (!file) return;
      // 已监听：若 fileId 变了则更新映射，不重复 add
      const existing = this.watched.get(file.source_path);
      if (existing) {
        existing.fileId = fileId;
        existing.fileName = file.file_name;
        return;
      }
      this.watched.set(file.source_path, {
        fileId,
        fileName: file.file_name,
      });
      // 局域网共享路径：挂载前做权限 / 可达性检测并记日志（容错，不阻塞监听，chokidar 自行处理重连）
      if (isUncPath(file.source_path)) {
        const acc = await checkUncAccess(file.source_path);
        if (!acc.ok) {
          void writeLog('watch-unc-access', `监听 ${file.source_path}: ${acc.reason}`);
        }
      }
      this.ensureWatcher().add(file.source_path);
    });
  }

  /** 停止监听某条源路径（条目被删除 / 移动时调用） */
  unwatchPath(sourcePath: string): void {
    if (!this.watched.has(sourcePath)) return;
    this.watched.delete(sourcePath);
    const timer = this.debounceTimers.get(sourcePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sourcePath);
    }
    if (this.watcher) {
      try { this.watcher.unwatch(sourcePath); } catch { /* ignore */ }
    }
  }

  /** 当前已监听路径数（测试 / 调试用） */
  watchedCount(): number {
    return this.watched.size;
  }

  /** 停止全部监听并清理状态 */
  async stop(): Promise<void> {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    if (this.watcher) {
      try { await this.watcher.close(); } catch { /* ignore */ }
      this.watcher = null;
    }
    this.watched.clear();
  }
}
