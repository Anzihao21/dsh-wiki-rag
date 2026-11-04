import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { HANDLED_PATHS, isHandledPath } from '../../../../bundle/src/host/index';

describe('HANDLED_PATHS 白名单矩阵', () => {
  it('10 条白名单路径全部 true', () => {
    for (const p of HANDLED_PATHS) {
      const [m, path] = p.split(' ');
      expect(isHandledPath(m, path)).toBe(true);
    }
  });

  it('非白名单路径 false', () => {
    expect(isHandledPath('GET', '/api/wiki/tree')).toBe(false);
    expect(isHandledPath('GET', '/api/wiki/list')).toBe(false);
    expect(isHandledPath('GET', '/api/wiki/unknown')).toBe(false);
    expect(isHandledPath('POST', '/api/wiki/files')).toBe(false);
  });

  it('DELETE /trash/:type/:id true，DELETE /files/:id false', () => {
    expect(isHandledPath('DELETE', '/api/wiki/trash/file/1')).toBe(true);
    expect(isHandledPath('DELETE', '/api/wiki/files/1')).toBe(false);
  });
});

describe('真实 HTTP 层：白名单路由接线', () => {
  it('白名单内路径走 handler 桩并透传响应；白名单外 404 不调 handler', async () => {
    let handlerCalls: Array<{ method: string; path: string }> = [];
    const fakeHandler = async (method: string, path: string) => {
      handlerCalls.push({ method, path });
      if (path === '/api/wiki/trash') {
        return { status: 200, body: { files: [{ id: 1, file_name: 'a.md', size: 1024 }], folders: [] } };
      }
      return { status: 200, body: { ok: true } };
    };
    const server = createServer(async (req, res) => {
      const pathname = req.url!.split('?')[0];
      if (isHandledPath(req.method!, pathname)) {
        const r = await fakeHandler(req.method!, pathname);
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.body));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;

    // 白名单内：GET /trash
    const r1 = await fetch(`${base}/api/wiki/trash`);
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1.files[0].size).toBe(1024); // size 字段经 HTTP 透传

    // 白名单内：POST /search
    const r2 = await fetch(`${base}/api/wiki/search`, { method: 'POST' });
    expect(r2.status).toBe(200);

    // 白名单外：/tree 应 404 且 handler 未调用
    const before = handlerCalls.length;
    const r3 = await fetch(`${base}/api/wiki/tree`);
    expect(r3.status).toBe(404);
    expect(handlerCalls.length).toBe(before); // 未调 handler

    await new Promise<void>((r) => server.close(() => r()));
  });
});
