import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const LOG_ROOT = path.join(process.cwd(), '.dsh-wiki-rag', 'logs');

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentLogFile(): string {
  return path.join(LOG_ROOT, `${todayStamp()}.log`);
}

function ensureLogDir(): void {
  mkdirSync(LOG_ROOT, { recursive: true });
}

function writeFileLine(line: string): void {
  try {
    ensureLogDir();
    appendFileSync(currentLogFile(), line + '\n', 'utf-8');
  } catch {
    // 日志写入失败不应影响主流程
  }
}

function emit(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
  };
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta)) {
      if (k === 'timestamp' || k === 'level' || k === 'module' || k === 'message') continue;
      entry[k] = v;
    }
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  writeFileLine(line);
}

export function createLogger(module: string): Logger {
  return {
    debug: (message, meta) => emit('debug', module, message, meta),
    info: (message, meta) => emit('info', module, message, meta),
    warn: (message, meta) => emit('warn', module, message, meta),
    error: (message, meta) => emit('error', module, message, meta),
  };
}
