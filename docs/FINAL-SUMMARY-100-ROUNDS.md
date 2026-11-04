# dsh-wiki-rag — 100 轮深度测试优化总结（v0.0.13）

- 周期：2026-11-04（9 批滚动执行，批间由 MainAgent 自动衔接）
- 范围：bundle/src/client（React 知识库面板）+ bundle/src/host + src/main（本地 HTTP API + SQLite + RAG）
- 提交：v0.0.13 批次 99 个提交（714fcad..HEAD），第 100 轮为本总结入库
- 状态：39 测试文件 / 498 用例 / Errors=0 全绿连跑验证；工作区干净；未发布（发布权在 MainAgent）

## 一、批次与轮次清单（9 批，每批独立验收）

| 批 | 轮次 | 主题摘要 | 验收 |
|---|---|---|---|
| 1 | 1-12 | 测试基建（jsdom/vitest 映射）、client logic.ts 纯逻辑层抽取+单测、host createApiHandler 抽取+请求级集成测试、导出文件名清洗/rerank 降级真问题修复、性能基准、对标研究 | V3 通过，68ee534 修 8 unhandled rejection |
| 2 | 13-24 | SCHEMA v5 回收站（软删/级联/restore/purge/empty/过滤）、dead code 清理 200+ 行、pruneJobs、embedding LRU、ZIP 导出、回收站 UI/命令面板 Ctrl+P/TOC/斜杠命令/深链高亮/RAG 面板 | V4 通过（无修复提交） |
| 3 | 25-40 | trash/export 并入 handler（injectable deps）、双链 [[ 联想、反向链接、块上移/下移、Ctrl+U、回收站计数、无障碍 aria、性能实测、jsdom 交互测试 | V5 通过（含中断收编 2 提交） |
| 4 | 41-55 | FTS5 评估（7x 快但中文召回未知）、purge 级联清 versions、角标 stale 修复、焦点陷阱、aria-setsize/posinset、快捷键矩阵、反链计数、命令面板扩展、状态路径复查 | V6 通过 |
| 5 | 56-65 | **FTS5 中文召回基准（unicode61 MISS → trigram 8/8 达标）→ SCHEMA v6 落地**（触发器+MATCH 切换+短词回退）、restoreVersion 语义、焦点陷阱补接、软删联动清除收藏/最近、搜索归一、命令面板清空回收站、反链失败态与竞态守卫 | V7 通过（FTS5 迁移逐项核对） |
| 6 | 66-74 | 软删 chunks 三路 JOIN 过滤（含 LIKE/退化漏过滤真问题修复）、restoreVersion 软删 404、filterActiveRefs、双链键盘夹紧、命令矩阵、listbox role、性能复测 | V8 通过 |
| 7 | 75-84 | FTS5 trigram 端到端、v6 幂等断言、MATCH 0.95ms 实测、反链排序、IME 门控、命令副标题、回收站容量 formatBytes、焦点矩阵记录 | V9 通过 |
| 8 | 85-92 | MATCH 大库路径端到端、i18n 终检 0 差异、定时器泄漏补齐、错误分支 26 处全覆盖、焦点矩阵终检、CHANGELOG、搜索历史 onBlur 竞态修复 | V10 通过 |
| 9 | 93-100 | purge 级联基准、docs 终稿（UX-SPEC 落地对账/CHANGELOG/ARCHITECTURE 摘要）、仓库卫生终检（0 untracked）、终检复跑、100 轮总结入库 | V11 通过（终验） |

## 二、测试增量与基线

| 阶段 | 测试文件 | 用例 | 说明 |
|---|---|---|---|
| v0.0.11 基线 | 32 | 352 | — |
| 第一批（12 轮） | 37 | 418 | +5 文件 / +66 例（logic 30 + jsdom 7 + host-api 11 + 自愈/导出/rerank） |
| 第二批（12 轮） | 38 | 433 | +15（trash-db 4 + 迁移 2 + embedding 2 + client 7） |
| 第三批（16 轮） | 39 | 458 | +25（interactions.dom 6 + logic 追加 + host-api 15 等） |
| 第四批（15 轮） | 39 | 469 | +11 |
| 第五批（10 轮） | 39 | 475 | +6 |
| 第六批（9 轮） | 39 | 485 | +10 |
| 第七批（10 轮） | 39 | 496 | +11 |
| 第八批（8 轮） | 39 | 497 | +1 |
| 第九批（7+1 轮） | 39 | 498 | +1 + 总结入库 |
| **终态** | **39** | **498** | **Errors=0 连跑验证，i18n zh/en 164/164 对称** |

client 测试分布：logic 56（纯函数，含 5000 节点 flatten <100ms 断言）+ storage.dom 7 + interactions.dom 20（fetch 桩契约测试）。

## 三、对标研究落地（docs/BENCHMARK-COMPARE-2026-11-04.md，28 条 O-xx）

| O-xx | 主题 | 状态 |
|---|---|---|
| O-07 | 回收站软删除（P0 合规） | ✅ SCHEMA v5 + 全端点 + UI 闭环 + 角标/容量 |
| O-01 | Ctrl+P 命令面板 | ✅ 7 命令 + 副标题 + listbox 语义 |
| O-02 | 文档内大纲 TOC | ✅ extractHeadings 纯函数 + 点击跳转 |
| O-03 | 斜杠命令 / | ✅ 空段落触发 + 键盘流 + IME 门控 |
| O-05 | RAG 语义问答面板 + 溯源 | ✅ 相关文档统计 + 面包屑 + mark 高亮 + 深链 |
| O-06 | 搜索深链高亮命中片段 | ✅ findLineIndex + 定位 + 2s 背景闪 |
| O-08 | 数据导出 ZIP | ✅ archiver 流式 + 软删过滤 + 空库 400 |
| O-04 | [[ 双链补全 | ✅ 联想 + 反向链接（计数/排序/失败态/竞态守卫） |
| O-10 | 段落块拖动 | ◑ 上移/下移按钮落地；自由拖拽评估后不落地（撤销栈风险） |
| O-09 | 富文本 Ctrl+B/I/U | ✅ 矩阵复查：B/I/Strike/Code 由 StarterKit 提供、U 补 Mod-u keymap |
| 其余 | 回收站容量/无障碍/aria/FTS5 | ✅ 均落地（见批次清单） |

## 四、关键性能结论（docs/BENCHMARK-2026-11-04.md + 各批实测）

- **FTS5 trigram 全文检索**：100k chunk 库 MATCH **0.95ms** vs 切换前 LIKE 预过滤 6.9ms（**7 倍提速**，远优于 <20ms 目标）；中文 trigram 召回基准 8/8 达标（unicode61 中文 MISS 已弃）；构建索引 91ms；触发器自动维护。
- **RAG 检索**：关键词命中预过滤 ~11ms；零命中退化 ~103ms；embedding fallback 哈希 + LRU memo（Map 2000，30% 重复省时 30%+，命中率曲线 0/10/30/50% → 0/10/33/50%）。
- **SQLite 写入**：replaceFileChunks 5000 chunk 事务化 ~113ms（对照逐条 ~340ms，3×）；purge 100 文件级联 <5s（实测毫秒级）。
- **并发导入**：20 文件 ~200 文件/s 全成功。
- **client**：5050 节点树 flatten 1ms；虚拟滚动视口 ±2 行、rAF 合并、不累积 DOM；卸载集中清理 9 类 timer/raf。

## 五、遗留项诚实清单（不阻塞交付）

1. purge 千万级性能基准（100 文件宽松断言已有）
2. ZIP 导出请求层端到端测试（DB 层单测已覆盖软删过滤）
3. 触发器并发竞态专项测试（better-sqlite3 单连接天然串行，无锁需求）
4. host dead code 复检（8e9dbf1 已清理一轮，后续未复检）
5. ARCHITECTURE.md 全量重写（SCHEMA v6/FTS5 分层已记录于 docs/BENCHMARK 与批报告）
6. /trash size 字段（client 已 `f.size||0` 回退 0B 安全降级）
7. v6 迁移中途失败恢复语义专项测试（user_version 门控已保证幂等）
8. i18n 使用键计数口径（docs 149 vs 正则 142，动态键名差异，不影响对称性与缺口）

## 六、发布建议

- 当前 HEAD 为 100 轮收口状态：39/498/Errors=0、i18n 164/164、工作区干净、lib 与 src 无漂移、client footer 完好。
- v0.0.12 轮 + v0.0.13 全部提交均未发布，package.json 版本号未动；建议由 MainAgent 决策发布节奏（可先发 v0.0.12 已验证轮，再评估 v0.0.13 收口轮）。
- 发布前建议执行：`cd bundle && node scripts/build-bundle.cjs` + 仓库根 `npx vitest run` 终检 + 三方 i18n 对账脚本复跑。
