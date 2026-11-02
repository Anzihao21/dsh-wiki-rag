# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 与语义化版本。

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
