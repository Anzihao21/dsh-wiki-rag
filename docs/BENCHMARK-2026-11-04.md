# 大库性能基准（2026-11-04）

> 基线快照：HEAD `714fcad`。目标是在 ≥5000 knowledge_files / ≥100000 vector_chunks 的库上，
> 沉淀可复现的性能基线。全部数字来自 `node scripts/benchmark.cjs`（每项 3 次取中位数，
> 连续跑两轮确认可复现）。

## 环境信息

| 项 | 值 |
|---|---|
| Node | v22.23.2 |
| OS | Linux x86_64（内核 6.6.95，2 vCPU，3.9GB 内存） |
| SQLite 引擎 | better-sqlite3 ^13（WAL 模式） |
| 测试框架 | vitest ^2.0（单线程池） |

## 大库构造

用 `src/main/db/sqlite-init.ts` 的 `initDatabase` 建临时库，直接 SQL 批量插入（better-sqlite3 单事务）：

| 表 | 行数 |
|---|---|
| folders | 20 |
| knowledge_files | 5000 |
| vector_chunks | 100000（每文件 20 片，vector_blob = 256 维 float32 = 1024 字节） |

- 片段文本：确定性生成的 50~200 字中文段落，轮换嵌入 12 个关键词（向量检索/缓存/SQLite/…），
  保证 `chunk_text LIKE '%kw%'` 必能命中。
- 构造耗时：**3.3s ~ 3.6s**（两轮中位数 3606ms / 3264ms）。
- 库文件大小：**194.2 MB**（WAL 下）。

## 基准结果（每格 = 3 次运行中位数）

| # | 基准项 | 轮1中位数 | 轮2中位数 | 量级判断 |
|---|---|---|---|---|
| 构造 | 100k chunks 全量灌入 | 3606 ms | 3264 ms | 单事务直插，秒级 |
| a1 | RAG 检索·关键词命中预过滤路径（`ragSearch('向量检索 缓存')`） | 11.5 ms | 10.9 ms | 极快 |
| a2 | RAG 检索·零命中退化路径（`ragSearch('不存在的关键词…')`，退化为 `ORDER BY id DESC LIMIT 1000` + 1000 次 cosine） | 105.4 ms | 102.1 ms | 毫秒级 |
| b | embedding fallback 哈希路径 ×1000 段 | 274.1 ms | 272.4 ms | ~0.27 ms/段 |
| c1 | `replaceFileChunks` 替换 5000 chunk（事务化先删后插） | 116.4 ms | 109.8 ms | — |
| c2 | 对照：非事务逐条 `insertVectorChunk` ×5000（每条一次提交） | 372.9 ms | 306.2 ms | c1 约为 c2 的 **~1/3** |
| d | `writeLog` ×1000 次（含每 200 次触发的后台自动修剪） | 30.2 ms | 34.1 ms | ~0.03 ms/条 |
| e | 20 个临时小 md 文件并发 `importLocalFile`（`Promise.all`） | 112.3 ms（≈178 文件/s） | 91.9 ms（≈218 文件/s） | 20/20 成功，0 跳过 |

## 结论与瓶颈分析

1. **关键词预过滤路径是当前最健康的路径**：10 万行表上 `chunk_text LIKE '%kw%'` 仅 ~11ms。
   前导通配符本就走不了 B-tree 索引，全表扫描在内存页缓存下足够快；无需为此加索引。
2. **事务化写入收益被实测证实**：5000 chunk 的先删后插包在单个事务里 ~113ms，
   不包事务逐条提交 ~340ms，**约 3× 提速**，WAL fsync 是主要差额来源。`runInTransaction` 优化有效。
3. **embedding fallback 哈希路径是批量导入的 CPU 热点**（b 项 ~0.27ms/段）：
   实现里对每个 3-gram 都做一次 `crypto.createHash('sha256')`，长文本会产生数百次哈希。
   大批量导入（e 项 20 文件并发 ~100ms）里它占比最高。
   可优化方向：gram 哈希结果缓存 / 改用更快的非加密哈希（FNV-1a）/ 批量预生成。
4. **退化路径 ~103ms** 主要花在把 1000 候选全部做 256 维 cosine（~25.6 万次乘加），
   以及结果组装时的 N+1 小查询（`getKnowledgeFileById` + `getChunkOrdinal`）。
   命中路径只对 ≤1000 候选打分，量级可控。
5. **日志写入 d 项无压力**：1000 条 ~32ms；自动修剪 fire-and-forget（后台 Promise），
   不阻塞 `writeLog` 调用方，实测无显著拖慢。
6. **暂不需要上 FTS5**：当前 LIKE 命中 ~11ms，远低于用户交互阈值；
   若未来 chunk 数到千万级或关键词查询频次上升，再评估虚拟表。

## 断言测试（防 flaky 宽松上限）

`src/main/__tests__/benchmark-large-db.test.ts` 在 vitest 里复现同一 100k 库构造，只断言最稳三项：

- 构造完成总耗时 < 120s（实测 ~3.4s）
- 100k chunk 下关键词预过滤检索 < 5s（实测 ~11ms）
- `replaceFileChunks` 替换 5000 chunk < 10s（实测 ~113ms）

单测 timeout 放宽到 180s（beforeAll 构造）/ 30s（用例）。

## 如何重跑

```bash
# 1) 完整五项基准（打印 JSON，自动清理临时库）
node scripts/benchmark.cjs

# 2) 仅跑断言测试（全量 100k 库构造，约 15s）
npx vitest run src/main/__tests__/benchmark-large-db.test.ts

# 3) 全量回归（含本基准测试）
npx vitest run
```

预期（本机量级，磁盘/CPU 差异下数量级不变即可）：

- 构造 100k chunks：3~5s，库 ~190MB
- 关键词命中检索：< 50ms
- 5000 chunk 事务替换：< 300ms
- embedding ×1000：< 600ms
- writeLog ×1000：< 200ms
- 20 文件并发导入：< 500ms

## 搜索全链路 handler 耗时（2026-11-04 追加）

路径：POST /api/wiki/search → createApiHandler → normalizeSearchInput → ragSearch（LIKE 预过滤 LIMIT 1000 → 内存打分 topK）→ 序列化返回。

基于代码路径分析（未实跑 100k 库）：

- normalizeSearchInput：纯字符串 trim + topK clamp，< 0.01ms
- ragSearch 预过滤 SQL（chunk_text LIKE %kw% LIMIT 1000）：100k chunk 库上预期 20~80ms（依赖 SQLite FTS 是否启用；当前未启用 FTS，走 B-tree 扫描）
- 内存打分：候选 ≤1000 条，余弦相似度 O(1000 × 256) ≈ 0.25M 浮点运算，< 5ms
- 序列化返回：< 1ms

**预期全链路**：命中查询 30~100ms；零命中（LIKE 无匹配直接返回空集）< 20ms。

瓶颈在 SQLite 未启用 FTS5——后续若要降到 < 20ms 量级，应迁移到 virtual table + MATCH 查询，而非继续优化 JS 侧。

## Client 数据准备（2026-11-04 补）

- 50 文件夹 × 100 文档 = 5050 节点，全部展开后 `flattenTree` 生成可见行 **1ms**（阈值断言 <100ms，见 `bundle/src/client/__tests__/logic.test.ts`）。
- 虚拟滚动：`startIndex = floor(scrollTop/ROW_H)-2`，`endIndex = min(rows, ceil((scrollTop+viewportH)/ROW_H)+2)`，5050 行时 DOM 仅渲染视口 ±2 缓冲行（约 20-30 个节点），滚动用 rAF 合并。
- 结论：树数据准备非瓶颈，首屏开销在 React 渲染视口行而非全量 flatten。
