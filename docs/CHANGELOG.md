# Changelog

## v0.0.13（2026-11-04）

### 写作体验
- 双链 [[ 联想菜单（行首触发/键盘流/插入 [[标题]]，IME 组合期间不弹）
- 反向链接面板（@下拉按标题搜索/score 排序/软删过滤/失败态/计数）
- 斜杠命令菜单、文档大纲 TOC、段落样式条 + 块上移/下移按钮
- 富文本快捷键：Ctrl+B/I（StarterKit）+ Ctrl+U（自绑 Underline）

### 文件管理
- 回收站骨架 + 恢复/彻底删除/清空 + 角标计数 + 容量显示
- 软删联动清除收藏/最近编辑时间
- 命令面板 Ctrl+P（新建/导入/导出/回收站/清空/设置，带副标题描述）

### 可靠性
- 纯逻辑层 logic.ts（filterLinks/dedupeRefs/countRefs/sortRefsByScore/filterActiveRefs/normalizeSearchHits/formatBytes 等）
- 单元测试 44 + jsdom 交互测试 24，共 68 例 client 测试
- 卸载定时器/竞态守卫（searchSeq/backlinksSeq）/焦点陷阱

### 无障碍
- 文件树 role=tree/treeitem + aria-expanded/selected/setsize/posinset/level
- 弹窗 role=dialog + aria-modal + useFocusTrap（Tab 循环/焦点还原）
- 命令面板 role=listbox

### 关键提交（client 侧）
- 双链 [[ 联想：`0be4947`；反链面板：`110e35e`；块上移/下移：`2fcdacc`；Ctrl+U：`e919f23`
- 回收站计数：`210b538`；a11y tree/dialog：`2b77f54`；性能基准：`dd72620`
- 焦点陷阱：`35ce831`；角标刷新：`f7783ec`；aria-setsize：`7ba2711`
- 软删联动：`ae945d0`；反链 score 排序：`ab6e13a`；IME 门控：`057b08b`
- 命令描述：`4aa55fd`；回收站容量：`089ec7c`；定时器泄漏修复：`83cd292`
- 搜索历史竞态修复：`0b56933`；UX-SPEC 对账：`06cbbb8`

### 测试基建
- logic.test.ts 46 例（纯函数 node 环境）
- storage.dom.test.ts 7 例（localStorage jsdom）
- interactions.dom.test.ts 15 例（fetch 桩/命令矩阵/端点序列 jsdom）
- 全量回归 497 例 Errors=0
