import { describe, it, expect } from 'vitest';
import { assertSafeFetchUrl } from '../web-crawler';

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
