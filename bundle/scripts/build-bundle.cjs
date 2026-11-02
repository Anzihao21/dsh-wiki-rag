/**
 * dsh-wiki-rag bundle 构建脚本。
 * 用 esbuild 把宿主插件与客户端插件分别打包到 bundle/lib。
 * 宿主插件打包时 external 掉 DSH 运行时（cordis/dsh-tools）与原生依赖（sqlite3）。
 * 客户端插件打包为浏览器 IIFE/ESM bundle。
 */
const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');

async function main() {
  fs.rmSync(path.join(root, 'lib'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });

  // ---------- 宿主插件 ----------
  // DSH 的 cordis-plugin-loader 用 ESM `import()` 加载插件入口，宿主必须以 ESM 输出。
  // 只 external DSH 内置的 @deepseek-ai/* 包（DSH 用自己的 ResolutionRouter 解析，版本对齐）；
  // archiver/chokidar/diff/extract-zip 等第三方库 bundle 进产物，避免 DSH resolver 解析失败。
  // sqlite3 为原生模块，保持 external（由 profile 安装、Node 原生加载）。
  const hostExternals = [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/schemastery',
    'sqlite3',
  ];

  await build({
    entryPoints: [path.join(root, 'src/host/index.ts')],
    outfile: path.join(root, 'lib/host/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: hostExternals,
    // 在 ESM 产物顶部注入 createRequire，使 esbuild 生成的 __require 能
    // 正常加载 archiver 等 CJS 库内部的 require("fs")，避免 Dynamic require 报错
    banner: {
      js: "import { createRequire as __dshCreateRequire } from 'module';\nconst require = __dshCreateRequire(import.meta.url);\n",
    },
    sourcemap: true,
    logLevel: 'info',
  });

  // ---------- 客户端插件 ----------
  await build({
    entryPoints: [path.join(root, 'src/client/index.ts')],
    outfile: path.join(root, 'lib/client/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots', 'react', 'react-dom'],
    sourcemap: true,
    logLevel: 'info',
  });

  // 复制 cordis.patch.yml
  fs.copyFileSync(
    path.join(root, 'cordis.patch.yml'),
    path.join(root, 'lib/cordis.patch.yml')
  );

  console.log('\n✅ bundle 构建完成:');
  console.log('   - lib/host/index.js   (宿主插件)');
  console.log('   - lib/client/index.js (客户端插件)');
  console.log('   - lib/cordis.patch.yml');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
