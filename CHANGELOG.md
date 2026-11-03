# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 与语义化版本。

> 说明：正式版本线为 `0.0.x`。下方 `1.x/2.x` 为早期开发迭代的残留版本（已在 npmjs 上 deprecate），仅作历史记录保留，请以 `0.0.x` 为准。

## [0.0.2] - 2026-11-03

### Added
- Excel/CSV 导入（`xlsx` 每 Sheet 转 Markdown 表格），支持 `.xlsx/.xls/.csv`。
- PPTX 导入（`jszip` 解压按真实页序提取文本），支持 `.pptx`。
- PDF / DOCX 真实解析（`pdf-parse` / `mammoth`），替代占位；空页/扫描件 PDF 返回占位。
- DB 增量迁移机制：`SCHEMA_VERSION=3` + `MIGRATIONS` + `ensureColumn`，补 `knowledge_files.sha256/status` 与 `operation_log.level/meta` 列，幂等可重复初始化。
- 编辑冲突检测：保存接口接收可选 `baseline`，冲突返回 `409 {error:'conflict', diskContent}`，客户端弹出确认（强制覆盖 / 放弃）。
- 结构化日志与可观测性：`writeLog` 写入 `level/meta`，`listLogs` 按 action/level/limit 过滤，`pruneLogs` 防表无限增长。
- RAG 检索质量基准测试（端到端验证命中 / 排序 / topK / 空库兜底）。
- CI/CD workflow 重写（`ci.yml` / `release.yml`：npm ci + vitest + bundle 构建 + npm publish）。
- 富文本编辑器升级为 Tiptap v2（浮动工具栏、表格、链接）。

### Changed
- `reindex` 改为分批并发 embed（batch 8）+ 单事务批量插入，导入/重建索引性能显著提升。
- i18n 兜底字典补全缺失键，统一 `tt(t, key)` 替换硬编码中文。
- 依赖版本治理：消除 `npm ls` 的 `invalid:`（archiver/chokidar/diff/extract-zip/schemastery），`engines` 声明 `node >=18`。
- client/host 构建开启 `minify`，产物体积约降 49%（client ~1.0MB→515KB，host ~4.8MB→2.5MB）。
- 局域网共享权限检测与断网重试（`unc-retry.ts`）接入导入链路。

### Fixed
- 根/子构建统一为 npm 管理，移除陈旧的 `pnpm-lock.yaml`。

## [0.0.1] - 2026-11-03

### Added
- 初始版本：标准 DSH Cordis 插件形态（bundle 单一入口 + `dsh.bundle.patch`/`engines.dsh`/`dsh.client` 声明，插件身份 `dsh-wiki-rag`）。
- 六大导入源（本地文件 / 网页抓取 / 笔记 / 手册 / Excel / PPTX）统一抽取为 Markdown 归档入库。
- RAG 混合检索（向量 + 关键词 + 可选重排），Agent 通过 `wiki_rag_search` 工具检索。
- 文件夹树、右键「重新选择源文件夹」（`rebind-source`）、网页抓取大小限制、笔记原文 TXT 归档。
- 富文本编辑器（contenteditable → Tiptap）「新建文档」入口。
- 检索溯源（chunk/file/md_path/chunk_index）与进度上报。

## [2.1.0] - 2026-11-03

### Added
- 结构化日志模块 `src/main/utils/logger.ts`：分级（debug/info/warn/error）、JSON 格式、按天轮转日志文件
- 统一错误处理 `src/main/utils/errors.ts`：AppError 错误码体系、HTTP 错误响应封装
- `isDbInitialized()` 导出与 `walCheckpoint(mode)` 参数化支持
- ESLint + Prettier 配置，pre-commit hooks（lint + test），commitlint 规范
- i18n 国际化：67 条中英文词条，客户端硬编码中文全部抽取
- 测试用例从 72 扩展到 279：业务模块测试、边界场景测试、路径穿越防护、内存泄漏检测、性能基准
- CI 新增 npm audit 安全检查

### Changed
- HTTP 错误响应统一为 `{ error: { code, message, stack? } }` 格式
- 关键路径（DB 初始化、HTTP server 启动、import/search/snapshot）注入结构化日志

### Fixed
- 修复 `sqlite-init.test.ts` 中 2 个失败用例（`isDbInitialized` 未导出、`walCheckpoint` 不接受参数）

## [2.0.10] - 2026-11-03

### Fixed
- 客户端 `ErrorBoundary`：重试按钮通过 `key` 变化强制 children 重新挂载（不再只是 `hasError=false` 导致同一错误立即复现）；连续重试 3 次后按钮置灰并提示“请重启宿主”
- 新增本地 i18n 兜底字典 `LOCAL_FALLBACK` 与 `tt(t, key)` 助手：宿主 `t()` 缺失、抛错或返回 key 本身时回退到中文文案，避免 UI 直接暴露 `wiki.xxx`
- 虚拟列表边界：删除 / 折叠导致列表收缩时 `scrollTop` clamp 到 `rows.length * ROW_H` 之内，避免 `startIndex` 越界白屏；新增 `isEmpty` 空列表判定

## [2.0.9] - 2026-11-03

### Fixed
- `GET /api/wiki/update-check` 新增 5 分钟内存缓存：TTL 内直接返回上次 npm registry 查询结果，响应体附带 `cached: true/false` 便于客户端区分；避免客户端轮询 / 多面板同时触发时反复打 npm registry

## [2.0.8] - 2026-11-03

### Fixed
- 内存 `jobs` Map 新增 `pruneJobs()`：保留上限 50 条，超出时按 `startedAt` 升序删除最旧的**已结束**（done / error）job，running 中的 job 不参与清理
- 在 job 异步包装的 `finally` 与 `GET /api/wiki/jobs` 列表入口各触发一次 `pruneJobs`，避免长运行下后台任务历史无限堆积

## [2.0.7] - 2026-11-03

### Fixed
- `applySettingsPatch` 迁移逻辑重写：先收集 md/zip/snapshot 文件移动计划与 DB 更新计划，再 mkdir 目标目录；任意一步失败时反向 `rename` 回已移动的文件并抛出异常，旧目录与旧 DB 路径保持可用
- 全部文件移动成功后才统一更新 DB 路径，避免“文件已动但 DB 半更新”的中间态
- 非路径类设置（chunkSize / webTimeout / webMode 等）在迁移成功后再提交，失败时旧值不被污染

## [2.0.6] - 2026-11-03

### Fixed
- `FileWatcher` 重写：单例 chokidar 实例按路径增量 `add/unwatch`，`source_path → { fileId, fileName }` 映射避免 change 事件闭包串号
- 新增 500ms 防抖（同一文件连续写盘只回调一次），新增 `unwatchPath()` / `watchedCount()` 方法；`stop()` 清理所有防抖定时器
- 宿主删除条目时同步调用 `watcher.unwatchPath(source_path)`，避免已删除条目仍被监听
- 新增 4 例 file-watcher 单元测试（去重 / 防抖 / unwatch / stop）

## [2.0.5] - 2026-11-03

### Fixed
- `insertVectorChunk`：空文本 / 空白 / 空 Buffer 直接跳过，避免零向量污染余弦相似度计算
- 新增 `findKnowledgeFileBySourcePath`；`FileImporter.commitImport` 在入库前按 `source_path` 精确查重，同一来源重复导入直接返回旧记录（`skipped=true, reason='duplicate source'`），不再产生重复条目
- 新增 5 例 vector-db 单元测试

## [2.0.4] - 2026-11-03

### Fixed
- `sqlite-init`：开启 WAL 同时设置 `synchronous=NORMAL` / `wal_autocheckpoint=1000` / `foreign_keys=ON`
- 新增 `walCheckpoint(mode)` 与 `isDbInitialized()`；`closeDatabase` 关闭前自动执行 `wal_checkpoint(TRUNCATE)`，避免进程退出后 `-wal` 文件残留
- 宿主 dispose 钩子新增每 5 分钟一次的 `PASSIVE` checkpoint 定时器，并在插件卸载时清理定时器 + 关闭 DB
- 新增 4 例 sqlite-init 单元测试

## [2.0.3] - 2026-11-03

### Fixed
- `ragSearch` 入参防御：新增 `normalizeSearchInput`，空串 / 纯空白 / 非 string query 直接返回 `[]`（不进 embedding）；`topK` clamp 到 `[1, 50]`，非数字 / NaN 回退 5；超长 query 截断到 4000 字符；`keywordWeight` 越界回退 0.3
- HTTP `/api/wiki/search` 端点改用 `normalizeSearchInput` 统一校验，避免客户端传恶意 topK 拖垮排序
- 新增 6 例归一化单元测试

## [2.0.2] - 2026-11-03

### Security
- `web-crawler` 新增 `assertSafeFetchUrl`：抓取前统一拦截非 http(s) scheme（file/ftp/gopher）、link-local 段 `169.254.0.0/16`（含 AWS/GCP/阿里云等云元数据 `169.254.169.254`）、IPv6 link-local `fe80::/10` 与通配地址 `0.0.0.0` / `::`
- 内网模式下 `10.x` / `192.168.x` / `127.x` 仍按原语义放行（用户显式允许的内网访问范围）
- 新增 6 例 SSRF 单元测试

## [2.0.1] - 2026-11-03

### Security
- 新增 `src/main/file/path-guard.ts`：统一收口路径穿越校验
- `FileImporter.commitImport`：写入 MD 前对文件名做 `sanitizeFileName`（剔除目录分隔符 / `..` 段），并断言 `mdPath` 落在 `mdDir` 之内，防止笔记标题 / URL 派生名包含 `../` 导致越界写盘
- `restoreSnapshot`：解压快照 zip 时通过 `extract-zip` 的 `onEntry` 钩子逐条断言条目名落在目标目录内，拦截 zip-slip 攻击
- 新增 9 例 path-guard 单元测试

## [2.0.0] - 2026-11-03

### Added
- 知识库侧栏**树形文件夹**：目录树分组浏览、新建文件夹
- 设置面板支持**自定义存储目录**（MD / Zip 分别配置）
- 导入与索引过程**进度条**反馈
- 源文件更新 **Diff 三色视图**（增 / 删 / 改）
- **快照恢复**入口与二次确认
- 知识条目**溯源**：从检索结果跳回源文件
- 统一 **SVG 图标体系**
- 列表/编辑页 **骨架屏**加载态
- 操作 **Toast** 反馈
- 常用操作**快捷键**
- 长列表**虚拟滚动**
- 客户端**错误边界**兜底
- **Vitest 单元测试**：覆盖切片 / 哈希向量 / Diff / 重名 / 文件工具 / DB CRUD / 日志 / 快照往返
- **GitHub Actions CI**：PR 与主干自动跑测试 + 构建；打 tag 自动发布 npm

## [1.9.2] - 2026-11-02

### Added
- 六大导入源：本地单文件 / 文件夹批量 / 网页 URL / 笔记文本 / 源目录监听 / UNC 共享路径
- 混合检索：向量 + 关键词 + rerank
- 手动快照打包与恢复
- Wiki MD 可视化编辑器
- 多 provider embedding（local ONNX / OpenAI 兼容 / 哈希降级）
- 多 provider rerank（local cross-encoder / OpenAI 兼容 / 关闭）
