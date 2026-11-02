# dsh-wiki-rag

[![npm version](https://img.shields.io/npm/v/dsh-wiki-rag.svg)](https://www.npmjs.com/package/dsh-wiki-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.5-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)

DeepSeek Harness（DSH）Wiki 风格知识库 RAG 插件。

本地优先的 Markdown Wiki 知识库 + 混合检索（向量 + 关键词 + 重排）。将本地/网页/笔记中的文档统一抽取为 MD，归档原始文件，建立向量索引，供 Agent 通过工具检索。

## 特性

- **5 种导入来源**：本地单文件、文件夹批量、网页 URL 抓取、笔记文本
- **同名自动重命名**：与资源管理器一致，冲突自动追加 `(1)(2)`
- **源文件 Zip 归档**：每个知识条目独立归档原始文件，MD 编辑不触碰原始凭证
- **文件监听 + Diff 更新确认**：chokidar 监听源目录，外部改动弹出 diff，接受/拒绝
- **从源目录更新**：哈希比对 → 无改动跳过 / 有改动 diff 确认
- **Wiki MD 可视化编辑器**：侧栏内编辑/预览双视图，编辑后自动刷新向量索引
- **多 Provider Embedding**：本地 ONNX 模型 / OpenAI 兼容 API / 哈希降级
- **多 Provider Rerank**：本地 cross-encoder / OpenAI 兼容 rerank API / 不重排
- **RAG 切片 / 向量 / 检索**：chunk 大小与重叠可配置，Agent 工具 `wiki_rag_search`
- **快照备份**：手动一键打包，自动快照开关（默认关闭）
- **异常容错**：超大文件拦截、断网降级、源文件丢失提示、DB 异常日志

## 安装

```bash
dsh plugin --profile web add dsh-wiki-rag
```

重启 DSH 后，左侧栏会出现「知识库」面板。

## 配置

在 DSH 的插件配置（`cordis.patch.yml` 或侧栏 ⚙️ 设置面板）中调整：

### Embedding 嵌入模型

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `embeddingProvider` | `local` / `openai` / `fallback` | `fallback` |
| `embeddingModelPath` | local 模式：本地 ONNX 模型目录路径 | 空 |
| `embeddingOpenAIBaseURL` | openai 模式：API 地址 | `https://api.openai.com/v1` |
| `embeddingOpenAIAPIKey` | openai 模式：API Key | 空 |
| `embeddingOpenAIModel` | openai 模式：模型名 | `text-embedding-3-small` |

**本地模型示例**（如 bge-small-zh-v1.5）：
```yaml
embeddingProvider: 'local'
embeddingModelPath: '/models/bge-small-zh-v1.5'
```

**OpenAI 兼容示例**（vLLM / Ollama / 任何兼容服务）：
```yaml
embeddingProvider: 'openai'
embeddingOpenAIBaseURL: 'http://localhost:8000/v1'
embeddingOpenAIAPIKey: 'sk-xxx'
embeddingOpenAIModel: 'bge-m3'
```

### Rerank 重排模型

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `rerankProvider` | `local` / `openai` / `none` | `none` |
| `rerankModelPath` | local 模式：本地 cross-encoder 模型目录 | 空 |
| `rerankOpenAIBaseURL` | openai 模式：rerank API 地址 | `https://api.openai.com/v1` |
| `rerankOpenAIAPIKey` | openai 模式：API Key | 空 |
| `rerankOpenAIModel` | openai 模式：模型名 | `rerank-multilingual-v3` |
| `rerankTopK` | 重排后返回条数 | `5` |

## Agent 工具

插件注册了 8 个 Agent 可调工具：

| 工具名 | 说明 |
|---|---|
| `wiki_rag_search` | 语义检索知识库（向量 + 关键词 + rerank） |
| `wiki_list_files` | 列出所有知识库条目 |
| `wiki_import_file` | 导入文件/文件夹/URL/笔记 |
| `wiki_sync_source` | 从源目录同步更新（diff 确认） |
| `wiki_delete_file` | 删除知识库条目 |
| `wiki_snapshot` | 创建快照备份 |
| `wiki_list_snapshots` | 列出所有快照 |
| `wiki_stats` | 知识库统计信息 |

## 技术栈

TypeScript + React + Cordis (DSH Bundle) + SQLite + esbuild

## 目录结构

```
dsh-wiki-rag/
├── bundle/
│   ├── src/host/       # 宿主端：Cordis 插件入口、工具、SQLite、RAG
│   ├── src/client/     # 客户端：React UI（侧栏面板 + 编辑器 + 设置）
│   ├── lib/           # esbuild 构建产物
│   ├── cordis.patch.yml # DSH bundle 配置
│   └── package.json   # npm 发布包
├── src/main/          # 纯业务逻辑模块（DB / 文件 / RAG / 快照）
├── assets/icon.svg     # 侧边栏图标
└── test/              # 单元测试
```

## 开发

```bash
pnpm install
cd bundle && npm run build   # esbuild 构建宿主 + 客户端
```

## 许可

[MIT](./LICENSE)
