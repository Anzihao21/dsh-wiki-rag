# dsh-wiki-rag 架构文档

> 本文描述 `dsh-wiki-rag` 的整体架构、模块划分、数据流与关键设计决策。
> 目标读者：插件开发者、维护者、审计人员。

## 1. 总览

`dsh-wiki-rag` 是运行在 **DeepSeek Harness（DSH）** 内的**标准 Cordis 插件**，提供本地优先的 Wiki 风格知识库 + RAG 混合检索。

- **宿主（host）**：`bundle/src/host/`，DSH 后端侧逻辑，负责文件导入、解析、入库、检索、日志、设置。
- **客户端（client）**：`bundle/src/client/`，DSH 客户端 UI，负责侧边栏、文件夹树、文件列表、富文本编辑器、导入面板、检索结果展示。

统一插件身份为 `dsh-wiki-rag`，单入口（`bundle/src/host/index.ts` + `bundle/src/client/index.tsx`），通过 `cordis.patch.yml` 声明 `dsh.bundle.patch` / `engines.dsh` / `dsh.client`，符合官方标准插件形态。

## 2. 仓库与构建结构

```
dsh-wiki-rag/
├── src/                     # 宿主后端逻辑（TypeScript，被 host bundle 打包）
│   └── main/
│       ├── db/              # SQLite 数据访问 + 迁移
│       ├── file/            # 导入管线、文件解析、网络重试、编辑冲突
│       ├── rag/             # embedding / rag-search / rerank / 分块
│       └── types.ts         # 共享类型（FileType、DB 行、API 契约）
├── bundle/                  # 插件打包单元
│   ├── src/host/index.ts    # 宿主入口（实际发布物）
│   ├── src/client/index.tsx # 客户端入口
│   ├── scripts/build-bundle.cjs  # esbuild 打包脚本
│   ├── lib/                 # 构建产物（host/client/cordis.patch.yml）
│   └── package.json
├── .github/workflows/       # CI / Release
└── docs/                    # 文档（架构、API、示例配置）
```

### 双入口收敛（历史决策）

历史上存在两套入口：根 `src/main/dsh-bundle.ts`（死配置，CI 不构建）与 `bundle/src/host/index.ts`（实际发布物）。已收敛为 **bundle 单一入口** 为标准形态，根 `src/` 仅承载可复用的宿主逻辑模块（被 bundle 引用）。

### 构建

- 打包脚本 `bundle/scripts/build-bundle.cjs`，使用 esbuild：
  - **host**：`format=esm`，external `@deepseek-ai/cordis` / `dsh-tools` / `schemastery` / `better-sqlite3`；内部打包 archiver / chokidar / diff / extract-zip / jszip / xlsx / pdf-parse / mammoth；banner 注入 `createRequire` 以兼容 CJS 库的动态 `require`。
  - **client**：`format=cjs` + `__ModuleLoader__.load` 外壳，external react / jsx-runtime / cordis / slots（宿主单例 React）。
  - 两端均开启 `minify`，产物体积：client ~515KB、host ~2.5MB。

## 3. 数据库（SQLite）

位置：用户数据目录下 `wiki.db`，better-sqlite3 驱动。`SCHEMA_VERSION=3` 记录于 `PRAGMA user_version`，启动时执行增量迁移（`src/main/db/sqlite-init.ts` 的 `MIGRATIONS` + `ensureColumn`）。

| 表 | 列 | 说明 |
|---|---|---|
| `knowledge_files` | `id, file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time, folder_id, sha256, status` | 知识库文件索引（`status` 默认 `'ready'`，支持软移除） |
| `folders` | 文件夹树 | 目录分组 |
| `vector_chunks` | `id, file_id, chunk_text, vector_blob` | 向量切片，混合检索候选 |
| `operation_log` | `action, detail, time, level, meta` | 结构化操作日志（`level`/`meta` 为 JSON） |

迁移版本：v1→v2 补 `sha256`/`status` 列；v2→v3 补 `operation_log.level`/`meta` 列。迁移通过 `PRAGMA table_info` 检查幂等，重复初始化不重复迁移。

事务辅助：`runInTransaction<T>(fn)`（better-sqlite3 `db.transaction`）用于批量写入，显著降低 WAL 提交开销。

## 4. 导入管线

`src/main/file/file-importer.ts` 统一入口 `importLocalFile`：

```
importLocalFile → withNetworkRetry(extractTextToMarkdown) → commitImport → reindex
```

1. **识别**：`scanParseableFiles` 扫描支持扩展名 `pdf|docx|md|txt|xlsx|xls|csv|pptx`。
2. **抽取为 Markdown**（`file-utils.extractTextToMarkdown`）：
   - `pdf`：`pdf-parse` 真实解析（空页/扫描件返回占位）；`docx`：`mammoth` 抽取文本；`sheet`：`xlsx` 每 Sheet 转 Markdown 表格；`pptx`：`jszip` 解压按真实页序提取文本；`url`：网页抓取（默认 5MB 限制）；`note`：笔记归档。
3. **入库**：`commitImport` 写 `knowledge_files` + 原文归档（`-note.zip` / TXT）。
4. **重建索引**：`reindex` 分块（`chunkTextSmart` / `chunkSheetTable`）→ **分批并发 embed（batch 8）** → `replaceFileChunks` 单事务批量替换。

异步导入带 `job.done/total/message` 进度上报（客户端 `JobState` 展示）。

网络容错：`unc-retry.ts` 提供 `isNetworkRetryableError`（9 类错误码）、`withNetworkRetry`（默认 3 次指数退避）、`checkUncAccess`（局域网权限检测），接入 file-importer / source-sync / file-watcher。

## 5. RAG 检索管线

`src/main/rag/rag-search.ts` 的 `ragSearch(query, topK, keywordWeight)`：

```
normalizeSearchInput（空串→null；topK clamp [1,50]）
  → embedText(query)
  → 全库向量相似度 + 关键词加权混合打分
  → 取 topK*3 候选
  → 可选 rerank 重排 → 返回 topK
```

- **embedding**：`embedText` 统一入口，provider 可选 `fallback`（哈希向量，默认）/ `openai`（OpenAI 兼容 API）/ `local`（本地 ONNX 模型）。质量随 provider 提升；接入真实模型时检索语义质量更高（质量基准测试 `rag-quality.test.ts` 同断言仍成立）。
- **打分**：`score = (1-keywordWeight)*vecScore + keywordWeight*kwScore`。
- **溯源**：结果含 `file_id / file_name / source_path / chunk_text / score / md_path / chunk_id / chunk_index`。
- **检索质量基准**：`src/main/rag/__tests__/rag-quality.test.ts` 端到端验证命中/排序/topK/空库兜底。

## 6. 富文本编辑器（client）

- **内核**：Tiptap v2（`@tiptap/core/react/starter-kit/pm` + `extension-table` 及 row/header/cell 独立子包 + `extension-link`），`useEditor` 组合 StarterKit + Link + Table。
- **交互**：浮动工具栏（`onSelectionUpdate` + `coordsAtPos`，选中才显示）。
- **保存链路**：`editor.getHTML()` → turndown 转回 Markdown（补删除线/表格规则）。
- **冲突检测**：`saveEdit` 携带 baseline，host 返回 `409` 时弹出确认（强制覆盖或放弃）。
- 新建文档入口命名为「新建文档」（`manual://` 链路，不归档）。

### 6.1 client 纯逻辑层与测试布局

- **`bundle/src/client/logic.ts`**：与 React/Tiptap 解耦的纯函数层（28 项导出），含 i18n 工厂、树扁平化、diff、守卫、存储、命令/链接/反链过滤、搜索归一、字节格式化。无 react/tiptap import，可在 node 环境直测。
- **测试布局**：`__tests__/logic.test.ts`（node，纯函数）、`storage.dom.test.ts`（jsdom，localStorage）、`interactions.dom.test.ts`（jsdom，fetch 桩/命令矩阵/端点序列）。
- **竞态守卫**：`searchSeq`/`backlinksSeq` 双序号丢弃过期响应；卸载 effect 集中清理定时器/rAF。
- **无障碍**：文件树 `role=tree/treeitem` + aria-expanded/selected/setsize/posinset/level；弹窗 `role=dialog` + `aria-modal` + `useFocusTrap`（Tab 循环/焦点还原）。

## 7. 可观测性

- 结构化日志：`log-db.writeLog(action, detail, { level, meta })`，`listLogs` 支持数字/对象 limit、按 action/level 过滤；`pruneLogs` 防表无限增长。
- host `/api/wiki/logs` 支持 `?action=&level=&limit=` 过滤，返回结构化 `level`/`meta`。
- i18n：`LOCAL_FALLBACK` 兜底字典 + `tt(t, key)` 统一替换，`wiki.count` 保留宿主插值。

## 8. 工程保障

- **测试**：Vitest，`src/main/**/__tests__/**/*.test.ts`，覆盖 DB 迁移、编辑冲突、导入、PDF/DOCX 解析、RAG 质量、日志等（30+ 文件 300+ 用例）。
- **CI/CD**：`.github/workflows/ci.yml`（npm ci + vitest + bundle 构建）、`release.yml`（npm publish `--registry=https://registry.npmjs.org/`）。
- **版本策略**：`0.0.x` 稳定线（0.0.1 起始，末尾递增），历史 1.x/2.x 已在 npmjs 上 deprecate。
- **发布流程**：见 `CONTRIBUTING.md`。
