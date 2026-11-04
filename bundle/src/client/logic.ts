// ============================================================================
// logic.ts — 文件级纯逻辑（无 react / tiptap import，node 可跑）
// 从 index.tsx 抽出，便于单元测试。行为与迁移前保持一致。
// ============================================================================

export interface TreeNode {
  type: "folder" | "doc";
  id?: number;
  fileId?: number;
  name?: string;
  title?: string;
  kind?: string;
  status?: "ready" | "stale" | "error";
  folderId?: number | null;
  children?: TreeNode[];
}

export interface FlatRow {
  rowType: "folder" | "doc" | "placeholder";
  depth: number;
  id: number;
  title: string;
  kind?: string;
  status?: string;
  raw: TreeNode;
}

export interface DiffRow { type: "add" | "del" | "mod" | "ctx"; oldText?: string; newText?: string; }

// ---------------- i18n 兜底字典 ----------------
export const LOCAL_FALLBACK: Record<string, string> = {
  "wiki.title": "知识库",
  "wiki.search": "搜索文档…",
  "wiki.refresh": "刷新",
  "wiki.settings": "设置",
  "wiki.empty": "暂无文档",
  "wiki.noResult": "无搜索结果",
  "wiki.save": "保存",
  "wiki.cancel": "取消",
  "wiki.confirm": "确定",
  "wiki.delete": "删除",
  "wiki.more": "更多",
  "wiki.favSection": "收藏",
  "wiki.recentSection": "最近打开",
  "wiki.create": "新建 / 导入",
  "wiki.rootAll": "全部文件",
  "wiki.emptyFolder": "空文件夹",
  "wiki.unfav": "取消收藏",
  "wiki.fav": "收藏",
  "wiki.statusReady": "已索引",
  "wiki.statusStale": "待同步",
  "wiki.statusError": "异常",
  "wiki.charCount": "字符",
  "wiki.emptyTitle": "从左侧选择文档开始",
  "wiki.emptyHint": "在左侧导入或搜索文档，点击后即可在此查看与编辑。",
  "wiki.newSubFolder": "新建子文件夹",
  "wiki.offline": "离线 / 宿主未连接",
  "wiki.dropImport": "释放以导入到知识库",
  "wiki.fullscreen": "全屏",
  "wiki.exitFullscreen": "退出全屏",
  "wiki.importing": "导入中…",
  "wiki.importDone": "导入完成",
  "wiki.importSubmitting": "已提交 {n} 个文件导入",
  "wiki.count": "共 {n} 条",
  "wiki.autoSaveConflict": "检测到外部修改，请用“保存”按钮处理",
  "wiki.autoSaveFailed": "自动保存失败",
  "wiki.webModeHint": "网页抓取模式",
  "wiki.webModeInSettings": "见设置",
  "wiki.cannotMoveIntoSelf": "不能移动到自身的子文件夹下",
  "wiki.confirmDeleteDoc": "将该文档移入回收站？",
  "wiki.confirmDeleteFolder": "将该文件夹及其下所有文档移入回收站？",
  "wiki.trash": "回收站", "wiki.trashEmpty": "回收站为空", "wiki.trashEmptyAll": "清空回收站",
  "wiki.trashRestored": "已恢复", "wiki.trashPurged": "已彻底删除",
  "wiki.trashPurgeConfirm": "彻底删除后不可恢复，确定？", "wiki.trashEmptyConfirm": "清空回收站后不可恢复，确定？",
  "wiki.cmdPlaceholder": "输入命令或搜索文档…",
  "wiki.toc": "大纲", "wiki.tocEmpty": "文档无标题",
  "wiki.slashH1": "标题 1", "wiki.slashH2": "标题 2", "wiki.slashH3": "标题 3",
  "wiki.slashBullet": "无序列表", "wiki.slashTask": "任务列表", "wiki.slashQuote": "引用",
  "wiki.slashCode": "代码块", "wiki.slashDivider": "分隔线", "wiki.slashText": "正文",
  "wiki.resultsCount": "相关文档 {n} 篇",
  "wiki.folderName": "文件夹名称…",
  "wiki.export": "导出 Markdown",
  "wiki.exported": "已导出 Markdown",
  "wiki.copiedContent": "已复制内容到剪贴板",
  "wiki.leaveUnsaved": "有未保存的修改",
  "wiki.saveAndLeave": "保存并离开",
  "wiki.discard": "放弃修改",
  "wiki.noFavHint": "暂无收藏，点文件行 ☆ 收藏",
  "wiki.noRecentHint": "暂无最近打开",
  "wiki.searchHistory": "搜索历史",
  "wiki.clear": "清空",
  "wiki.selectedCount": "已选 {n} 项",
  "wiki.batchMove": "移动到…",
  "wiki.batchMoveTo": "移动到文件夹",
  "wiki.batchDeleteConfirm": "删除选中的 {n} 个文档？此操作不可恢复。",
  "wiki.versions": "历史版本", "wiki.importFile": "导入文件", "wiki.importFolder": "导入文件夹", "wiki.importWeb": "导入网页",
  "wiki.embedModel": "嵌入模型", "wiki.embedFallback": "离线哈希（默认）", "wiki.embedLocal": "本地模型", "wiki.embedOpenAI": "OpenAI 兼容",
  "wiki.modelPath": "本地模型路径", "wiki.openaiBaseURL": "Base URL", "wiki.openaiAPIKey": "API Key", "wiki.openaiModel": "模型名",
  "wiki.rerankModel": "重排模型", "wiki.rerankNone": "关闭重排",
  "wiki.selectFile": "选择文件", "wiki.selectFileFirst": "请先选择文件", "wiki.noVersions": "暂无历史版本",
  "wiki.view": "查看", "wiki.versionsHint": "人工编辑保存时自动生成历史版本，每文件最多保留 3 个",
};

/** 翻译工厂：宿主 t 缺失或返回 key 本身时回退到本地字典；支持 {n} 插值 */
export function makeTranslator(fallback: Record<string, string>) {
  return function tt(hostT: ((key: string) => string) | undefined, key: string, params?: Record<string, string | number>): string {
    let s: string;
    if (hostT) {
      try {
        const v = hostT(key);
        if (v && v !== key) s = v;
        else s = fallback[key] || key;
      } catch { s = fallback[key] || key; }
    } else s = fallback[key] || key;
    if (params) for (const k of Object.keys(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(params[k]));
    return s;
  };
}

export const tt = makeTranslator(LOCAL_FALLBACK);

// ---------------- 行级 diff ----------------
export function computeDiff(oldText: string, newText: string): DiffRow[] {
  const a = String(oldText || "").split("\n");
  const b = String(newText || "").split("\n");
  const setB = new Set(b);
  const setA = new Set(a);
  const out: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: "ctx", oldText: a[i] }); i++; j++; }
    else {
      const aDel = !setB.has(a[i]);
      const bAdd = !setA.has(b[j]);
      if (aDel && bAdd) { out.push({ type: "mod", oldText: a[i], newText: b[j] }); i++; j++; }
      else if (aDel) { out.push({ type: "del", oldText: a[i] }); i++; }
      else { out.push({ type: "add", newText: b[j] }); j++; }
    }
  }
  while (i < a.length) out.push({ type: "del", oldText: a[i++] });
  while (j < b.length) out.push({ type: "add", newText: b[j++] });
  return out;
}

// ---------------- 树扁平 / 收集 ----------------
export function flattenTree(nodes: TreeNode[] | undefined, depth: number, expanded: Set<number>, out: FlatRow[]) {
  (nodes || []).forEach((n) => {
    if (n.type === "folder") {
      out.push({ rowType: "folder", depth, id: n.id!, title: n.name || "", raw: n });
      if (expanded.has(n.id!)) flattenTree(n.children, depth + 1, expanded, out);
    } else {
      out.push({ rowType: "doc", depth, id: n.fileId!, title: n.title || "", kind: n.kind, status: n.status, raw: n });
    }
  });
}

export function collectFolderIds(nodes: TreeNode[] | undefined, out: Set<number>): Set<number> {
  (nodes || []).forEach((n) => { if (n.type === "folder") { out.add(n.id!); collectFolderIds(n.children, out); } });
  return out;
}

/** 收集某文件夹的全部子孙文件夹 id（拖拽防循环） */
export function subtreeFolderIds(nodes: TreeNode[] | undefined, id: number, out: Set<number> = new Set()): Set<number> {
  for (const n of (nodes || [])) {
    if (n.type === "folder") {
      if (n.id === id) { collectFolderIds(n.children, out); return out; }
      subtreeFolderIds(n.children, id, out);
    }
  }
  return out;
}

/** 查找某文件所在的祖先文件夹链（根为 []，找不到返回 null） */
export function findDocFolderPath(nodes: TreeNode[] | undefined, fileId: number, trail: number[] = []): number[] | null {
  for (const n of (nodes || [])) {
    if (n.type === "folder") {
      const sub = findDocFolderPath(n.children, fileId, [...trail, n.id!]);
      if (sub) return sub;
    } else if (n.fileId === fileId) {
      return trail;
    }
  }
  return null;
}

// ---------------- base64 ----------------
export function toBase64(buf: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode(...buf.subarray(i, i + CH));
  return btoa(s);
}

// ---------------- 离开守卫纯判定 ----------------
export function shouldLeaveGuard(view: string, activeId: string | null, mdContent: string, savedContent: string, editable = true): boolean {
  return editable && view === "editor" && !!activeId && mdContent !== savedContent;
}

// ---------------- job 轮询超时 ----------------
export const JOB_TIMEOUT_MS = 60000;
export function isJobTimedOut(startedAt: number, now: number, timeoutMs: number = JOB_TIMEOUT_MS): boolean {
  return now - startedAt > timeoutMs;
}

// ---------------- localStorage 读写（key 常量导出） ----------------
export const KEY_RECENT = "dsh-wiki-rag:recent";
export const KEY_EDIT_TIMES = "dsh-wiki-rag:editTimes";
export const KEY_SEARCH_HISTORY = "dsh-wiki-rag:searchHistory";

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

export function loadSearchHistory(): string[] {
  const v = readJson<string[]>(KEY_SEARCH_HISTORY, []);
  return Array.isArray(v) ? v : [];
}

/** 追加并去重，保留最近 10 条 */
export function saveSearchHistory(term: string): string[] {
  const v = term.trim();
  if (!v) return loadSearchHistory();
  const next = [v, ...loadSearchHistory().filter((x) => x !== v)].slice(0, 10);
  try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY_SEARCH_HISTORY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function loadEditTimes(): Record<string, number> {
  const v = readJson<Record<string, number>>(KEY_EDIT_TIMES, {});
  return v && typeof v === "object" ? v : {};
}

export function saveEditTimes(times: Record<string, number>): void {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY_EDIT_TIMES, JSON.stringify(times)); } catch { /* ignore */ }
}

export function markEdited(times: Record<string, number>, id: string, now: number = Date.now()): Record<string, number> {
  const next = { ...times, [id]: now };
  saveEditTimes(next);
  return next;
}

/** 构造安全的导出下载文件名：去扩展名、清洗非法字符、兜底 */
export function buildDownloadName(fileName: string | undefined, title: string | undefined, fallback = "document"): string {
  const base = (fileName || title || fallback)
    .replace(/\.(md|txt)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim() || fallback;
  return base + ".md";
}

/** 命令面板过滤：大小写不敏感包含匹配，保留顺序；q 为空返回全部 */
export function filterCommands<T extends { title: string }>(q: string, items: T[]): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return items;
  return items.filter((it) => it.title.toLowerCase().includes(s));
}

export interface Heading { level: number; text: string; line: number; }

/** 从 Markdown 提取 #/##/### 标题（行号从 0 计） */
export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  String(md || "").split("\n").forEach((line, i) => {
    const m = line.match(/^(#{1,3})\s+(.*\S)\s*#*$/);
    if (m) out.push({ level: m[1].length, text: m[2], line: i });
  });
  return out;
}

/** 在内容中查找首个命中片段所在行号（找不到返回 -1） */
export function findLineIndex(content: string, snippet: string): number {
  const s = String(snippet || "").trim();
  if (!s) return -1;
  const lines = String(content || "").split("\n");
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(s)) return i;
  // 退一步：取片段前 8 字符
  const head = s.slice(0, 8);
  for (let i = 0; i < lines.length; i++) if (head && lines[i].includes(head)) return i;
  return -1;
}
