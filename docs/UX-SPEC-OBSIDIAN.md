# dsh-wiki-rag UX 规格（Obsidian 对标版）

> 适用范围：`bundle/src/client/index.tsx` 中 `WikiSidebar` 及其全部子结构（约 2480 行单文件）。
> 本规格只描述交互与视觉规格，不规定实现框架；所有颜色/圆角/阴影**必须**引用宿主全局 `--dsw-*` 令牌，禁止硬编码色值。
> 设计令牌来源：`src/renderer/styles/dsh-design-platform.css`、`dsh-base.css`、`dsh-focus.css`、`dsh-toast.css`、`dsh-tooltip.css`、`dsh-menu.css`。
> 编码约定：动画时长统一用 `120ms ease-out`（悬停显隐）/ `200ms ease`（面板展开）/ `300ms ease`（进度条/位置变化）；`prefers-reduced-motion: reduce` 时全部过渡降为 `none`。

## 0.1 设计原则（编码前先读）

1. **密度优先**：侧栏是工具区，不是内容区。行高 32px、字号 12–13px、padding 紧凑；不要为了"好看"放大间距。
2. **hover 才暴露**：常驻 UI 越少越好。操作按钮（⋯、★、导入）默认隐藏，行 hover 才出现；右键菜单承担低频操作。
3. **令牌驱动**：所有颜色/圆角/阴影/边框必须用 `--dsw-*` 令牌。遇到令牌表没有的，先查 `dsh-design-platform.css`，不要自己加 hex。
4. **键盘可达**：所有鼠标操作必须有键盘等价路径（Tab/Enter/Esc/方向键）。
5. **不打断编辑**：轮询到外部变更、导入完成、自动保存失败，都不要突然弹 Modal；用徽标 + Toast 提示，让用户主动点。
6. **明暗一致**：不要在组件里写"深色背景用白字"；用 `--dsw-alias-label-*` 令牌，主题切换自动跟随。

## 0. 关键令牌速查（编码时直接引用）

| 用途 | 令牌名 |
|---|---|
| 层级背景 | `--dsw-alias-bg-base` / `-layer-1` / `-layer-2` / `-layer-3` / `-module-platform` / `-overlay` / `-skeleton` |
| 文档选区 | `--dsw-alias-bg-document-selection` |
| 文本 | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` / `-caption` / `-primary-foreground` / `-primary-inverted` / `-primary-bluish` |
| 边框 | `--dsw-alias-border-l1` / `-l2` / `-l3` / `-l4` / `-inverted` |
| 交互态 | `--dsw-alias-interactive-bg-hover` / `-active` / `-hover-accent` / `-hover-danger` / `-hover-solid` |
| 主色 | `--dsw-alias-state-business-primary` / `-tertiary` |
| 状态色 | `--dsw-alias-state-success-primary` / `-secondary` / `-tertiary`；`--dsw-alias-state-warn-primary` / `-secondary` / `-label`；`--dsw-alias-state-error-primary` / `-secondary`；`--dsw-alias-state-idle-primary` |
| 选中/激活 | `--dsw-specific-sidebar-nav-item-active` / `-hover` / `-active-accent` |
| 链接 | `--dsw-alias-link` |
| 圆角 | `--dsw-radius-xs`(4) / `-sm`(8) / `-md`(12) / `-lg`(16) / `-xl`(20) / `-panel`(28) |
| 阴影 | `--dsw-shadow-lv1` / `-lv1-blur` / `-lv2` / `-lv3` |
| 遮罩 | `--dsw-alias-bg-mask-1`(24%) / `-mask-2`(12%) / `-mask-3`(48%) / `-mask-drop` |
| Tooltip/Toast | `--dsw-alias-tooltip-bg` / `-toast-bg` / `-toast-label` / `-tooltip-key-bg` |
| 菜单表面 | `--dsw-alias-menu-group-header-fill` / `--dsw-specific-menu` |
| 焦点环 | 全局 `:focus-visible` 已用 `--dsw-focus-ring-color`（= business-primary）+ `--dsw-focus-ring-width`(2px)，**不要再手写 outline** |

> ⚠️ 现状代码里大量使用了**不存在**的令牌（会 fallthrough 到黑色/透明）：
> `--dsw-alias-state-danger`、`--dsw-alias-state-warning`、`--dsw-alias-state-success`、
> `--dsw-alias-label-on-primary`、`--dsw-alias-bg-layer-0`、
> `--dsw-alias-state-*-bg`、`--dsw-alias-state-success-bg/-danger-bg/-warning-bg`。
> 下文改进条目会逐条纠正为正确令牌名。

---

## 1. 左侧文件树 / 列表

### 1.1 成熟产品怎么做（Obsidian File Explorer / VS Code Explorer / Notion sidebar）

- **行高**：Obsidian 文件行 ≈ 34–36px，文件夹行 ≈ 28–30px，紧凑模式 24px；行高固定，不随内容换行。VS Code 默认 26px（文件）+ 26px（文件夹）。本插件侧栏宽 260px，取文档行 32px、文件夹行 30px，密度与可读性平衡。
- **缩进**：每层 16–20px；层级间画 1px 缩进引导线（`--dsw-alias-border-l1`），hover 当前行时整条祖先链引导线高亮为 `--dsw-alias-border-l3`。VS Code 的 indent guide 是虚线，Obsidian 是实线，本插件选实线（更轻）。
- **图标**：展开箭头是 90° 旋转的 chevron（`▶→▼` 用 `transform: rotate(90deg)`，120ms ease），不是字形 ▼/▶。文件夹图标 vs 文件图标视觉重量不同：文件夹 `font-weight: 600` + `--dsw-alias-label-primary`，文件 `font-weight: 450` + `--dsw-alias-label-primary`。
- **hover 行**：整行背景 `--dsw-alias-interactive-bg-hover`（6% 透明），圆角 `--dsw-radius-sm`；行尾操作按钮（⋯、★）**默认 opacity 0，hover 行时 1→0.9**，避免常驻视觉噪音。Obsidian 是 hover 行才显示 ⋯，本插件对齐。
- **长文件名**：`text-overflow: ellipsis` + `title={完整路径}`；hover 400ms 后用 dsw-tooltip 显示完整名 + 所在文件夹链。Obsidian 是 native title，Notion 是自定义 tooltip，本插件用 dsw-tooltip（已在宿主样式里）。
- **拖拽落点**：拖入文件夹中心 → 整行 `--dsw-specific-sidebar-nav-item-active-accent` 高亮（= 移入）；拖到行上/下 25% 区域 → 显示 2px 蓝色落点线（reorder，本期不实现，仅保留移入语义）。Obsidian 拖文件夹到另一个文件夹上时若会形成循环，行变红色且禁止 drop。
- **空文件夹**：展开后显示一行灰色斜体"空文件夹"（`--dsw-alias-label-caption`）。
- **根目录**：树顶部显示一个不可折叠的"全部文件 / Root"行，作为拖拽根落点。
- **自动定位**：Obsidian File Explorer 有个开关"Automatically reveal active file"，打开后切文档自动滚动到树中并高亮。本插件从搜索/最近打开跳转时必须有此行为。

### 1.2 差距清单

- **G-01**：行高 `ROW_H=38`（index.tsx:656），文件夹行与文档行同高；文件夹 `font-weight:600`、文档 `font-weight:500`，视觉层级没拉开。
- **G-02**：展开箭头用字形 `▼/▶`（index.tsx:1685），无旋转动画，与图标风格不统一；不同系统字体下字形宽度不一致导致抖动。
- **G-03**：无缩进引导线；文件夹 `paddingLeft=8+depth*14`（index.tsx:1682）、文档 `paddingLeft=22+depth*14`（index.tsx:1713），两级缩进量不一致（14 vs 22），深层对不齐。
- **G-04**：行无 hover 背景；hover 时行尾 ⋯ / ☆ 按钮常驻显示（index.tsx:1695、1727），视觉嘈杂。
- **G-05**：长文件名 ellipsis 但无 `title` 属性、无 tooltip；`row.title` 直接截断，用户看不到完整名。
- **G-06**：拖拽文件夹行 `onDragOver` 只 `preventDefault()`（index.tsx:1662），无目标高亮；拖入子文件夹时无防循环视觉提示（只有事后 toast "不能移动到自身的子文件夹下"，index.tsx:1079）。
- **G-07**：空文件夹展开后无占位行，用户无法判断是"空"还是"加载失败"。
- **G-08**：无根目录落点；拖到面板顶部区域无法移回根目录。
- **G-09**：激活文档行用 `borderLeft: 2px solid business-primary`（index.tsx:1716），但整行背景色 `--dsw-specific-sidebar-nav-item-active` 与 hover 色反差不足；切换文档时无 flash 高亮动画。
- **G-10**：收藏/最近打开区的条目（index.tsx:1519、1532）没有 hover 背景、没有图标、与文件树行视觉风格脱节。
- **G-11**：状态筛选 tab（index.tsx:1599）用 `flex:1` 四等分，文字"全部/已索引/待同步/异常"在窄侧栏会挤；选中态用 `--dsw-specific-sidebar-nav-item-active` 但无底色块区分。
- **G-12**：底部统计栏（index.tsx:1740）用 `borderTop: 1px solid --dsw-alias-border-l1`，但状态图例里的圆点颜色又用了不存在的 `--dsw-alias-state-success/-warning/-danger`。

### 1.3 改进条目

| 编号 | 改动点 | 具体规格 | 涉及位置 | 验收标准 |
|---|---|---|---|---|
| **A-01** | 统一行高与缩进 | `ROW_H` 改 32px；所有行 `paddingLeft = 12 + depth*16`（文件夹与文档同基准），文档行图标再缩进 16px 对齐箭头列。 | `ROW_H` 常量、folder 行 style `paddingLeft`、doc 行 style `paddingLeft`（index.tsx:1682、1713） | 文件夹/文档在同一深度左缘对齐；视觉密度与 Obsidian 一致。 |
| **A-02** | chevron 旋转动画 | 把 `▼/▶` 替换为内联 SVG chevron（10×10，`stroke=currentColor; stroke-width=2`），样式 `transition: transform 120ms ease-out`，展开时 `transform: rotate(90deg)`；颜色 `--dsw-alias-label-tertiary`。 | index.tsx:1685 渲染处 | 展开/折叠箭头平滑旋转，无字形跳变。 |
| **A-03** | 缩进引导线 | 每层深度画一条 1px 竖线：`position:absolute; left: 12+depth*16-8; top:0; bottom:0; width:1px; background: var(--dsw-alias-border-l1)`。hover 当前行时，该行及所有祖先 depth 的引导线 `background: var(--dsw-alias-border-l3)`。 | 行渲染内叠加层 | 鼠标移到深层文档行时，整条祖先缩进链变亮。 |
| **A-04** | 行 hover 与操作按钮 | 行默认 `background: transparent`；hover 时 `background: var(--dsw-alias-interactive-bg-hover); border-radius: var(--dsw-radius-sm); transition: background 120ms`。行尾 ⋯ / ☆ 按钮 `opacity: 0; transition: opacity 120ms`；行 hover 时 `opacity: 0.7`，按钮自身 hover 时 `opacity: 1`。 | folder 行、doc 行 style；`iconBtn` | 静止状态看不到星号和 ⋯，鼠标移上去才出现。 |
| **A-05** | 长文件名 tooltip | 对标题 `<span>` 加 `title={row.title}`；并接入 dsw-tooltip（延迟 400ms 显示），内容 = `row.title` + 换行 + `所在：/根/父文件夹`（用 `findDocFolderPath` 结果拼中文名）。 | folder/doc 标题 span | 截断文件名悬停后能看到完整名与路径。 |
| **A-06** | 拖拽目标高亮 | 新增 state `dropTargetId: number\|string\|null`。folder 行 `onDragEnter` 时设置（仅当被拖对象≠自身且不在自身子树内），行背景改为 `var(--dsw-specific-sidebar-nav-item-active-accent)`；`onDragLeave/onDrop` 清除。若 `subtreeFolderIds` 命中目标，行背景改为 `var(--dsw-alias-interactive-bg-hover-danger)` 且 `onDrop` 不触发移动。 | folder 行 onDragOver/onDrop、`doMoveFolder` | 拖到非法子文件夹时红色提示，松开无操作；拖到合法文件夹时蓝色高亮。 |
| **A-07** | 空文件夹占位 | folder 展开后若无 children，追加一行 `depth+1` 的占位：`paddingLeft: 12+(depth+1)*16; fontSize: 11; color: var(--dsw-alias-label-caption); font-style: italic; line-height: 28px`，文案"空文件夹"。 | `flattenTree` 后渲染阶段 | 空文件夹展开后可见灰色"空文件夹"。 |
| **A-08** | 根目录落点 | 文件树顶部（收藏/最近区下方、搜索框上方）加一个不可折叠的根行：图标用 `FolderIcon`、文案"全部文件"、`data-root=true`、`height: 28px`；`onDrop` 时 `doMoveDoc(fileId, null)` / `doMoveFolder(id, null)`。 | 列表区顶部 | 拖文档到"全部文件"行可移回根目录。 |
| **A-09** | 激活行 flash 动画 | 切换 activeId 时，目标行加 600ms 动画：`@keyframes row-flash { from { background: var(--dsw-alias-interactive-bg-hover-accent); } to { background: var(--dsw-specific-sidebar-nav-item-active); } }`。 | `active` 判定处 | 从搜索/最近打开文档时，树中目标行闪一下再稳定为激活色。 |
| **A-10** | 状态点与图例视觉 | `stale` 用 `--dsw-alias-state-warn-primary`、`error` 用 `--dsw-alias-state-error-primary`、`ready` 不显示（现状对）；圆点直径 6px，外层加 `opacity: 0.9`。修正 index.tsx:1753–1755 图例里的 `--dsw-alias-state-success/-warning/-danger` 为上述正确令牌。 | index.tsx:1731、1753–1755 | 图例与行内圆点颜色一致；无令牌 fallthrough。 |
| **A-11** | 收藏/最近条目视觉统一 | 收藏/最近条目改为与文件树行同高（28px）、同 hover 背景（`--dsw-alias-interactive-bg-hover`）、同 paddingLeft（12px）；左侧加 FileIcon（12px）；当前 activeId 对应的收藏条目加 `--dsw-specific-sidebar-nav-item-active` 底色。 | index.tsx:1519、1532 | 收藏/最近条目与文件树行视觉一致。 |
| **A-12** | 状态筛选 tab | 改为 pill 风格：`padding: 3px 10px; borderRadius: var(--dsw-radius-sm); fontSize: 11px`；选中态 `background: var(--dsw-specific-sidebar-nav-item-active); color: var(--dsw-alias-state-business-primary)`，未选中 `color: var(--dsw-alias-label-secondary)`；容器 `gap: 4px; flex-wrap: wrap` 而非四等分。 | index.tsx:1599 | 窄侧栏下 tab 不挤压，选中态有底色块。 |
| **A-12b** | 拖拽导入遮罩 | 全屏拖拽遮罩（index.tsx:1424）改为：背景 `var(--dsw-alias-bg-mask-2)`、虚线边框 `2px dashed var(--dsw-alias-state-business-primary)`、中央显示上传图标（24px）+ 文案"释放以导入到知识库"；遮罩出现/消失用 `opacity 150ms ease` 过渡。禁止拖拽时页面滚动。 | index.tsx:1424–1426 | 拖文件到面板时遮罩淡入，释放后淡出。 |

---

## 2. 搜索体验

### 2.1 成熟产品怎么做（Obsidian Quick Switcher / Notion search / VS Code Quick Open）

- **输入框**：左侧放大镜图标、右侧清除 ✕；聚焦时 `border: 1px solid var(--dsw-alias-state-business-primary)` + 3px 柔光 `--dsw-alias-state-business-tertiary`。
- **防抖**：输入停止 250–300ms 自动触发搜索，不必回车；Obsidian Quick Switcher 即实时。VS Code Quick Open 也是边敲边出。
- **结果面板**：每条结果 = 文件名（粗体）+ 匹配片段（命中词 `mark` 高亮，背景 `--dsw-specific-bubble-highlight`）+ 所在文件夹面包屑（`--dsw-alias-label-caption`，11px）；**不展示** `score 0.832` 这类技术字段。Notion 还会在每条结果右侧显示文档类型图标。
- **键盘导航**：↑↓ 在结果间移动，当前项 `background: var(--dsw-specific-sidebar-nav-item-active)`；Enter 打开；Esc 清空并关闭面板、焦点回编辑器。VS Code 还支持 Ctrl+Enter 在新编辑器打开。
- **定位回树**：打开结果后自动展开祖先文件夹、滚动到该行、执行 flash 动画（A-09）。Obsidian 是右键结果 → "Reveal file"。
- **空/离线**：无结果时显示 🔍 图标 + "未找到「xxx」" + 建议（试试更短关键词 / 检查拼写）；离线时输入框下方显示黄色横幅"离线模式，仅搜本地缓存索引"。

### 2.2 差距清单

- **G-13**：搜索只在 Enter 触发（index.tsx:1544 `onKeyDown`），无防抖自动搜；用户必须敲回车才能看到结果。
- **G-14**：结果卡片展示 `score 0.832`（index.tsx:1646）与完整 `sourcePath` 绝对路径，对用户无意义。
- **G-15**：命中词无高亮；片段是前 120 字裸文本（index.tsx:1643），不提示哪段匹配。
- **G-16**：无 ↑↓ 键盘导航、无 Esc 关闭；只能鼠标点。
- **G-17**：打开结果后 `setScrollToFileId` 滚动但无 flash 高亮（A-09 尚未做）；路径展开逻辑有，但用户感知不到"我定位到了哪里"。
- **G-18**：无结果只显示"无搜索结果"（index.tsx:1617），无建议、无重试入口。
- **G-19**：离线时搜索直接 toast "离线/宿主未连接"（index.tsx:1027），输入框本身不提示；用户不知道是输入问题还是网络问题。
- **G-20**：搜索框 placeholder 是 `wiki.search` = "搜索文档…"（index.tsx:1545），但旁边 + 菜单的 tooltip 也是 `wiki.more` = "更多"（index.tsx:1552），两个按钮 tooltip 撞名。

### 2.3 改进条目

| 编号 | 改动点 | 具体规格 | 涉及位置 | 验收标准 |
|---|---|---|---|---|
| **A-13** | 输入框视觉 | 左侧 14px 放大镜 SVG（`--dsw-alias-label-tertiary`）；`height: 30px; padding: 0 28px 0 30px; border-radius: var(--dsw-radius-md); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1)`。`:focus` 时 `border-color: var(--dsw-alias-state-business-primary); box-shadow: 0 0 0 3px var(--dsw-alias-state-business-tertiary); outline: none`。右侧 ✕ 仅在 `q` 非空时显示。 | `searchInputStyle`、index.tsx:1541 | 输入框聚焦有 3px 主色柔光描边。 |
| **A-14** | 防抖自动搜 | `onChange` 后 `setTimeout(280ms)` 自动调 `doSearch()`；清空输入时 `setSearchResults(null)`。Enter 立即搜（不等防抖）。维护 `searchInflight` 防止并发覆盖旧结果（用序号丢弃过期响应）。 | index.tsx:1543 onChange、`doSearch` | 连续输入不抖动；停止输入 280ms 后自动出结果。 |
| **A-15** | 结果卡片信息结构 | 每条：第一行 = 文件名（13px, 600）+ 类型 badge（`--dsw-alias-bg-module-platform` 底）；第二行 = 片段，命中词用 `<mark style="background: var(--dsw-specific-bubble-highlight); color: inherit; padding: 0 2px; border-radius: 2px">`；第三行 = 所在文件夹面包屑（用 `/` 连接，11px, `--dsw-alias-label-caption`），**删除 score 与绝对 sourcePath**。 | index.tsx:1632–1648 | 结果卡片不出现 "score" 字样；命中词有底色高亮。 |
| **A-16** | 键盘导航 | 新增 `activeResultIdx: number` state；结果容器 `onKeyDown`：↓ `+1`（封顶最后一项）、↑ `-1`（归 0）、Enter 打开 `activeResultIdx` 对应项、Esc 清空 `q` 与 `searchResults` 并 blur。当前项 `background: var(--dsw-specific-sidebar-nav-item-active); border-radius: var(--dsw-radius-sm)`。 | 结果容器 onKeyDown、渲染时按 idx 判 active | 键盘 ↑↓ 能在结果间移动并高亮，Enter 打开，Esc 退出。 |
| **A-17** | 定位回树高亮 | 点击结果后：① 展开祖先（现状已有）；② `setScrollToFileId`（现状已有）；③ 配合 A-09 的 flash 动画；④ 打开结果后**不立即清空搜索面板**，而是在树中定位完成后 800ms 再 `setSearchResults(null)`，让用户看到定位反馈。 | index.tsx:1619 onClick | 点搜索结果后能在左侧树里看到目标行闪一下。 |
| **A-18** | 空结果建议 | `searchResults.length === 0 && q` 时显示：🔍 图标（16px，`--dsw-alias-label-tertiary`）+ 文案 `未找到「{q}」` + 副文案"试试更短的关键词，或检查拼写" + 按钮"导入新文档"（触发 + 菜单）。 | index.tsx:1617 | 空结果不再是孤零零一行灰字。 |
| **A-19** | 离线搜索提示 | `offline === true` 时搜索框下方显示 1px 高横幅：`padding: 2px 8px; background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); fontSize: 11px; borderRadius: var(--dsw-radius-sm)`，文案"离线模式：搜索仅覆盖已索引内容"。 | 搜索框下方 | 离线时输入框上方有黄色横幅提示。 |
| **A-20** | + 菜单 tooltip 改名 | index.tsx:1552 的 + 按钮 tooltip 从 `wiki.more`（"更多"）改为 `wiki.create`（"新建 / 导入"），与右上角 ⋯ 按钮区分。 | index.tsx:1552 | 两个按钮 tooltip 不撞名。 |

---

## 3. 编辑器体验

### 3.1 成熟产品怎么做（Notion slash menu / Tiptap 默认浮动条 / Obsidian 编辑器）

- **浮动格式条**：选中文字**松开鼠标后**才出现（`mouseup`/`selectionchange` 防抖 150ms）；选区为空即隐藏；位置在选区上方居中，距选区 6px；超出视口左右边界自动翻转到下方并 clamp。Notion 的浮动条是深色圆角胶囊，Obsidian 是浅灰浮层。
- **段落样式条**：鼠标悬停段落左侧 24px 区域显示 ⋮⋮ 把手（Notion 风格）或样式标签；移开 220ms 后隐藏（给"更多"菜单留时间）。Notion 点 ⋮⋮ 弹出块操作菜单。
- **窄屏**：宽度 < 600px 时浮动条两行排列或折叠为"格式"按钮 + 弹层。
- **只读预览**：历史版本查看模式下，所有浮动工具栏、段落条、编辑按钮**全部隐藏**；编辑器 `contenteditable=false`；顶部加黄色"只读"提示条。
- **链接插入**：不用 `prompt()`，而是浮动条内联输入框（200px 宽，Enter 确认/Esc 取消）。
- **保存状态**：Notion 顶部显示"已自动保存 / 正在保存… / 保存失败"；本插件已有自动保存（900ms 防抖），但无可见状态。

### 3.1.1 编辑器排版规格（Tiptap ProseMirror）

成熟 Markdown 编辑器（Obsidian / Typora / Notion）的排版节奏：

| 元素 | font-size | line-height | margin |
|---|---|---|---|
| 正文段落 | 14px | 1.7 | 4px 0 |
| H1 | 26px / 700 | 1.3 | 24px 0 12px |
| H2 | 20px / 600 | 1.35 | 20px 0 8px |
| H3 | 16px / 600 | 1.4 | 16px 0 6px |
| 行内代码 | 12px | inherit | 背景 `--dsw-alias-markdown-inline-code`，padding 1px 4px，圆角 `--dsw-radius-xs` |
| 代码块 | 12px / mono | 1.6 | 背景 `--dsw-alias-markdown-code-block`，padding 12px，圆角 `--dsw-radius-md`，外边距 8px 0 |
| 引用 | 14px | 1.6 | 左边框 3px `--dsw-alias-border-l4`，padding-left 12px，color `--dsw-alias-label-secondary` |
| 列表项 | 14px | 1.7 | 2px 0 |

选区高亮用 `--dsw-alias-bg-document-selection`（已在令牌里定义，40% blue 透明）。

### 3.2 差距清单

- **G-21**：浮动工具栏在 `onSelectionUpdate` 里实时计算坐标（index.tsx:711），每次光标移动都重渲染，拖动选文字时工具栏跟着闪。
- **G-22**：浮动条位置 `Math.max(10, Math.min(selToolbar.x, window.innerWidth-10))`（index.tsx:1934）只 clamp 了 x，没 clamp y；选中文档顶部时工具栏可能飞出视口上方。
- **G-23**：链接插入用原生 `prompt("链接地址 URL：")`（index.tsx:1960、2004），样式与主题完全脱节，且无法 Esc。
- **G-24**：浮动条 15 个按钮横排，窄屏（<480px）会溢出；无换行/收纳。
- **G-25**：段落条 `onMouseMove` 直接 `requestAnimationFrame` 计算坐标（index.tsx:1385），鼠标在段落内快速移动时每帧都 setParaBar，性能浪费且抖动。
- **G-26**：历史版本预览用 `<pre>` 裸文本（index.tsx:2153），没有 MD 渲染、没有代码块样式，可读性差；无"只读"视觉提示。
- **G-27**：浮动条 `onMouseDown` 里 `preventDefault()` 阻止了选区丢失（好），但点击工具栏按钮后焦点跳走，连续加粗/斜体操作后光标位置偶发丢失。
- **G-28**：编辑器顶部标题栏（index.tsx:1914–1920）只有标题 + 类型 badge + 保存按钮，无"已保存/未保存"状态指示；用户不知道自动保存是否成功。
- **G-29**：Tiptap 编辑器区（index.tsx:1922–1926）`padding: 12`，但无最大宽度限制，超宽屏行长会超过 800px，可读性差。

### 3.3 改进条目

| 编号 | 改动点 | 具体规格 | 涉及位置 | 验收标准 |
|---|---|---|---|---|
| **A-21** | 浮动条触发防抖 | `onSelectionUpdate` 里**只记录 from/to**，不立即 `setSelToolbar`；新增 `useEffect` 监听 selection 变化，`setTimeout(120ms)` 后再算坐标并 set。`empty` 时立即清。 | index.tsx:711–718 | 拖选文字过程中工具栏不跟着闪；松后 120ms 出现。 |
| **A-22** | 工具栏视口 clamp | 计算后：`x = clamp(x, 80, window.innerWidth-80)`；`y = selToolbar.y < 60 ? a.bottom+6 : a.top-38`（顶部空间不够时翻到选区下方）。 | index.tsx:1933–1934 transform | 选中文档第一行时工具栏出现在选区下方而非飞出屏幕。 |
| **A-23** | 内联链接输入 | 浮动条"链接"按钮改为点击后在工具栏右侧展开一个 `<input>`（`width:180px; height:22px; fontSize:12px; border:1px solid var(--dsw-alias-border-l2); borderRadius: var(--dsw-radius-xs); padding: 0 6px; background: var(--dsw-alias-bg-base)`），Enter 调 `setLink`、Esc 取消。删除两处 `prompt()`。 | index.tsx:1958、2002 | 插链接不再弹原生对话框。 |
| **A-24** | 窄屏收纳 | 浮动条容器加 `flex-wrap: wrap; max-width: min(560px, calc(100vw-24px))`；窗口宽度 < 560px 时，按钮分两行，行间距 4px。 | selToolbar 容器 style | 窄屏下按钮不溢出屏幕。 |
| **A-25** | 段落条节流 | `onEditorHover` 里记录最后 mouse 坐标，`setInterval(60ms)` 统一计算一次；坐标与上一次相同则不 setState。 | index.tsx:1385 onEditorHover | 鼠标静止在段落上时不重复渲染。 |
| **A-26** | 历史版本只读模式 | `verPreview` 弹窗内：① 用 `renderMdSafe(verPreview.content)` 渲染（复用已有函数）；② 顶部加黄色条：`padding: 6px 10px; background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); fontSize: 12px; borderRadius: var(--dsw-radius-sm 12px 0 0)`，文案"正在查看历史版本（{时间}）— 此为只读预览"；③ 弹窗内**不渲染** selToolbar/paraBar/vertBar。 | index.tsx:2142–2156 | 历史版本预览是渲染后的 MD，顶部有黄色只读提示条。 |
| **A-27** | 工具栏按钮 focus 恢复 | 每个 ToolBtn onClick 改为：`e.preventDefault(); editor?.chain().focus().run()`（现状已有 focus，但要确保 `mouseup` 后先保存 selection 再 preventDefault）。点击后选区不丢。 | ToolBtn onClick | 连续点 B/I/U 后选区仍在，不会跳到文档开头。 |
| **A-28** | 保存状态指示 | 标题栏右侧加状态文字：`mdContent === savedContent` 时显示"已保存"（`--dsw-alias-label-tertiary`，11px）；正在自动保存时显示"保存中…"（`--dsw-alias-state-warn-primary`）；保存失败时显示"保存失败"（`--dsw-alias-state-error-primary`）+ 点击重试。 | index.tsx:1914–1920 标题栏 | 用户能看到自动保存状态。 |
| **A-29** | 编辑器最大宽度 | Tiptap 容器内层包一个 `div`，`max-width: 720px; margin: 0 auto; padding: 0 16px`；超宽屏行长不超过 720px。 | index.tsx:1922–1926 EditorContent 外层 | 超宽屏上文字行不超过 720px。 |
| **A-30** | 编辑器排版令牌化 | 给 ProseMirror 加全局样式：`p { font-size: 14px; line-height: 1.7; margin: 4px 0 }`；`h1 { font-size: 26px; font-weight: 700; line-height: 1.3; margin: 24px 0 12px }`；`h2 { font-size: 20px; font-weight: 600; line-height: 1.35; margin: 20px 0 8px }`；`h3 { font-size: 16px; font-weight: 600; margin: 16px 0 6px }`；`code { background: var(--dsw-alias-markdown-inline-code); padding: 1px 4px; border-radius: var(--dsw-radius-xs); font-size: 12px }`；`pre { background: var(--dsw-alias-markdown-code-block); padding: 12px; border-radius: var(--dsw-radius-md); margin: 8px 0 }`；`blockquote { border-left: 3px solid var(--dsw-alias-border-l4); padding-left: 12px; color: var(--dsw-alias-label-secondary) }`；选区 `::selection { background: var(--dsw-alias-bg-document-selection) }`。 | index.tsx:719 editorProps.attributes.style 或注入 `<style>` 标签 | 编辑器内排版与 Obsidian/Typora 节奏一致。 |

---

## 4. 空态 / 加载 / 错误反馈

### 4.1 成熟产品怎么做

- **骨架屏**：首屏加载时骨架要匹配真实布局（左侧树形骨架 + 右侧编辑器骨架），而不是一堆随机高度的灰条。Notion 首次加载是左右两栏骨架。
- **空库引导**：Obsidian 首次打开显示"Create new note / Open folder as vault"两个大按钮 + 简短说明；Notion 空态显示插画 + "Import" 主按钮。
- **导入失败分级**：单文件失败 → toast 带"查看详情"展开为 per-file 列表；批量导入完成后右下角显示汇总卡片"成功 8 / 失败 2 / 跳过 1"，失败项可点击重试。
- **离线横幅**：顶部贯穿式黄色条（`top: 0; left:0; right:0; padding: 4px 12px`），不是挤在面板角落的小标签。
- **导入进度**：进度条 `height: 4px; borderRadius: 2px; background: var(--dsw-alias-bg-layer-2)`，填充 `background: var(--dsw-alias-state-business-primary); transition: width 300ms ease`；total=0 时显示 indeterminate 条纹动画；右上角带 ✕ 取消按钮。

### 4.2 差距清单

- **G-30**：骨架屏 `SkeletonRows` 只在左侧列表区显示 8 条随机灰条（index.tsx:543），右侧编辑器区空白，左右失衡。
- **G-31**：空态用 emoji 📚（index.tsx:2035）+ 一段说明文字，无主操作按钮；用户不知道下一步点哪里。
- **G-32**：导入失败 toast 把所有错误拼成一行字符串（index.tsx:972），无法定位是哪个文件失败、无法重试。
- **G-33**：离线提示是面板内一个 11px 小标签（index.tsx:1431），颜色还错用了 `--dsw-alias-state-warning`（不存在）。
- **G-34**：导入进度条 total=0 时宽度 0% 不动（index.tsx:1444），用户以为卡死；无取消按钮。
- **G-35**：ErrorBoundary 的重试按钮颜色用了 `--dsw-alias-label-on-primary`（不存在）（index.tsx:593），按钮文字在主色背景上不可见。
- **G-36**：待确认变更轮询每 5 秒自动弹 Diff 弹窗（index.tsx:834），如果用户正在编辑会突然弹窗打断；无"稍后处理"选项。

### 4.3 改进条目

| 编号 | 改动点 | 具体规格 | 涉及位置 | 验收标准 |
|---|---|---|---|---|
| **A-30** | 骨架屏布局 | 首屏 `loadingList` 时：左侧显示 6 行树形骨架（第一行深度 0，后续深度 1–2 交错，每行 `height: 20px; borderRadius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-skeleton); animation: dsw-shimmer 1.2s infinite`）；右侧显示 3 行标题骨架 + 5 行正文骨架（宽度 80%/60%/40% 交错）。 | `SkeletonRows` 改为双区版本、index.tsx:1613 | 加载时左右都有骨架，布局稳定。 |
| **A-31** | 空库引导 | 右侧空态：① 用 WikiIcon 大号（48px，`--dsw-alias-label-tertiary`）替换 📚；② 标题"知识库为空"；③ 副文案"导入本地文件或网页，开始构建你的私有知识库"；④ 两个按钮并排：主按钮"导入文件"（触发 fileInputRef）、次按钮"新建文档"（doNewDoc）。按钮样式：主 `primaryBtn`、次 `ghostBtn`。 | index.tsx:2034–2049 | 空态有两个可点按钮，无 emoji。 |
| **A-32** | 导入失败汇总卡 | `importFilesContent` 完成后，若 `fail>0 \|\| skip>0`，不发 toast，改为右下角持久卡片（ToastStack 内新类型 `summary`）：`width: 280px; padding: 12px; background: var(--dsw-alias-toast-bg); color: var(--dsw-alias-toast-label); borderRadius: var(--dsw-radius-lg)`。内容："导入完成：成功 {ok} / 失败 {fail} / 跳过 {skip}" + 展开按钮列出失败文件名（每行可点"重试"）。卡片不自动消失，需手动 ✕。 | `importFilesContent` index.tsx:966–973、ToastStack | 批量导入失败时能看到具体哪个文件失败并单独重试。 |
| **A-33** | 离线横幅 | 把 index.tsx:1431 的小标签改为面板顶部贯穿条：`position: sticky; top: 0; padding: 6px 12px; background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); fontSize: 12px; borderRadius: var(--dsw-radius-sm); margin-bottom: 6px`，文案"离线 / 宿主未连接 — 数据仅本地缓存"。 | index.tsx:1431 | 离线时顶部黄色横幅醒目可见。 |
| **A-34** | 进度条 indeterminate + 取消 | `job.total === 0` 时填充用 `width: 30%` + `@keyframes indeterminate { from {left:0} to {left:100%} }` 滑动动画；进度条容器右侧加 ✕ 按钮（`iconBtn`），点击后 `setJob(null)` 并 `clearInterval(pollJob 的 timer)`。 | index.tsx:1439–1450、`pollJob` | 导入中能取消；total 未知时进度条来回滑动而非卡死。 |
| **A-35** | ErrorBoundary 按钮令牌修正 | `--dsw-alias-label-on-primary` → `--dsw-alias-label-primary-foreground`；主色背景保持 `--dsw-alias-state-business-primary`。 | index.tsx:593 | 重试按钮文字在深色背景上可读。 |
| **A-36** | 待确认变更不打断编辑 | 轮询发现未暂存变更时，若 `view === "editor" && mdContent !== savedContent`（用户正在编辑），**不自动弹窗**，改为在右上角待确认徽标上跳动一次（CSS animation），等用户主动点徽标再弹。 | index.tsx:834 自动弹窗处 | 用户编辑时不被突然打断。 |

---

## 5. 全局细节

### 5.1 成熟产品怎么做

- **间距系统**：4/8/12/16 四级；卡片 padding 12–16；列表行内 gap 6–8。
- **阴影层级**：浮层（菜单/工具栏）用 lv2；Toast/Modal 用 lv3；hover 提升用 lv1-blur。
- **焦点环**：键盘 Tab 时显示 2px 主色 outline；鼠标点击时不显示（宿主 `html[data-input-modality='pointer']` 已处理）。
- **Tooltip**：悬停 500ms 后出现，深色气泡 `--dsw-alias-tooltip-bg`，13px，150ms 淡入。
- **快捷键**：Ctrl/Cmd+S 保存、Ctrl/Cmd+F 聚焦搜索、Esc 关闭最上层浮层（菜单→弹窗→面板）。
- **Toast**：官方 dsw-toast.css 规定顶部居中、深色背景、`--dsh-toast-hold` 默认 3000ms、堆叠不超过 3 条、超出自动挤掉最旧的。

### 5.2 差距清单

- **G-37**：Modal 遮罩硬编码 `rgba(0,0,0,0.5)`（index.tsx:2126、2143、2160、2182、2204、2316），没用 `--dsw-alias-bg-mask-3`（48%）；深色主题下会过黑。
- **G-38**：菜单/工具栏阴影硬编码 `0 4px 12px rgba(0,0,0,0.15)`（index.tsx:1493、1556、1936、1971、1983、2062、522），没用 `--dsw-shadow-lv2` / `-lv3`。
- **G-39**：Toast 自绘在右下角（index.tsx:509），与官方 dsw-toast.css（顶部居中、深色背景）不一致；且用了一堆不存在的状态令牌。
- **G-40**：Toast 堆叠无上限，连续 5xx 错误会堆一屏；自动消失 3200ms 与官方 3000ms 接近但不一致。
- **G-41**：多个输入框 `outline: "none"`（index.tsx:1691、1723、2258、2263），把宿主全局 `:focus-visible` 焦点环也禁用了；键盘 Tab 时看不到焦点在哪。
- **G-42**：Esc 行为不统一：重命名输入框有 Esc、URL 对话框有 Esc、但 + 菜单 / ⋯ 菜单 / 右键菜单 / 确认弹窗都没有 Esc 关闭。
- **G-43**：按钮 tooltip 用原生 `title` 属性，无延迟、无样式；与 dsw-tooltip.css 不一致。
- **G-44**：右键菜单项（index.tsx:2064–2108）用 div 渲染，无 `role="menuitem"`、无键盘导航（↑↓Enter）。
- **G-45**：设置面板（index.tsx:1764–1864）是一长串 input 垂直堆叠，无分组标题、无间距节奏；嵌入模型与重排模型配置折叠后仍占垂直空间。
- **G-46**：历史版本面板（index.tsx:1868–1891）用 `<select>` 选文件，文件多时下拉框难以查找；版本列表无日期分组。
- **G-47**：日志面板（index.tsx:1894–1909）每行 `whiteSpace: nowrap` 但 detail 长，右侧直接截断无展开。
- **G-48**：底部状态栏（index.tsx:1928）只显示字符数，无光标位置、无语言/编码、无"已自动保存"状态；Obsidian 底部栏有行号/字数/模式。
- **G-49**：收起 rail 态（index.tsx:1287–1301）只渲染一个 WikiIcon 按钮，无 tooltip、无 badge 提示待确认变更数。

### 5.3 改进条目

> **浮层统一规范**（菜单/右键菜单/+/⋯ 弹窗共用）：
> - 容器：`background: var(--dsw-specific-menu)`（半透明毛玻璃）、`border: 1px solid var(--dsw-alias-border-l2)`、`border-radius: var(--dsw-radius-md)`、`box-shadow: var(--dsw-shadow-lv2)`、`padding: 4px`、`min-width: 160px`。
> - 菜单项：`padding: 6px 10px; fontSize: 12px; lineHeight: 20px; borderRadius: var(--dsw-radius-xs); color: var(--dsw-alias-label-primary)`；hover `background: var(--dsw-alias-interactive-bg-hover)`；危险项 `color: var(--dsw-alias-state-error-primary)`。
> - 分组标题：`padding: 4px 10px; fontSize: 11px; color: var(--dsw-alias-label-tertiary)`。
> - 打开/关闭：`opacity 120ms ease` + `transform: translateY(-2px)` → `translateY(0)`。

| 编号 | 改动点 | 具体规格 | 涉及位置 | 验收标准 |
|---|---|---|---|---|
| **A-37** | 遮罩令牌化 | 所有 Modal 遮罩 `background: rgba(0,0,0,0.5)` → `background: var(--dsw-alias-bg-mask-3)`。 | index.tsx:2126、2143、2160、2182、2204、2316 | 深色主题下 Modal 遮罩不突兀。 |
| **A-38** | 阴影令牌化 | 菜单/右键菜单用 `box-shadow: var(--dsw-shadow-lv2)`；浮动工具栏/Toast/Modal 用 `box-shadow: var(--dsw-shadow-lv3)`。删除所有内联 `rgba(0,0,0,0.1x)` 阴影。 | index.tsx:1493、1556、1936、1971、1983、2062、522 | 浮层阴影与宿主其他 UI 一致。 |
| **A-39** | Toast 对齐官方 | 重写 `ToastStack`：位置改为顶部居中 `top: 40px; left: 50%; transform: translateX(-50%)`；背景 `var(--dsw-alias-toast-bg)`；文字色 `var(--dsw-alias-toast-label)`；圆角 `var(--dsw-radius-lg)`；阴影 `var(--dsw-shadow-lv3)`；图标色 error→`--dsw-alias-state-error-primary`、success→`--dsw-alias-state-success-primary`、info→`--dsw-alias-state-warn-label`。 | ToastStack index.tsx:505–538 | Toast 外观与宿主官方 toast 一致。 |
| **A-40** | Toast 堆叠上限 | `notify` 里 `setToasts(prev => [...prev.slice(-2), newToast])`（最多 3 条）；新 toast 挤掉最旧的。自动消失时长统一 3000ms（与 `--dsh-toast-hold` 一致）。 | index.tsx:785–793 | 连续错误最多看到 3 条 toast。 |
| **A-41** | 焦点环恢复 | 删除所有输入框内联 `outline: "none"`；改为 `outline: none` 只在 `:focus:not(:focus-visible)` 时生效，或直接删除让宿主 `:focus-visible` 接管。重命名输入框保留 `border-color: var(--dsw-alias-state-business-primary)` 作为视觉提示。 | index.tsx:1691、1723、2258、2263 等所有 input/textarea | 键盘 Tab 时能看到蓝色焦点环。 |
| **A-42** | Esc 统一关闭 | 全局 keydown：Esc 优先级 = ① 当前打开的弹窗（confirm/url/rebind/verPreview/diffModal）→ ② + 菜单 / ⋯ 菜单 / 右键菜单 → ③ 搜索结果面板清空 → ④ 编辑器无操作。每次只关最上层。 | 新增全局 Esc handler（与现有 Ctrl+S/Ctrl+F handler 并列） | 按 Esc 能逐层关闭浮层。 |
| **A-43** | 快捷键补全 | 现有：Ctrl+S 保存、Ctrl+F 聚焦搜索、`/` 聚焦搜索。补充：Esc 关闭浮层（A-42）；`Ctrl/Cmd+P` 打开搜索（与 Ctrl+F 等价，Obsidian 习惯）；`Ctrl/Cmd+B` 加粗选区。工具栏按钮 tooltip 文案后加快捷键提示，如"粗体 (Ctrl+B)"。 | 全局 keydown、ToolBtn title | 快捷键与主流编辑器一致。 |
| **A-44** | 右键菜单键盘可达 | 菜单项加 `role="menuitem"`、`tabIndex={-1}`；菜单打开时自动聚焦第一项；↑↓ 在项间移动、Enter 触发、Esc 关闭。 | index.tsx:2064–2108 | 键盘能操作右键菜单。 |
| **A-45** | 统一间距 | 卡片 padding 统一 12px（`--dsw-radius-md` 容器内）；行内 gap 统一 6px；面板间 gap 用 8px。删除零散的 `padding: "4px 8px"`、`gap: 2`、`gap: 4` 等不一致值。 | 所有内联 style | 视觉节奏统一。 |
| **A-46** | 动效统一 | 所有过渡用 `transition: all 120ms ease-out`（悬停）/ `200ms ease`（面板展开）/ `300ms ease`（进度条）；`@media (prefers-reduced-motion: reduce)` 下全部 `transition: none`。 | 所有 CSS transition | 动效时长一致，尊重系统减少动效设置。 |
| **A-47** | 设置面板分组 | 设置面板加分组标题："存储"、"切片"、"嵌入模型"、"重排模型"；每组 `margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1)`；组标题 `font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); margin-bottom: 6px`。嵌入/重排模型的高级配置（Base URL / API Key / Model）默认折叠，点击"高级"展开。 | index.tsx:1769–1862 设置面板 | 设置项分组清晰，高级配置默认收起。 |
| **A-48** | 历史版本选择 | 文件选择 `<select>` 改为可搜索下拉（或直接用文件树当前选中文件）；版本列表按日期分组（"今天 / 昨天 / 更早"），每组标题 11px `--dsw-alias-label-caption`。 | index.tsx:1873–1888 | 版本列表按日期分组，易查找。 |
| **A-49** | 日志 detail 展开 | 日志行 detail 长时不 `nowrap`，改为 `word-break: break-all`；点击行展开完整 detail（`expandedLogId` state）。 | index.tsx:1901–1907 | 长日志可展开查看完整内容。 |
| **A-50** | 底部状态栏扩展 | 编辑器底部栏（index.tsx:1928）右侧追加：保存状态（A-28）+ 字数 + 行数；样式 `fontSize: 11px; color: var(--dsw-alias-label-tertiary); gap: 12px; padding: 4px 2px 0; borderTop: 1px solid var(--dsw-alias-border-l1)`。 | index.tsx:1928 | 底部栏有保存状态与字数。 |
| **A-51** | 收起 rail 态增强 | rail 态按钮加 `title="知识库"`（dsw-tooltip）；有待确认变更时按钮右上角加红色小圆点（`6px; background: var(--dsw-alias-state-error-primary); position: absolute; top: 2px; right: 2px`）。 | index.tsx:1289–1298 | 收起态也能看到待办提示。 |

---

## 附：实施优先级建议

## 附 2：快捷键速查表（编码后需在 tooltip 里体现）

| 快捷键 | 行为 | 现状 |
|---|---|---|
| `Ctrl/Cmd + S` | 保存当前文档 | ✅ 已有（index.tsx:854） |
| `Ctrl/Cmd + F` | 聚焦搜索框 | ✅ 已有（index.tsx:857） |
| `Ctrl/Cmd + P` | 聚焦搜索框（Obsidian 习惯） | ❌ 待补（A-43） |
| `/` | 聚焦搜索框（非输入态） | ✅ 已有（index.tsx:1350） |
| `Esc` | 关闭最上层浮层（弹窗→菜单→搜索清空） | ❌ 待补（A-42） |
| `↑ / ↓` | 搜索结果间移动 | ❌ 待补（A-16） |
| `Enter` | 打开搜索结果 | ✅ 已有（点击触发，键盘待补） |
| `Ctrl/Cmd + B` | 加粗选区 | ❌ 待补（A-43） |
| `Ctrl/Cmd + I` | 斜体选区 | ❌ 待补 |
| `Ctrl/Cmd + Z` / `Shift+Z` | 撤销/重做 | 编辑器内已支持，未在 tooltip 提示 |

## 附 3：验收清单（编码完成后自检）

- [ ] 文档内引用的所有 `--dsw-*` 令牌都能在 `dsh-design-platform.css` 里找到定义。
- [ ] 无任何硬编码 hex 色值（除令牌表中列出的 static 色板外）。
- [ ] 键盘 Tab 时每个可交互元素都有可见焦点环。
- [ ] Esc 能逐层关闭所有浮层。
- [ ] 明暗主题切换后无文字不可读（白字白底/黑字黑底）。
- [ ] `prefers-reduced-motion: reduce` 下无动画。
- [ ] 窄屏（<480px）下浮动工具栏不溢出。
- [ ] 批量导入失败时能看到 per-file 失败列表。

1. **P0（修 bug，1 天）**：A-10、A-35、A-37、A-39、A-41 —— 这些是令牌不存在导致的视觉 bug，改完立刻恢复可读性。
2. **P1（核心体验，2 天）**：A-02、A-04、A-05、A-13、A-14、A-15、A-16、A-21、A-33、A-34 —— 文件树与搜索是最高频路径。
3. **P2（打磨，2 天）**：A-03、A-06、A-09、A-17、A-23、A-26、A-28、A-30、A-31、A-32、A-36、A-42、A-44。
4. **P3（锦上添花，1 天）**：A-07、A-08、A-11、A-12、A-18、A-19、A-20、A-22、A-24、A-25、A-27、A-29、A-38、A-40、A-43、A-45、A-46。

## 9. v0.0.13 落地对账（2026-11-04）

| 规格项 | 状态 | 说明 |
|---|---|---|
| 文件树 hover 暴露/右键菜单 | ✅ 已落地 | 行 hover 显示 ⋯/★/拖动把手 |
| 浮动段落样式条 | ✅ 已落地 | hover 段落显示标签 + ⋯ 面板（上移/下移） |
| Toast 令牌化 | ✅ 已落地 | dsw 令牌 |
| 搜索 + 深链高亮 | ✅ 已落地 | seq 守卫 + pendingHighlight |
| 回收站 | ✅ 已落地 | 恢复/彻底删除/清空 + 角标 + 容量 |
| 命令面板 Ctrl+P | ✅ 已落地 | 新建/导入/导出/回收站/清空/设置 + 副标题 |
| 文档大纲 TOC | ✅ 已落地 | 标题锚点滚动 |
| 斜杠命令菜单 | ✅ 已落地 | 空段落 / 触发 + IME 门控 |
| 双链 [[ 联想 | ✅ 已落地 | 行首触发/键盘流/插入 [[标题]] |
| 反向链接面板 | ✅ 已落地 | score 排序/软删过滤/失败态/计数 |
| 语义搜索面板 | ✅ 已落地 | /search MATCH + 骨架 |
| 无障碍 | ✅ 已落地 | role=tree/treeitem/dialog/listbox + useFocusTrap |
| IME 组合门控 | ✅ 已落地 | composition 期间不弹联想菜单 |
| 块级自由拖拽 | ⚠️ 部分 | 上移/下移按钮已落地；自由拖拽把手评估风险高不做 |
| 收藏/最近打开 | ✅ 已落地 | 侧栏分组 + 软删联动清除 |
