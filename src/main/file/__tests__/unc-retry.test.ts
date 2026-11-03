import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { isNetworkRetryableError, withNetworkRetry, checkUncAccess } from '../unc-retry';

const netErr = (code: string) => Object.assign(new Error(`err-${code}`), { code });

describe('unc-retry: isNetworkRetryableError', () => {
  it('识别网络/共享类错误码', () => {
    expect(isNetworkRetryableError(netErr('ENETUNREACH'))).toBe(true);
    expect(isNetworkRetryableError(netErr('EHOSTUNREACH'))).toBe(true);
    expect(isNetworkRetryableError(netErr('ECONNRESET'))).toBe(true);
    expect(isNetworkRetryableError(netErr('ETIMEDOUT'))).toBe(true);
    expect(isNetworkRetryableError(netErr('EAI_AGAIN'))).toBe(true);
  });

  it('非网络/非共享错误不重试', () => {
    expect(isNetworkRetryableError(netErr('ENOENT'))).toBe(false);
    expect(isNetworkRetryableError(netErr('EACCES'))).toBe(false);
    expect(isNetworkRetryableError(netErr('EPERM'))).toBe(false);
    expect(isNetworkRetryableError(new Error('no code'))).toBe(false);
    expect(isNetworkRetryableError(null)).toBe(false);
  });
});

describe('unc-retry: withNetworkRetry', () => {
  it('网络错误持续失败 → 重试 3 次后抛出', async () => {
    let calls = 0;
    await expect(
      withNetworkRetry(async () => { calls++; throw netErr('ENETUNREACH'); }, { baseDelayMs: 1 })
    ).rejects.toThrow('err-ENETUNREACH');
    expect(calls).toBe(3);
  });

  it('网络错误中途恢复 → 重试后成功返回', async () => {
    let calls = 0;
    const r = await withNetworkRetry(async () => {
      calls++;
      if (calls === 1) throw netErr('ECONNRESET');
      return 'ok';
    }, { attempts: 3, baseDelayMs: 1 });
    expect(r).toBe('ok');
    expect(calls).toBe(2);
  });

  it('非网络错误不重试，立即抛出', async () => {
    let calls = 0;
    await expect(
      withNetworkRetry(async () => { calls++; throw netErr('ENOENT'); }, { baseDelayMs: 1 })
    ).rejects.toThrow('err-ENOENT');
    expect(calls).toBe(1);
  });
});

describe('unc-retry: checkUncAccess', () => {
  it('非 UNC 路径直接判定可访问', async () => {
    const r = await checkUncAccess('/plain/path');
    expect(r.ok).toBe(true);
  });

  it('UNC 形式且实际可访问 → ok', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unc-'));
    const unc = '//' + root.replace(/^\//, '');
    const r = await checkUncAccess(unc);
    expect(r.ok).toBe(true);
    expect(r.reason).toContain('可访问');
  });

  it('UNC 形式但路径不存在 → 报告不存在', async () => {
    const r = await checkUncAccess('//__definitely_not_exists_unc__/share');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('不存在');
  });
});
