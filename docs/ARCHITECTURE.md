# dsh-wiki-rag 架构文档

> 本文描述 `dsh-wiki-rag` 的整体架构、模块划分、数据流与关键设计决策。
> 目标读者：插件开发者、维护者、审计人员。
> 更新至 v0.0.13 发布状态（100 轮深度测试优化收口后）。

## 1. 总览

`dsh-wiki-rag` 是运行在 **DeepSeek Harness（DSH）** 内的**标准 Cordis 插件**，提供本地优先的 Wiki 风格知识库 + RAG 混合检索。

- **宿主（host）**：`bundle/src/host/` + `src/main/`，DSH 后端侧逻辑，负责文件导入、解析、入库、检索、日志、设置、回收站、导出。
- **客户端（client）**：`bundle/src/client/`，DSH 客户端 UI，负责侧边栏、文件夹树、文件列表、富文本编辑器、命令面板、回收站视图、检索结果展示。

统一插件身份为 `dsh-wiki-rag`，单入口（`bundle/src/host/index.ts` + `bundle/src/client/index.tsx`），通过 `cordis.patch.yml` 声明 `dsh.bundle.patch` / `engines.dsh` / `dsh.client`，符合官方标准插件形态。

## 2. 仓库与构建结构

```
dsh-wiki-rag/
├── src/                     # 宿主后端逻辑（TypeScript，被 host bundle 打包）
│   └── main/
│       ├── db/              # SQLite 数据访问 + 迁移（SCHEMA v6）
│       ├── file/            # 导入管线、文件解析、网络重试、编辑冲突
│       ├── rag/             # embedding / rag-search / rerank / 分块（FTS5 + 向量混合）
│       ├── host-api/        # createApiHandler 可测路由层（deps 注入 + 白名单）
│       ├── e2e/__tests__/   # 请求级集成测试
│       └── types.ts         # 共享类型（FileType、DB 行、API 契约）
├── bundle/                  # 插件打包单元
│   ├── src/host/index.ts    # 宿主入口（实际发布物）
│   ├── src/client/index.tsx # 客户端入口
│   ├── src/client/logic.ts  # client 纯逻辑层（28 项导出，node 可测）
│   ├── scripts/build-bundle.cjs  # esbuild 打包脚本
│   ├── scripts/benchmark.cjs     # 性能基准脚本（临时文件自清理）
│   ├── lib/                 # 构建产物（host/client/cordis.patch.yml）
│   └── package.json
├── scripts/i18n-recon.cjs   # i18n 三方对账脚本（CI 可守）
├── .github/workflows/       # CI / Release
└── docs/                    # 文档（架构、UX 规格、基准、终检矩阵）
```

### 构建

- 打包脚本 `bundle/scripts/build-bundle.cjs`，使用 esbuild：
  - **host**：`format=esm`，external `@deepseek-ai/cordis` / `dsh-tools` / `schemastery` / `better-sqlite3`；内部打包 archiver / chokidar / diff / extract-zip / jszip / xlsx / pdf-parse / mammoth；banner 注入 `createRequire` 以兼容 CJS 库的动态 `require`。
  - **client**：`format=cjs` + `__ModuleLoader__.load` 外壳，external react / jsx-runtime / cordis / slots（宿主单例 React）；产物 footer 必须为 esbuild 生成的 `return module.exports;}});`（禁止硬编码 exports 赋值）。
  - 两端均开启 `minify`。
- lib 产物入库纪律：client/host 各 2 文件 + `cordis.patch.yml`，各侧只 add 自己侧产物，禁 `-A/.`。

## 3. 数据库（SQLite，SCHEMA v6）

位置：用户数据目录下 `wiki.db`，better-sqlite3 驱动。`SCHEMA_VERSION=6` 记录于 `PRAGMA user_version`，启动时执行增量迁移（`src/main/db/sqlite-init.ts` 的 `MIGRATIONS` + `ensureColumn`，`user_version` 门控幂等）。

| 表 | 说明 |
|---|---|
| `knowledge_files` | 文件索引：`id, file_name, source_path, md_path, zip_archive_path, file_type, create_time, last_sync_time, folder_id, sha256, status, deleted_at`（`deleted_at` 非空 = 回收站） |
| `folders` | 文件夹树：`id, name, parent_id, ... , deleted_at`（软删级联） |
| `vector_chunks` | 向量切片：`id, file_id, chunk_text, vector_blob`（FTS5 external content 源表） |
| `chunks_fts` | **FTS5 trigram 虚拟表**：`chunk_text, content='vector_chunks', content_rowid='id', tokenize='trigram'`（中文友好；触发器维护） |
| `file_versions` | 历史版本：`id, file_id, version, content, create_time`（每文件滚动保留，purge 级联清理） |
| `operation_log` | 结构化操作日志：`action, detail, time, level, meta` |

**迁移链 v1→v6（无空洞）**：
- v1→v2：`knowledge_files` 补 `sha256`/`status`；
- v2→v3：`operation_log` 补 `level`/`meta`；
- v3→v4：`file_versions` 表 + 索引；
- v4→v5：`knowledge_files`/`folders` 补 `deleted_at`（回收站软删）；
- v5→v6：`chunks_fts` FTS5 trigram 虚拟表 + 全量回填 + `vector_chunks` 的 AFTER INSERT/DELETE/UPDATE 触发器同步（external content 模式）。

迁移测试纪律：**先写迁移测试再实现**（新库全 schema、老库升级保留数据、幂等重跑、deleted_at/触发器联动断言）。`ensureColumn` 先 `PRAGMA table_info` 检查再 ALTER。

事务辅助：`runInTransaction<T>(fn)`（better-sqlite3 `db.transaction`）用于批量写入。

**回收站软删链路**（v5 引入，P0 合规）：
- `DELETE /files/:id`、`DELETE /folders/:id` → 软删（`deleted_at=now`），文件夹 BFS 级联软删子树与文档；不再物理 unlink（物理删除仅 purge/empty）。
- `GET /trash` → `{files:[{id,fileName,deletedAt,mdPath,size}], folders:[...]}`（size = md 字节，fs.stat 缺失容错 0）。
- `POST /trash/restore {id,type}`：文件父文件夹存活归位、父已删置根；文件夹父链一并恢复 + 子级联（restoreFolderCascade 每层先恢复直接文件再下钻）。
- `DELETE /trash/:type/:id`（purge）、`POST /trash/empty`：物理 unlink md/zip（容错缺失）+ 删 DB 行（purgeFileRow 级联删 file_versions；chunks 删除触发 fts 同步）。
- 所有检索/列表（list/tree/stats/search/pending-changes）均过滤 `deleted_at IS NULL`；不存在 id 的 restore/purge 返回 200 no-op（宽容语义）。

## 4. 导入管线

`src/main/file/file-importer.ts` 统一入口 `importLocalFile`：

```
importLocalFile → withNetworkRetry(extractTextToMarkdown) → commitImport → reindex
```

1. **识别**：`scanParseableFiles` 扫描支持扩展名 `pdf|docx|md|txt|xlsx|xls|csv|pptx`。
2. **抽取为 Markdown**（`file-utils.extractTextToMarkdown`）：`pdf`（pdf-parse，空页/扫描件占位）、`docx`（mammoth）、`sheet`（xlsx 每 Sheet 转 Markdown 表格）、`pptx`（jszip 按页序）、`url`（网页抓取 5MB 限制）、`note`（笔记归档）。
3. **入库**：`commitImport` 写 `knowledge_files` + 原文归档。
4. **重建索引**：`reindex` 分块 → **分批并发 embed（batch 8）** → `replaceFileChunks` 单事务批量替换（5000 chunk ~113ms，对照逐条 3× 收益）。

上传边界：`importUploadContent` 解码前字节预检 + 解码后复检，50MB 上限清晰报错；导出文件名经 `buildDownloadName` 清洗 Windows 非法字符。异步导入带 `job.done/total/message` 进度上报；`isJobTimedOut` 60s 轮询超时。

## 5. HTTP API 分层（createApiHandler）

`src/main/host-api/handler.ts` 导出 `createApiHandler(deps)`——与 DB/fs/watcher 解耦的可测路由层，`bundle/src/host/index.ts` 的 createServer 回调仅做适配（`json(r.status, r.body)`）。

- **deps 注入**：`dispatchImport` / `runImportJob` / `applySettingsPatch` / `publicSettings` / `ragSearch` / `writeLog` / `randomUUID` / `pruneJobs` / `trash`（list/restore/purge/empty）/ `exportZip`——未注入的依赖对应路由返回 501。
- **HANDLED_PATHS 白名单**（10 条）：`POST /import`、`POST /search`、`GET /logs`、`GET /stats`、`GET/POST /settings`、`GET /trash`、`POST /trash/restore`、`POST /trash/empty`、`DELETE /trash/:type/:id`、`POST /export/zip`。白名单内由 handler 提前返回，避免与内联路由重叠/双响应。
- **语义**：非法 JSON/参数 → 400；未注入 → 501；异常 → 500 且 body 只含 `{error}` 不泄露 stack；未匹配 → 404。
- 边界决策：tree/folders/files/versions/jobs 等与 DB/fs/watcher 紧耦合的路由**保持内联**（全量抽取风险高，明确取舍）。

## 6. RAG 检索管线（FTS5 三路 + 向量兜底）

`src/main/rag/rag-search.ts` 的 `ragSearch(query, topK, keywordWeight)`；候选池构建 `getChunksForSearch`（vector-db.ts）**按库规模分路**：

```
normalizeSearchInput（空串→null；topK clamp [1,50]）
  → getChunksForSearch 三路：
      ① 小库（≤200 chunks）：全表返回（内存打分全量更准）
      ② 大库长词（≥3 字符）：chunks_fts MATCH（trigram，引号转义防注入，OR 拼接）
      ③ 大库短词（<3 字符）：chunk_text LIKE 子串
      —— 三路均 JOIN knowledge_files 过滤 deleted_at IS NULL（软删不出候选池；恢复后自动可搜）
      —— 零命中退化：ORDER BY id DESC LIMIT N
  → embedText(query) 向量相似度 + 关键词加权混合打分（score = (1-keywordWeight)*vecScore + keywordWeight*kwScore）
  → 取 topK*3 候选 → 可选 rerank 重排 → 返回 topK（含 file_id/file_name/source_path/chunk_text/score/chunk_index 溯源）
```

- **embedding provider 体系**（`rag/embedding.ts`）：`fallback`（逐 gram sha256 哈希向量，默认；LRU memo Map 上限 2000，30% 重复场景省时 30%+）/ `openai`（OpenAI 兼容 API）/ `local`（本地模型）。实测 0.27ms/段。
- **rerank**（`rag/rerank.ts`）：OpenAI 兼容重排；**响应缺 results / index 越界时降级为原结果**（不抛 TypeError 拖垮检索）。
- **性能基线**（docs/BENCHMARK-2026-11-04.md）：100k chunk 库 FTS5 MATCH **0.95ms** vs LIKE 6.9ms（7×）；RAG 关键词命中 ~11ms；FTS5 trigram 中文召回基准 8/8 达标（unicode61 中文 MISS，已弃）。

## 7. 富文本编辑器与 client 纯逻辑层

- **内核**：Tiptap v2，`useEditor` 组合 StarterKit + Link + Table；浮动工具栏（onSelectionUpdate + coordsAtPos）；`editor.getHTML()` → turndown 转回 Markdown；`saveEdit` 携带 baseline，409 冲突弹确认（强制覆盖/放弃）。
- **快捷键矩阵**：Mod-b/i（Bold/Italic）、Mod-u（Underline，补 keymap）、Mod-shift-x（Strike）、Mod-e（Code）、Mod-shift-7/8（列表）由 StarterKit/自定义提供；Ctrl+F（搜索）、Ctrl+P（命令面板）、Ctrl+S（保存）为宿主/应用级，与编辑态文字快捷键无冲突。
- **块操作**：段落样式条「⋯」面板含上移/下移（ProseMirror 单事务交换兄弟节点，进撤销栈；首末段 no-op）；自由拖拽评估后不落地（撤销栈风险）。
- **双链与联想**：行首 `[[` 触发文件联想（filterLinks，Enter 插入 `[[标题]]`，Esc 关闭）；行首 `/` 触发斜杠块菜单；**IME 门控**：compositionstart/end 期间抑制联想（拼音组合不弹候选）。

### 7.1 client 纯逻辑层与测试布局

- **`bundle/src/client/logic.ts`**：与 React/Tiptap 解耦的纯函数层（28 项导出），含 i18n 工厂（tt + LOCAL_FALLBACK）、树扁平化（flattenTree，5000 节点 <100ms）、diff（computeDiff）、离开守卫（shouldLeaveGuard）、任务超时（isJobTimedOut）、存储读写（editTimes/searchHistory key 常量）、命令/链接/反链过滤（filterCommands/filterLinks/dedupeRefs/filterActiveRefs）、搜索归一（normalizeSearchHits）、大纲提取（extractHeadings/findLineIndex）、导出文件名清洗（buildDownloadName）、字节格式化（formatBytes）、引用计数（countRefs）。无 react/tiptap import，node 环境直测。
- **测试布局**：`__tests__/logic.test.ts`（node，56 例）、`storage.dom.test.ts`（jsdom，localStorage 7 例）、`interactions.dom.test.ts`（jsdom，fetch 桩契约，20 例）。
- **竞态守卫**：`searchSeq`/`backlinksSeq` 双序号丢弃过期响应；卸载 effect 集中清理 9 类 timer/rAF（含 paraHideTimer/hoverRaf）。
- **无障碍**：文件树 `role=tree/treeitem` + aria-expanded/selected/setsize/posinset/level；弹窗（ConfirmModal/命令面板/urlDialog）`role=dialog` + `aria-modal` + `useFocusTrap`（Tab 循环/焦点还原）；命令面板列表 `role=listbox`；toast `aria-live`。

## 8. 可观测性

- 结构化日志：`log-db.writeLog(action, detail, { level, meta })`，`listLogs` 支持数字/对象 limit、按 action/level 过滤；`pruneLogs` 防表无限增长（写日志每 200 次触发一次修剪，500 条上限）。
- host `/api/wiki/logs` 支持 `?action=&level=&limit=` 过滤。
- i18n：`LOCAL_FALLBACK` 兜底字典 + `tt(t, key)` 统一替换；zh/en 注册字典各 164 键完全对称；`scripts/i18n-recon.cjs` 固化对账（used 149 键全覆盖、死键 15 个归因标注、退出码非 0 违规，CI 可守）。

## 9. 工程保障

- **测试四层布局**（39 文件 / 503 例 / Errors=0，v0.0.14 补做后）：
  1. node 单测：logic.ts 纯函数（56 例）+ DB 迁移/回收站/向量/日志等；
  2. 请求级集成：host-api.test.ts 直调 createApiHandler（import/search/trash/export/settings 分支，400/404/409/500/501 语义）；
  3. jsdom 交互：storage.dom + interactions.dom（fetch 桩契约测试，27 例）；
  4. 大库性能基准：benchmark-large-db.test.ts（宽松上限断言）+ scripts/benchmark.cjs（可重跑、临时文件自清理）。
  - vitest 配置：include `src/main/**/__tests__/**` + `bundle/src/client/__tests__/**`，`environmentMatchGlobs` 映射 `*.dom.test.ts` → jsdom，`cache:false`、`singleThread:true`。
- **CI/CD**：`.github/workflows/ci.yml`（npm ci + vitest + bundle 构建）、`release.yml`（npm publish）。
- **版本策略**：`0.0.x` 稳定线；v0.0.10/v0.0.11 已发布，v0.0.12/v0.0.13 累积至发布（100 轮收口 HEAD）。
