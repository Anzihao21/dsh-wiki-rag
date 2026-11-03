# Contributing to dsh-wiki-rag

感谢你考虑为 `dsh-wiki-rag` 贡献代码。本文档说明本地开发、构建、测试与发布流程。

## 环境要求

- Node.js **>= 18**
- npm（仓库以 npm 管理依赖；根与 `bundle/` 各维护自己的 `package-lock.json`）

> 注意：DSH 官方依赖（`@deepseek-ai/dsh-type-meta` 等）在 npmmirror 上缺失，本机无法端到端起 DSH。宿主端到端验证受此限制，目前通过单测 + 构建 + 文档说明覆盖。

## 安装依赖

```bash
# 根目录（测试依赖、共享逻辑）
npm install

# bundle（插件打包单元）
cd bundle
npm install
```

## 构建

打包脚本：`bundle/scripts/build-bundle.cjs`（esbuild）。

```bash
cd bundle
node scripts/build-bundle.cjs
```

产物输出到 `bundle/lib/`：`host/index.js`（+map）、`client/index.js`（+map）、`cordis.patch.yml`。host external `@deepseek-ai/*` 与 `better-sqlite3`；client external react / jsx-runtime / cordis / slots；两端均开启 `minify`。

## 测试

```bash
# 全量单测（根目录）
npx vitest run
```

- 测试位于 `src/main/**/__tests__/*.test.ts`（Vitest）。
- 提交前请确保全量用例通过。
- 新增文件解析 / DB / RAG 逻辑时，应在对应模块 `__tests__/` 下补充用例。

## 代码约定

- 宿主逻辑位于根 `src/main/`，按领域分目录：`db` / `file` / `rag`；被 `bundle/src/host/index.ts` 引用打包。
- 客户端 UI 位于 `bundle/src/client/`，外部化 React，避免与宿主双实例。
- 新能力优先收敛到标准导入管线（识别 → 抽取 Markdown → 入库 → 重建索引）。
- 修改 DB schema 必须走 `sqlite-init.ts` 的 `MIGRATIONS` + `SCHEMA_VERSION` 增量迁移，禁止直接改 DDL 破坏既有库。
- 日志统一走 `log-db.writeLog`（结构化 level/meta）。

## 版本策略

- 正式版本线为 **`0.0.x`**，以 `0.0.1` 为初始，后续**末尾递增**（`0.0.1 → 0.0.2 → …`）。
- 历史 `1.x/2.x` 为早期开发迭代残留，已在 npmjs 上 `deprecate`，请勿继续使用。

## 发布流程

发布 = 递增版本 + 提交 + 打 tag + 推 GitHub + 发 npm，需 DSH 插件所有者账号。

```bash
# 1. 递增版本（根 + bundle 三处同步）
cd bundle && npm version 0.0.x --no-git-tag-version
cd .. && npm version 0.0.x --no-git-tag-version
# 同步 README 安装示例 dsh-wiki-rag@0.0.x

# 2. 构建 + 全量测试
cd bundle && node scripts/build-bundle.cjs
cd .. && npx vitest run

# 3. 提交 + 打 tag
git add -A && git commit -m "feat: v0.0.x ..."
git tag v0.0.x

# 4. 推送 GitHub
git push origin main --tags

# 5. 发布 npm（必须显式 registry；发布后约 60–70s 同步延迟，需等待后验证）
npm publish --registry=https://registry.npmjs.org/
npm view dsh-wiki-rag dist-tags --registry=https://registry.npmjs.org/   # 确认 latest 指向新版本
```

> 发布账号须已登录 npmjs（`npm whoami --registry=https://registry.npmjs.org/`）。默认 registry 是 npmmirror，发布务必显式 `--registry=https://registry.npmjs.org/`。

## 贡献流程

1. Fork 并创建特性分支。
2. 实现 + 补充测试 + 更新 `CHANGELOG.md`（在对应版本条目下记录）。
3. 全量测试通过后提交 PR，说明改动、测试覆盖与验证方式。
