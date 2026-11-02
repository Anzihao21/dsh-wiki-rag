// 用 esbuild JS API 打包测试脚本（CJS）
const { build } = require('esbuild');

build({
  entryPoints: ['test/test-case.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/test-bundle.cjs',
  external: ['sqlite3', 'archiver', 'extract-zip', 'chokidar', 'diff'],
  sourcemap: false
})
  .then(() => console.log('打包完成: dist/test-bundle.cjs'))
  .catch((e) => {
    console.error('打包失败:', e.message);
    process.exit(1);
  });
