# dsh-wiki-rag

DeepSeek Harness（DSH）Wiki 风格知识库 RAG 插件。

本地优先的 Markdown Wiki 知识库 + 混合检索（向量 + 关键词）。将本地/局域网/网页/笔记中的文档统一抽取为 MD，归档原始文件，建立向量索引，供 Agent 通过工具检索。

## 特性

- **5 种导入来源**：本地单文件、文件夹批量、局域网共享路径、网页 URL 抓取、笔记文本
- **同名自动重命名**：与资源管理器一致，冲突自动追加 `(1)(2)`
- **源文件 Zip 归档**：每个知识条目独立归档原始文件，MD 编辑不触碰原始凭证
- **文件监听 + Diff 更新确认**：chokidar 监听源目录，外部改动弹出 diff，接受/拒绝
- **右键【从源目录更新】**：哈希比对 → 无改动跳过 / 有改动 diff 确认
- **Wiki MD 可视化编辑器**：所见即所得 + 源码双视图，编辑后自动刷新向量
- **RAG 切片 / 向量 / 检索**：chunk 大小与重叠可配置，Agent 工具 `wiki_rag_search`
- **快照备份**：手动一键打包，自动快照开关（默认关闭，非版本链）
- **异常容错**：超大文件拦截、断网降级、源文件丢失提示、DB 异常日志

## 技术栈

TypeScript + React + Electron + TailwindCSS + Vite + SQLite

## 目录结构

```
dsh-wiki-rag/
├── src/main/          # 主进程：db / file / rag / network / snapshot / ipc
├── src/renderer/      # 渲染进程：组件与页面
├── assets/icon.svg    # 侧边栏图标
└── test/test-case.ts  # 单元测试脚本
```

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## 迭代

项目采用 100 轮深度迭代，每轮提交、打标签（`v1.0.0.1` → `v1.0.0.100`）、推送双仓库（GitHub + Gitee）。

## 许可

MIT
