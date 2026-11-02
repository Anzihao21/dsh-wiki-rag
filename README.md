# dsh-wiki-rag

DeepSeek Harness（DSH）Wiki 风格知识库 RAG 插件。

本地优先的 Markdown Wiki 知识库 + 混合检索（向量 + 关键词）。将本地/局域网/网页/笔记中的文档统一抽取为 MD，归档原始文件，建立向量索引，供 Agent 通过工具检索。

## 特性

- **5 种导入来源**：本地单文件、文件夹批量、网页 URL 抓取、笔记文本
- **同名自动重命名**：与资源管理器一致，冲突自动追加 `(1)(2)`
- **源文件 Zip 归档**：每个知识条目独立归档原始文件，MD 编辑不触碰原始凭证
- **文件监听 + Diff 更新确认**：chokidar 监听源目录，外部改动弹出 diff，接受/拒绝
- **右键【从源目录更新】**：哈希比对 → 无改动跳过 / 有改动 diff 确认
- **Wiki MD 可视化编辑器**：侧栏内编辑/预览双视图，编辑后自动刷新向量索引
- **RAG 切片 / 向量 / 检索**：chunk 大小与重叠可配置，Agent 工具 `wiki_rag_search`
- **快照备份**：手动一键打包，自动快照开关（默认关闭，非版本链）
- **异常容错**：超大文件拦截、断网降级、源文件丢失提示、DB 异常日志

## 技术栈

TypeScript + React + Cordis (DSH Bundle) + SQLite + esbuild

## UI 与 DSH 官方一致

渲染层 UI 复刻自 DeepSeek Harness 官方 UI 体系（MIT 开源），保证插件在宿主内观感与原生一致：

- **设计令牌**：消费官方 `--dsw-alias-*` / `--dsw-specific-*` / `--dsw-static-*` CSS 变量（`src/renderer/styles/`），明暗主题由宿主 `body[data-ds-dark-theme]` 级联自动切换，无 hex 字面量、无 JS 主题切换
- **官方图标**：复刻官方产品图标集（`Icon*OutlineRegular/Medium`），继承 `currentColor`
- **官方组件**：Button / Tabs / InputField / SearchField / DropdownSelect / Switch / Modal / ConfirmModal，几何对齐 OmniMux 工作台（控件 32px、页头 `20px/600/28px`、基础圆角 8px、Dialog 16px）
- 图标 artwork 与令牌 CSS 源自官方 `deepseek-ai/deepseek-harness`（MIT License）

## 目录结构

```
dsh-wiki-rag/
├── bundle/
│   ├── src/host/       # 宿主端：Cordis 插件入口、8 个工具、SQLite、RAG 检索
│   ├── src/client/     # 客户端：React UI（DSH sidebar.workspaces slots 面板）
│   ├── lib/           # esbuild 构建产物
│   ├── cordis.patch.yml # DSH bundle 配置
│   └── package.json   # npm 发布包
├── assets/icon.svg     # 侧边栏图标
└── test/              # 单元测试
```

## 开发

```bash
pnpm install
cd bundle && npm run build   # esbuild 构建宿主 + 客户端
```

## 安装

```bash
dsh plugin --profile web add dsh-wiki-rag
```

## 许可

MIT
