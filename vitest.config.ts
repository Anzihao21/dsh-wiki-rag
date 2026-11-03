import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    // 关闭 transform/SSR 缓存写入，避免在本环境临时目录被 brokered-fs 拒绝写入（EPERM）
    cache: false,
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
