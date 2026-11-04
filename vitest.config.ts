import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/main/**/__tests__/**/*.test.ts',
      // 客户端逻辑层（bundle/src/client）：可测纯逻辑与 jsdom 环境下的 DOM/localStorage 行为
      'bundle/src/client/__tests__/**/*.test.ts',
    ],
    environmentMatchGlobs: [
      // 需要 DOM/localStorage 的客户端测试用 jsdom，其余保持 node
      ['bundle/src/client/__tests__/**/*.dom.test.ts', 'jsdom'],
    ],
    testTimeout: 30000,
    // 关闭 transform/SSR 缓存写入，避免在本环境临时目录被 brokered-fs 拒绝写入（EPERM）
    cache: false,
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
