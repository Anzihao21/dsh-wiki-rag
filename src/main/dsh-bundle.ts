import { startEngine } from './engine';
import { ragSearch } from './rag/rag-search';
import { defineTool } from '@deepseek-ai/dsh-tools';

/**
 * DSH cordis 组合包入口。
 *
 * 与桌面端 `index.ts`（Electron 主进程）不同，本文件是 DSH 加载本包时
 * 实际 import 的模块（见 `package.json` 的 `exports["./bundle"]` 与
 * `cordis.patch.yml`）。它在宿主组合树中注册一个 Agent 工具
 * `wiki_rag_search`，让对话中的 Agent 能够检索本地 Wiki 知识库。
 *
 * 类型说明：`@deepseek-ai/dsh-tools` / `@deepseek-ai/cordis` 运行时由宿主
 * 提供（声明为 peerDependency），本地类型由 `src/main/types/dsh-cordis-shim.d.ts`
 * 提供，因此这里统一以宽松类型编写，避免对宿主内部类型产生硬依赖。
 */

/** Plugin name registered with the Loader. */
export const name = 'dsh-wiki-rag';

/** Host services this plugin consumes. The `tools` service resolves from the running dsh. */
export const inject = ['tools'];

/** Canonical output declaration: an array of retrieved passages. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
  additionalProperties: true,
} as const;

/**
 * 注册 Wiki 知识库检索工具。
 *
 * 引擎异步启动完成后才注册工具，确保检索时向量库已就绪；启动失败仅记录错误，
 * 不阻塞宿主其它功能。
 * @param ctx - cordis Context，已注入 `tools` 服务。
 */
export function apply(ctx: any): void {
  void (async () => {
    try {
      await startEngine();
      ctx.tools.register(
        defineTool({
          name: 'wiki_rag_search',
          description:
            '检索 Wiki 知识库中的文档资料，返回与查询最相关的文本片段。' +
            '当用户需要查找本地知识库中的资料、文档内容、历史记录或术语解释时使用。',
          parameters: {
            query: {
              type: 'string',
              required: true,
              description: '检索关键词或自然语言问题',
            },
            top_k: {
              type: 'number',
              description: '返回结果条数，默认 5，范围 1-50',
            },
          },
          output: {
            schema: OUTPUT_SCHEMA,
            render: (_args: unknown, value: unknown) => [
              { type: 'text', text: JSON.stringify(value) },
            ],
          },
          async execute(args: any) {
            const q = typeof args?.query === 'string' ? args.query : '';
            const k = typeof args?.top_k === 'number' ? args.top_k : 5;
            const results = await ragSearch(q, k);
            return { results };
          },
        }),
      );
      console.log('[dsh-wiki-rag] registered agent tool wiki_rag_search');
    } catch (e) {
      console.error('[dsh-wiki-rag] engine start failed:', e);
    }
  })();
}
