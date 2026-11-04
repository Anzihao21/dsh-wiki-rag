/**
 * host HTTP API 路由分发（可测版）。
 *
 * 设计：把 createServer 回调里的路由匹配/参数校验/响应组装抽成纯函数 createApiHandler(deps)，
 * 返回 (method, pathname, query, rawBody) => Promise<{ status, body }>。
 * createServer 回调只做适配（解析 URL/body、写响应），不再承载业务逻辑。
 *
 * deps 由 host/index.ts 在 apply() 闭包里注入，本模块不直接依赖 DB/importer，
 * 因此可以在单元测试里用 fake deps 直调 handler，无需起真实 HTTP server。
 *
 * 当前抽取范围（核心子集）：
 * - POST /api/wiki/import（同步/异步、upload/folder/url/note/file 分支、400/409）
 * - GET/POST /api/wiki/settings（含校验 400）
 * - POST /api/wiki/search（400 缺 query）
 * - GET /api/wiki/stats
 * - GET /api/wiki/logs
 * - 未知路径 404
 * - 未捕获异常 500（不泄露 stack，返回 { error: string }）
 *
 * 其余路由（tree/folders/files/snapshots/jobs/update-check/单条目操作等）保持原状，
 * 在 host/index.ts 内联处理——这些路由与具体 DB schema/文件系统交互紧，
 * 抽取收益低于回归风险，待后续按路由逐个迁移。
 */

export interface ApiDeps {
  // settings
  publicSettings: () => Record<string, any>;
  applySettingsPatch: (patch: Record<string, any>) => Promise<void>;
  // import
  dispatchImport: (body: Record<string, any>) => Promise<any>;
  runImportJob: (body: Record<string, any>, job: any) => Promise<any>;
  acquire: (key: string) => boolean;
  release: (key: string) => void;
  jobs: Map<string, any>;
  // search/stats/logs
  ragSearch: (query: string, topK?: number) => Promise<any[]>;
  normalizeSearchInput: (q: unknown, k: unknown) => { query: string; topK: number } | null;
  countByType: () => Promise<Record<string, number>>;
  listLogs: (opts: { limit?: number; action?: string; level?: string }) => Promise<any[]>;
  // logging
  logger: {
    info: (msg: string, meta?: Record<string, any>) => void;
    error: (msg: string, meta?: Record<string, any>) => void;
  };
  writeLog: (action: string, detail: string, opts?: { level?: string }) => Promise<void>;
  randomUUID: () => string;
  pruneJobs?: () => void;
}

export interface ApiResponse {
  status: number;
  body: any;
}

function parseJson(raw: string): { ok: true; value: any } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw || '{}') };
  } catch {
    return { ok: false };
  }
}

export function createApiHandler(deps: ApiDeps) {
  const {
    publicSettings, applySettingsPatch,
    dispatchImport, runImportJob, acquire, release, jobs,
    ragSearch, normalizeSearchInput, countByType, listLogs,
    logger, writeLog, randomUUID,
  } = deps;

  return async function handle(
    method: string,
    pathname: string,
    query: URLSearchParams,
    rawBody: string
  ): Promise<ApiResponse> {
    try {
      // ---- 导入 ----
      if (method === 'POST' && pathname === '/api/wiki/import') {
        const parsed = parseJson(rawBody);
        if (!parsed.ok) return { status: 400, body: { error: '请求体不是合法 JSON' } };
        const body = parsed.value;
        if (typeof body !== 'object' || body === null) return { status: 400, body: { error: '请求体必须是对象' } };
        const source = typeof body.source === 'string' ? body.source.trim() : '';
        const parsedKind = typeof body.kind === 'string' ? body.kind : '';
        const isUpload = parsedKind === 'upload';
        if (!source && !isUpload) return { status: 400, body: { error: '缺少导入来源 source' } };
        let folderId: number | null = null;
        if (body.folderId !== undefined && body.folderId !== null) {
          if (typeof body.folderId !== 'number') return { status: 400, body: { error: 'folderId 必须是数字或 null' } };
          folderId = body.folderId;
        }
        body.folderId = folderId;
        logger.info('import requested', { source, async: !!body.async, folderId });

        const opKey = isUpload ? `upload:${randomUUID()}` : `import:${source}`;
        if (!acquire(opKey)) return { status: 409, body: { error: 'operation-in-progress' } };

        if (!body.async) {
          try {
            const result = await dispatchImport(body);
            return { status: 200, body: result };
          } finally {
            release(opKey);
          }
        }

        // 异步模式
        const jobId = randomUUID();
        const job = {
          jobId, phase: 'prepare', done: 0, total: 1,
          message: '任务已创建', status: 'running', startedAt: Date.now(),
        };
        jobs.set(jobId, job);
        (async () => {
          try {
            job.result = await runImportJob(body, job);
            job.status = 'done';
            job.message = '导入完成';
            logger.info('async import done', { jobId, source });
            writeLog('import-async', `job=${jobId} done`, { level: 'info' }).catch(() => {});
          } catch (e: any) {
            job.status = 'error';
            job.error = e.message;
            job.message = '导入失败';
            logger.error('async import failed', { jobId, source, error: e.message });
            writeLog('import-async-error', `${jobId}: ${e.message}`, { level: 'error' }).catch(() => {});
          } finally {
            release(opKey);
            deps.pruneJobs?.();
          }
        })();
        return { status: 200, body: { jobId } };
      }

      // ---- 检索 ----
      if (method === 'POST' && pathname === '/api/wiki/search') {
        const parsed = parseJson(rawBody);
        if (!parsed.ok) return { status: 400, body: { error: '请求体不是合法 JSON' } };
        const norm = normalizeSearchInput(parsed.value?.query, parsed.value?.topK);
        if (!norm) return { status: 400, body: { error: '缺少 query' } };
        const results = await ragSearch(norm.query, norm.topK);
        logger.info('search executed', { query: norm.query, topK: norm.topK, hits: results.length });
        return { status: 200, body: results };
      }

      // ---- 日志 ----
      if (method === 'GET' && pathname === '/api/wiki/logs') {
        const action = query.get('action') || undefined;
        const level = query.get('level') || undefined;
        const limit = parseInt(query.get('limit') || '200') || 200;
        const rows = await listLogs({ limit, action, level });
        return { status: 200, body: rows };
      }

      // ---- 统计 ----
      if (method === 'GET' && pathname === '/api/wiki/stats') {
        const byType = await countByType();
        const total = Object.values(byType).reduce((a: number, b: number) => a + b, 0);
        return { status: 200, body: { byType, total, ready: total, stale: 0 } };
      }

      // ---- 设置 GET/POST ----
      if (method === 'GET' && pathname === '/api/wiki/settings') {
        return { status: 200, body: publicSettings() };
      }
      if (method === 'POST' && pathname === '/api/wiki/settings') {
        const parsed = parseJson(rawBody);
        if (!parsed.ok) return { status: 400, body: { error: '请求体不是合法 JSON' } };
        const body = parsed.value;
        if (typeof body !== 'object' || body === null) return { status: 400, body: { error: '请求体必须是对象' } };
        await applySettingsPatch(body);
        writeLog('settings-update', '设置已保存', { level: 'info' }).catch(() => {});
        return { status: 200, body: { status: 'saved', settings: publicSettings() } };
      }

      return { status: 404, body: { error: 'not found', path: pathname } };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error('http request failed', { path: pathname, method, error: errMsg });
      writeLog('http-error', `${pathname}: ${errMsg}`, { level: 'error' }).catch(() => {});
      const status = (e as any)?.httpStatus || 500;
      return { status, body: { error: errMsg } };
    }
  };
}
