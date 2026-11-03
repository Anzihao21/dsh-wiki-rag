import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertSafeFetchUrl, fetchWebContent } from '../web-crawler';

/** 返回 2KB body 的本地测试服务器，用于验证抓取大小限制 */
let testServer: ReturnType<typeof createServer> | null = null;
let testUrl = '';
beforeAll(async () => {
  testServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>' + 'x'.repeat(2048) + '</html>');
  });
  await new Promise<void>((r) => testServer!.listen(0, '127.0.0.1', () => r()));
  const port = (testServer!.address() as AddressInfo).port;
  testUrl = `http://127.0.0.1:${port}/`;
});
afterAll(() => {
  if (testServer) { try { testServer.close(); } catch { /* ignore */ } }
});

describe('web-crawler 抓取大小限制', () => {
  it('超过 maxBytes 上限时中断抓取并抛错', async () => {
    await expect(
      fetchWebContent(testUrl, true, { intranetMode: true, timeout: 3000, maxBytes: 1024 })
    ).rejects.toThrow(/大小限制/);
  });

  it('未超过上限时正常返回内容', async () => {
    const body = await fetchWebContent(testUrl, true, { intranetMode: true, timeout: 3000, maxBytes: 1024 * 1024 });
    expect(body).toContain('x');
  });
});

describe('web-crawler SSRF 防护', () => {
  it('放行正常 http/https URL', () => {
    expect(() => assertSafeFetchUrl('https://example.com/path')).not.toThrow();
    expect(() => assertSafeFetchUrl('http://10.0.0.5/oa')).not.toThrow();
    expect(() => assertSafeFetchUrl('http://192.168.1.10:8080/')).not.toThrow();
    expect(() => assertSafeFetchUrl('http://127.0.0.1:3000/')).not.toThrow();
  });

  it('拦截云元数据 169.254.169.254', () => {
    expect(() => assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).toThrow(/link-local/);
    expect(() => assertSafeFetchUrl('http://169.254.100.5/')).toThrow(/link-local/);
  });

  it('拦截 IPv6 link-local', () => {
    expect(() => assertSafeFetchUrl('http://[fe80::1]/')).toThrow(/IPv6 link-local/);
  });

  it('拦截非 http(s) scheme', () => {
    expect(() => assertSafeFetchUrl('file:///etc/passwd')).toThrow(/仅支持 http/);
    expect(() => assertSafeFetchUrl('ftp://example.com/')).toThrow(/仅支持 http/);
    expect(() => assertSafeFetchUrl('gopher://example.com/')).toThrow(/仅支持 http/);
  });

  it('拦截通配地址 0.0.0.0 / ::', () => {
    expect(() => assertSafeFetchUrl('http://0.0.0.0/')).toThrow(/通配/);
    expect(() => assertSafeFetchUrl('http://[::]/')).toThrow(/通配/);
  });

  it('拦截非法 URL', () => {
    expect(() => assertSafeFetchUrl('not-a-url')).toThrow(/非法 URL/);
  });
});
