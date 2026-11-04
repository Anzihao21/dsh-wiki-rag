# Client 终稿数据（2026-11-04 v0.0.13i）

## logic.ts 导出纯函数（28 项）
- i18n：LOCAL_FALLBACK / makeTranslator / tt
- diff：computeDiff
- 树：flattenTree / collectFolderIds / subtreeFolderIds / findDocFolderPath
- 工具：toBase64 / buildDownloadName / formatBytes
- 守卫：shouldLeaveGuard / isJobTimedOut / JOB_TIMEOUT_MS
- 存储：KEY_RECENT / KEY_EDIT_TIMES / KEY_SEARCH_HISTORY / loadSearchHistory / saveSearchHistory / loadEditTimes / saveEditTimes / markEdited
- 命令/导航：filterCommands / extractHeadings / findLineIndex
- 链接/反链：filterLinks / dedupeRefs / countRefs / filterActiveRefs / sortRefsByScore
- 搜索：normalizeSearchHits

## 测试用例分布（83 client 例）
- logic.test.ts：56 例（node）
- storage.dom.test.ts：7 例（jsdom localStorage）
- interactions.dom.test.ts：20 例（jsdom fetch 桩/命令矩阵/端点序列）
