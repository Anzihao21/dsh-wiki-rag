# dsh-wiki-rag

[![npm version](https://img.shields.io/npm/v/dsh-wiki-rag.svg)](https://www.npmjs.com/package/dsh-wiki-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH](https://img.shields.io/badge/DSH-0.2.1-rc.5-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![CI](https://github.com/Anzihao21/dsh-wiki-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/Anzihao21/dsh-wiki-rag/actions/workflows/ci.yml)

DeepSeek Harness（DSH）Wiki 风格知识库 RAG 插件。本地优先的 Markdown Wiki 知识库 + 混合检索（向量 + 关键词 + 重排），把本地文件、网页、笔记统一抽取为 Markdown 归档入库，供 Agent 通过 `wiki_rag_search` 工具检索。

## 功能清单

- **六大导入源**
  - 本地单文件（PDF / DOCX / MD / TXT）
  - 文件夹批量导入
  - 网页 URL 抓取（内置超时与内网/外网模式）
  - 笔记文本粘贴入库
  - 源目录监听（chokidar）增量同步
  - 局域网 UNC 共享路径
- **混合检索**：向量召回（多 provider embedding）+ 关键词 + cross-encoder rerank，结果带相关度评分
- **快照备份**：手动一键打包全部 MD + 归档 zip；可选自动快照开关；恢复前 Diff 二次确认
- **树形文件夹**：知识库侧栏按目录树分组浏览，支持新建文件夹、拖拽移动
- **Diff 确认**：源文件变更时行级三色 Diff（增/删/改），接受或拒绝后再写回
- **设置面板**：存储目录、切片参数、embedding/rerank provider、网络模式全部可视化配置
- **工程体验**：操作 Toast 反馈、加载骨架屏、虚拟列表长列表渲染、错误边界兜底、SVG 图标体系、快捷键

## 安装（DSH bundle 形态）

```bash
dsh plugin --profile web add dsh-wiki-rag
```

或从 npm 安装指定版本：

```bash
dsh plugin --profile web add dsh-wiki-rag@0.0.10
```

## 开发构建

仓库根目录为插件源码与宿主/客户端双端工程；可发布产物在 `bundle/` 下：

```bash
# 安装依赖（根目录使用 pnpm）
pnpm install

# 跑单元测试
npx vitest run

# 构建可发布 bundle（产物输出到 bundle/lib/）
cd bundle && npm install && npm run build

# 打 tarball
cd bundle && npm pack
```

## 目录结构

```
dsh-wiki-rag/
├── src/main/                # 宿主侧纯 TypeScript 模块（Node 侧）
│   ├── db/                  # better-sqlite3 单例：知识库 / 向量 / 操作日志
│   │   ├── sqlite-init.ts
│   │   ├── knowledge-db.ts
│   │   ├── log-db.ts
│   │   └── vector-db.ts
│   ├── file/                # 导入 / Diff / 监听 / 重名 / zip 归档
│   │   ├── file-importer.ts
│   │   ├── diff-compare.ts
│   │   ├── file-watcher.ts
│   │   ├── name-auto-rename.ts
│   │   ├── file-utils.ts
│   │   ├── source-sync.ts
│   │   └── zip-archive.ts
│   ├── rag/                 # 切片 / embedding / 检索 / 重排
│   │   ├── text-chunk.ts
│   │   ├── embedding.ts
│   │   ├── rag-search.ts
│   │   └── rerank.ts
│   ├── snapshot/            # 快照打包 / 恢复
│   │   └── snapshot-backup.ts
│   ├── network/             # 网页抓取
│   └── types.ts
├── src/renderer/            # 客户端 UI（React + Tailwind）
├── bundle/                  # 可发布 DSH bundle
│   ├── src/{host,client}/   # bundle 入口
│   ├── scripts/build-bundle.cjs
│   └── cordis.patch.yml     # cordis 插件行 patch
├── .github/workflows/       # CI / Release
├── docs/                    # 配置示例等文档
└── vitest.config.ts
```

## 配置项说明

配置写在 DSH 的 `cordis.patch.yml`（bundle 内置一份默认值），完整示例见
[docs/example.config.md](./docs/example.config.md)。常用项：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `mdStoragePath` | 知识库 Markdown 存储目录 | `.dsh-wiki-rag/md` |
| `zipStoragePath` | 原始文件 zip 归档目录 | `.dsh-wiki-rag/zip` |
| `chunkSize` | 切片大小（字符） | 500 |
| `chunkOverlap` | 切片重叠长度 | 80 |
| `webMode` | 网页抓取模式 `intranet` / `extranet` | `extranet` |
| `webTimeout` | 网页抓取超时（ms） | 15000 |
| `autoSnapshot` | 是否自动快照 | `false` |
| `embeddingProvider` | `local` / `openai` / `fallback` | `fallback` |
| `embeddingModelPath` | local 模式本地 ONNX 模型目录 | `''` |
| `embeddingOpenAIBaseURL` | openai 模式 embedding API 地址 | `https://api.openai.com/v1` |
| `embeddingOpenAIModel` | openai 模式 embedding 模型名 | `text-embedding-3-small` |
| `rerankProvider` | `local` / `openai` / `none` | `none` |
| `rerankTopK` | rerank 后返回条数 | 5 |

## 截图位置

> 以下截图暂未随仓库附带，发布前请替换为实际截图：

- `docs/screenshot-sidebar.png`：知识库树形侧栏 + 文档列表
- `docs/screenshot-diff.png`：源文件更新后的三色 Diff 确认弹窗
- `docs/screenshot-settings.png`：设置面板（存储目录 / 切片 / embedding provider）
- `docs/screenshot-snapshot.png`：快照管理与恢复入口

## License

MIT
