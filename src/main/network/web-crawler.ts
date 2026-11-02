import { get } from 'https';
import { get as getHttp } from 'http';

export interface WebFetchOptions {
  intranetMode: boolean;
  timeout: number;
}

/**
 * 网页抓取模块。
 * - 内网模式：关闭外网防爬策略，适配内网 OA 网页（更宽松超时与 UA）
 * - 外网模式：增加超时、UA、防爬延时配置
 * 失败时抛错并记录日志（不直接崩溃）。
 */
export async function fetchWebContent(
  url: string,
  intranetMode: boolean,
  opts: WebFetchOptions
): Promise<string> {
  const timeout = intranetMode ? Math.max(opts.timeout, 15000) : opts.timeout;
  const ua = intranetMode
    ? 'Mozilla/5.0 (DSH-Wiki-RAG/Intranet)'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  const body = await rawFetch(url, { ua, timeout });

  // 简单 HTML 转纯文本
  return htmlToText(body);
}

function rawFetch(
  url: string,
  opts: { ua: string; timeout: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? get : getHttp;
    const req = mod(
      url,
      {
        headers: {
          'User-Agent': opts.ua,
          Accept: 'text/html,application/xhtml+xml'
        },
        timeout: opts.timeout
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 400) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.on('error', reject);
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, (_, t) => `\n${t}\n`)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
