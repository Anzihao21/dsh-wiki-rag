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
    'better-sqlite3',
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
    minify: true,
    sourcemap: true,
    logLevel: 'info',
  });

  // ---------- 客户端插件（浏览器侧，被 DSH 客户端 loader 经 __ModuleLoader__.load 加载）----------
  // 产物形态照官方 sidebar：CJS 内部 require/module.exports，再由 banner/footer 包进
  // window.__ModuleLoader__.load({ id, factory:(require)=>{...} }) 外壳。
  // React / jsx-runtime 全部外部化（由宿主 ModuleLoader 解析到宿主单例 React，避免双实例）。
  await build({
    entryPoints: [path.join(root, 'src/client/index.tsx')],
    outfile: path.join(root, 'lib/client/index.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic', // 自动 JSX 运行时 → import { jsx } from "react/jsx-runtime"（外部化）
    external: [
      'react',
      'react/jsx-runtime', // 必须补：自动 JSX 运行时，否则内联进 bundle 与宿主 React 双实例
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
    ],
    // 外壳开头：__ModuleLoader__.load 头 + factory 闭包内预置 module/exports
    banner: {
      js:
        'window.__ModuleLoader__.load({' +
        'id: "dsh-wiki-rag",' +
        'factory: (require) => {' +
        'var module = { exports: {} };' +
        'var exports = module.exports;' +
        'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    },
    // 外壳结尾：导出 apply/inject + return + 收尾
    footer: {
      js:
        // apply/inject 由 esbuild 的 export 语句自行写入 exports，
        // footer 不再硬编码引用本地变量（minify 后会重命名 → ReferenceError）
        'return module.exports;' +
        '}' +
        '});',
    },
    minify: true,
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
