/**
 * host API 请求级集成测试：直调 createApiHandler(deps)，用真实 FileImporter + DB。
 *
 * 不启 HTTP server，验证：
 * - /import 正常 file 路径导入 md
 * - /import upload 双通道（base64 内容）
 * - /import 缺 source 非 upload → 400
 * - /import folderId 非数字 → 400
 * - /import 同路径并发 → 409（acquire 语义）
 * - /settings 非法 provider 组合 → 400
 * - /search 缺 query → 400
 * - 未知路径 → 404
 * - 注入异常 → 500 {error} 且不含 stack
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';

// mock embedding，避免真实模型加载
vi.mock('../../rag/embedding', () => ({
  embedText: () => Buffer.from(new Float32Array(256).buffer),
  initEmbedding: async () => {},
}));

import { initDatabase, closeDatabase } from '../../db/sqlite-init';
import { FileImporter } from '../../file/file-importer';
import { listLogs } from '../../db/log-db';
import { countByType } from '../../db/knowledge-db';
import { createApiHandler, type ApiDeps } from '../../host-api/handler';

let root: string;
let mdDir: string;
let zipDir: string;
let srcDir: string;
let importer: FileImporter;
let jobs: Map<string, any>;
let inProgress: Set<string>;

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'host-api-'));
  mdDir = path.join(root, 'md');
  zipDir = path.join(root, 'zip');
  srcDir = path.join(root, 'src');
  mkdirSync(mdDir, { recursive: true });
  mkdirSync(zipDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });
  await initDatabase(path.join(root, 'wiki.db'));
  importer = new FileImporter({
    mdDir, zipDir, chunkSize: 200, chunkOverlap: 20, chunkMode: 'fixed', webTimeout: 5000,
  });
  jobs = new Map();
  inProgress = new Set();
});

afterEach(() => {
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    publicSettings: () => ({ chunkSize: 800, embeddingProvider: 'fallback' }),
    applySettingsPatch: async () => {},
    dispatchImport: async (body: any) => {
      if (body.kind === 'upload') return importer.importUploadContent(body.fileName, body.content, body.folderId ?? null);
      if (body.kind === 'folder') return { summary: importer.summarize(await importer.importFolder(body.source, body.folderId ?? null)) };
      return importer.importLocalFile(body.source, body.folderId ?? null);
    },
    runImportJob: async (body: any, job: any) => {
      job.done = 1;
      return importer.importLocalFile(body.source, body.folderId ?? null);
    },
    acquire: (k: string) => {
      if (inProgress.has(k)) return false;
      inProgress.add(k);
      return true;
    },
    release: (k: string) => { inProgress.delete(k); },
    jobs,
    ragSearch: async () => [],
    normalizeSearchInput: (q: unknown, k: unknown) => {
      if (typeof q !== 'string' || !q.trim()) return null;
      return { query: q.trim(), topK: typeof k === 'number' ? k : 5 };
    },
    countByType: async () => ({ md: 1 }),
    listLogs: async () => [],
    logger: { info: () => {}, error: () => {} },
    writeLog: async () => {},
    randomUUID: () => Math.random().toString(36).slice(2, 10),
    ...overrides,
  };
}

const EMPTY_QUERY = new URLSearchParams();

describe('host-api /import', () => {
  it('正常导入 md 文件路径成功', async () => {
    const src = path.join(srcDir, 'note.md');
    writeFileSync(src, '# Hello\n\nbody', 'utf-8');
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/import', EMPTY_QUERY, JSON.stringify({ source: src }));
    expect(r.status).toBe(200);
    expect(r.body.skipped).toBe(false);
    expect(r.body.fileId).toBeGreaterThan(0);
    expect(r.body.fileName).toBe('note.md');
  });

  it('upload 通道 base64 内容成功', async () => {
    const b64 = Buffer.from('上传通道正文', 'utf-8').toString('base64');
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/import', EMPTY_QUERY,
      JSON.stringify({ kind: 'upload', fileName: 'up.txt', content: b64 }));
    expect(r.status).toBe(200);
    expect(r.body.skipped).toBe(false);
    expect(r.body.fileId).toBeGreaterThan(0);
  });

  it('缺 source 且非 upload → 400', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/import', EMPTY_QUERY, JSON.stringify({}));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/source/);
  });

  it('folderId 非数字 → 400', async () => {
    const src = path.join(srcDir, 'x.md');
    writeFileSync(src, '# x');
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/import', EMPTY_QUERY,
      JSON.stringify({ source: src, folderId: 'not-a-number' }));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/folderId/);
  });

  it('同路径并发导入 → 409（acquire 互斥）', async () => {
    const src = path.join(srcDir, 'locked.md');
    writeFileSync(src, '# locked');
    // 预置 inProgress 模拟同路径导入进行中
    inProgress.add(`import:${src}`);
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/import', EMPTY_QUERY, JSON.stringify({ source: src }));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/operation-in-progress/);
  });
});

describe('host-api /settings', () => {
  it('applySettingsPatch 抛 AppError(400) → 透传 400', async () => {
    const { AppError, BAD_REQUEST } = await import('../../utils/errors');
    const deps = makeDeps({
      applySettingsPatch: async () => { throw new AppError(BAD_REQUEST, 'embeddingProvider=openai 时必须填写 embeddingOpenAIBaseURL', 400); },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/settings', EMPTY_QUERY,
      JSON.stringify({ embeddingProvider: 'openai' }));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/embeddingOpenAIBaseURL/);
  });

  it('GET /settings 返回 publicSettings', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('GET', '/api/wiki/settings', EMPTY_QUERY, '');
    expect(r.status).toBe(200);
    expect(r.body.chunkSize).toBe(800);
  });
});

describe('host-api /search', () => {
  it('缺 query → 400', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/search', EMPTY_QUERY, JSON.stringify({}));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/query/);
  });
});

describe('host-api 404 与 500', () => {
  it('未知路径 → 404', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('GET', '/api/wiki/nope', EMPTY_QUERY, '');
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/not found/);
  });

  it('路由内抛错 → 500 {error} 且不含 stack', async () => {
    const deps = makeDeps({
      countByType: async () => { throw new Error('boom DB dead'); },
    });
    const handler = createApiHandler(deps);
    const r = await handler('GET', '/api/wiki/stats', EMPTY_QUERY, '');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('boom DB dead');
    // 不泄露 stack
    expect(JSON.stringify(r.body)).not.toMatch(/at\s+\w+\s*\(/);
  });

  it('POST body 非法 JSON → 400', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/search', EMPTY_QUERY, '{not json');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/JSON/);
  });
});

describe('host-api /search 分支', () => {
  it('正常命中返回结构化结果', async () => {
    const deps = makeDeps({
      ragSearch: async () => [
        { file_id: 1, file_name: 'a.md', chunk_text: 'hello', score: 0.9, md_path: '/a.md', chunk_index: 0, source_path: '/a.md' },
      ],
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/search', EMPTY_QUERY, JSON.stringify({ query: 'hello', topK: 3 }));
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].file_name).toBe('a.md');
    expect(r.body[0].score).toBe(0.9);
  });

  it('空 query → 400', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/search', EMPTY_QUERY, JSON.stringify({ query: '  ' }));
    expect(r.status).toBe(400);
  });
});

describe('host-api /trash 分支（请求层语义）', () => {
  it('GET /trash 返回空列表（无 trash deps 时 501）', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('GET', '/api/wiki/trash', EMPTY_QUERY, '');
    expect(r.status).toBe(501);
  });

  it('POST /trash/restore 非法参数 → 400', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/trash/restore', EMPTY_QUERY, JSON.stringify({ id: 'abc', type: 'file' }));
    expect(r.status).toBe(400);
    const r2 = await handler('POST', '/api/wiki/trash/restore', EMPTY_QUERY, JSON.stringify({ id: 1, type: 'bogus' }));
    expect(r2.status).toBe(400);
  });

  it('DELETE /trash/bogus/1 → 400', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('DELETE', '/api/wiki/trash/bogus/1', EMPTY_QUERY, '');
    expect(r.status).toBe(400);
  });
});

describe('host-api /export/zip 分支', () => {
  it('未配置 export → 501', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(501);
  });

  it('空库时 exportZipOp 抛 httpStatus=400 → handler 返回 400', async () => {
    const deps = makeDeps({
      exportZip: async () => {
        const e: any = new Error('知识库为空，无可导出内容');
        e.httpStatus = 400;
        throw e;
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/空/);
  });
});

describe('host-api /export/zip 失败路径', () => {
  it('exportZip 抛错 → handler 返回 500 {error} 不泄露 stack', async () => {
    const deps = makeDeps({
      exportZip: async () => { throw new Error('disk full'); },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('disk full');
    expect(JSON.stringify(r.body)).not.toMatch(/at\s+\w+/);
  });
});

describe('host-api 错误分支清扫', () => {
  it('POST /trash/empty 未配置 → 501', async () => {
    const handler = createApiHandler(makeDeps());
    const r = await handler('POST', '/api/wiki/trash/empty', EMPTY_QUERY, '');
    expect(r.status).toBe(501);
  });

  it('DELETE /trash/1（缺 type 段）→ 400', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('DELETE', '/api/wiki/trash/1', EMPTY_QUERY, '');
    expect(r.status).toBe(400);
  });

  it('POST /trash/restore 非法 JSON → 400', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/trash/restore', EMPTY_QUERY, '{bad json');
    expect(r.status).toBe(400);
  });
});

describe('host-api 不存在 id 语义', () => {
  it('POST /trash/restore 不存在 id → 200（no-op，不抛）', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/trash/restore', EMPTY_QUERY, JSON.stringify({ id: 99999, type: 'file' }));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('restored');
  });

  it('DELETE /trash/file/99999 → 200（no-op）', async () => {
    const deps = makeDeps({
      trash: {
        list: async () => ({ files: [], folders: [] }),
        restore: async () => {},
        purge: async () => {},
        empty: async () => ({ files: 0, folders: 0 }),
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('DELETE', '/api/wiki/trash/file/99999', EMPTY_QUERY, '');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('purged');
  });
});

describe('host-api /export/zip 请求层端到端', () => {
  it('正常导出返回 {path,fileName,size,count} 结构', async () => {
    const deps = makeDeps({
      exportZip: async () => ({ path: '/tmp/test.zip', fileName: 'test.zip', size: 1024, count: 3 }),
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(200);
    expect(r.body.path).toBe('/tmp/test.zip');
    expect(r.body.count).toBe(3);
    expect(r.body.size).toBe(1024);
  });

  it('空库 exportZipOp 抛 httpStatus=400 → handler 返回 400', async () => {
    const deps = makeDeps({
      exportZip: async () => {
        const e: any = new Error('知识库为空，无可导出内容');
        e.httpStatus = 400;
        throw e;
      },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(400);
  });

  it('导出异常 500 不泄露 stack', async () => {
    const deps = makeDeps({
      exportZip: async () => { throw new Error('disk full'); },
    });
    const handler = createApiHandler(deps);
    const r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('disk full');
    expect(JSON.stringify(r.body)).not.toMatch(/at\s+\w+/);
  });
});

describe('createApiHandler 白名单路由覆盖（防死代码复发）', () => {
  it('未注入 trash/export 时对应路由 501', async () => {
    const deps = makeDeps({ trash: undefined, exportZip: undefined });
    const handler = createApiHandler(deps);
    // GET /trash
    let r = await handler('GET', '/api/wiki/trash', EMPTY_QUERY, '');
    expect(r.status).toBe(501);
    // POST /export/zip
    r = await handler('POST', '/api/wiki/export/zip', EMPTY_QUERY, '');
    expect(r.status).toBe(501);
  });

  it('并发请求结果稳定（Promise.all）', async () => {
    const deps = makeDeps({
      search: async () => ({ results: [], queryTimeMs: 1, count: 0 }),
    });
    const handler = createApiHandler(deps);
    const rs = await Promise.all(Array.from({ length: 5 }, () =>
      handler('POST', '/api/wiki/search', EMPTY_QUERY, JSON.stringify({ query: 'test' }))
    ));
    rs.forEach((r) => expect(r.status).toBe(200));
  });
});
