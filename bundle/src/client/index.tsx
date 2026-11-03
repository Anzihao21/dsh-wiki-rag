/**
 * dsh-wiki-rag 客户端插件（DSH Web 浏览器侧）
 *
 * 形态：经 window.__ModuleLoader__.load 包裹后由 DSH 客户端 loader 加载，
 * 导出 cordis 插件契约 exports.apply / exports.inject。
 *
 * 落地槽位：sidebar.panellist（左侧图标）+ main（右侧内容面板）。
 * 样式一律消费宿主已全局注入的 --dsw-* 设计令牌（明暗主题自动跟随）。
 *
 * 说明：本文件为普通 TS/TSX 源码，不 import cordis/slots 实体类型（用 any 最小类型），
 * esbuild 不做类型检查；React / jsx-runtime 由宿主外部化提供。
 */
import { useState, useEffect, useRef, useCallback, Component, Fragment } from "react";

/** cordis 插件依赖的服务名（运行时由客户端 runtime 注入到 ctx）。 */
export const inject = ["slots", "locale"];

const NS = "wiki";
const API_BASE = "http://localhost:3081/api/wiki";

// 本地兜底 i18n 字典：当宿主 t() 缺失或返回 key 本身时使用，避免 UI 直接暴露 wiki.xxx
const LOCAL_FALLBACK: Record<string, string> = {
  "wiki.title": "知识库",
  "wiki.save": "保存",
  "wiki.edit": "编辑",
  "wiki.preview": "预览",
  "wiki.settings": "设置",
  "wiki.storage": "数据存储目录",
  "wiki.chunkSize": "分块大小",
  "wiki.chunkOverlap": "分块重叠",
  "wiki.rerankTopK": "Rerank TopK",
  "wiki.restartHint": "修改存储路径后将自动迁移已有文件",
  "wiki.autoIndexHint": "编辑后自动刷新向量索引",
  "wiki.back": "返回",
  "wiki.snapshots": "快照管理",
  "wiki.new": "新建",
  "wiki.noSnapshots": "暂无快照",
  "wiki.restore": "恢复",
  "wiki.logs": "审计日志",
  "wiki.noLogs": "暂无日志",
  "wiki.offline": "离线 / 宿主未连接",
  "wiki.importing": "导入中…",
  "wiki.importDone": "导入完成",
  "wiki.deleted": "已删除",
  "wiki.renamed": "已重命名",
  "wiki.folderCreated": "文件夹已创建",
  "wiki.folderDeleted": "文件夹已删除",
  "wiki.saved": "已保存",
  "wiki.restored": "快照已恢复",
  "wiki.snapshotCreated": "已创建快照",
  "wiki.searchPlaceholder": "搜索知识库…",
  "wiki.empty": "知识库为空",
};

/** 带本地兜底的 t()：宿主 t 缺失或返回 key 本身时回退到本地字典 */
function tt(t: ((key: string) => string) | undefined, key: string): string {
  if (t) {
    try {
      const v = t(key);
      if (v && v !== key) return v;
    } catch { /* ignore */ }
  }
  return LOCAL_FALLBACK[key] || key;
}

// ============================================================================
// 类型（全部 any 最小化，运行时由宿主喂数据）
// ============================================================================
interface WikiDoc {
  id: string;
  title: string;
  type: string;
  status: "ready" | "stale" | "error";
  summary: string;
  sourcePath?: string;
  fileName?: string;
  score?: number;
  chunkIndex?: number;
}

interface TreeNode {
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

interface JobState {
  jobId: string;
  phase: string;
  done: number;
  total: number;
  message: string;
  status: "running" | "done" | "error";
  error?: string;
}

interface SettingsState {
  mdStoragePath: string;
  zipStoragePath: string;
  snapshotStoragePath: string;
  chunkSize: number;
  chunkOverlap: number;
  webMode: boolean;
  webTimeout: number;
  autoSnapshot: boolean;
  embeddingProvider: string;
  rerankProvider: string;
  rerankTopK: number;
}

// ============================================================================
// 内置示例文档（离线/首屏兜底）
// ============================================================================
const SAMPLE_DOCS: WikiDoc[] = [
  { id: "1", title: "项目总览", type: "MD", status: "ready", summary: "平台定位与整体架构" },
  { id: "2", title: "接入指南", type: "MD", status: "ready", summary: "三步完成首次接入" },
  { id: "3", title: "API 参考", type: "MD", status: "stale", summary: "接口字段与示例" },
  { id: "4", title: "部署手册", type: "PDF", status: "ready", summary: "生产环境部署清单" },
  { id: "5", title: "常见问题 FAQ", type: "MD", status: "error", summary: "最近一次同步失败" },
];

const SAMPLE_MD: Record<string, string> = {
  "1": "# 项目总览\n\n## 定位\n\nDeepSeek Harness 知识库插件，本地优先的 Wiki 风格 RAG 系统。\n\n## 核心能力\n\n- 多来源文档导入\n- 向量 + 关键词混合检索\n- MD 可视化编辑\n- 快照备份\n",
  "2": "# 接入指南\n\n## 第一步\n\n安装插件。\n\n```bash\ndsh plugin add dsh-wiki-rag\n```\n\n## 第二步\n\n重启 DSH，左侧栏出现知识库面板。\n",
  "3": "# API 参考\n\n### wiki_rag_search\n\n检索知识库，返回相关文档片段。\n\n| 参数 | 类型 | 说明 |\n|------|------|------|\n| query | string | 检索词 |\n| topK | number | 返回条数 |\n",
};

// ============================================================================
// 统一请求层：区分网络错误(离线) / HTTP 错误；回调通知上层
// ============================================================================
type NotifyFn = (type: "error" | "success" | "info", msg: string) => void;

class ApiError extends Error {
  status?: number;
  offline?: boolean;
  constructor(msg: string, opts: { status?: number; offline?: boolean } = {}) {
    super(msg);
    this.status = opts.status;
    this.offline = opts.offline;
  }
}

let __notify: NotifyFn = () => {};
let __setOffline: (v: boolean) => void = () => {};

function bindNotifiers(notify: NotifyFn, setOffline: (v: boolean) => void) {
  __notify = notify;
  __setOffline = setOffline;
}

async function request(path: string, opts: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    __setOffline(true);
    throw new ApiError("offline", { offline: true });
  }
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
    if (res.status >= 500) __notify("error", msg);
    if (res.status >= 500) __setOffline(true);
    throw new ApiError(msg, { status: res.status });
  }
  __setOffline(false);
  try { return await res.json(); } catch { return null; }
}

// ---- API 封装 ----
const apiList = () =>
  request("/list").then((data: any[]) =>
    (data || []).map((f) => ({
      id: String(f.id),
      title: f.title || f.source_path?.split("/").pop() || "未命名",
      type: f.kind === "pdf" ? "PDF" : "MD",
      status: f.chunk_count > 0 ? ("ready" as const) : ("stale" as const),
      summary: f.source_path || "",
      sourcePath: f.source_path || "",
    }))
  );

const apiTree = () => request("/tree");
const apiCreateFolder = (name: string, parentId: number | null = null) =>
  request("/folders", { method: "POST", body: JSON.stringify({ name, parentId }) });
const apiRenameFolder = (id: number, name: string) =>
  request(`/folders/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) });
const apiDeleteFolder = (id: number) =>
  request(`/folders/${id}`, { method: "DELETE" });
const apiMoveFile = (fileId: string, folderId: number | null) =>
  request(`/files/${fileId}/move`, { method: "POST", body: JSON.stringify({ folderId }) });

const apiRename = (id: string, newName: string) =>
  request(`/${id}/rename`, { method: "POST", body: JSON.stringify({ newName }) });
const apiSyncFromSource = (id: string) => request(`/${id}/sync`, { method: "POST" });
const apiAcceptUpdate = (id: string, newText: string) =>
  request(`/${id}/accept-update`, { method: "POST", body: JSON.stringify({ newText }) });
const apiDismiss = (id: string) => request(`/${id}/dismiss`, { method: "POST" });
const apiDelete = (id: string) => request(`/${id}`, { method: "DELETE" });
const apiSearch = (query: string) =>
  request("/search", { method: "POST", body: JSON.stringify({ query, topK: 10 }) }).then((r: any[]) => r || []);

const apiGetSettings = () => request("/settings");
const apiSaveSettings = (patch: any) =>
  request("/settings", { method: "POST", body: JSON.stringify(patch) });

const apiCreateSnapshot = () => request("/snapshots", { method: "POST" });
const apiRestoreSnapshot = (id: number) => request(`/snapshots/${id}/restore`, { method: "POST" });
const apiGetJobs = (jobId: string) => request(`/jobs/${jobId}`);

// ============================================================================
// 安全 MD 渲染：纯 React 元素，绝不使用 dangerouslySetInnerHTML（React 自动转义）
// ============================================================================
function renderMdSafe(md: string) {
  const lines = String(md || "").split("\n");
  const out: any[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(
          <pre key={"c" + i} style={{
            background: "var(--dsw-alias-bg-module-platform)", padding: 8,
            borderRadius: 4, overflowX: "auto", fontSize: 11, margin: "6px 0",
          }}><code>{codeBuf.join("\n")}</code></pre>
        );
        codeBuf = []; inCode = false;
      } else { inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)/))) {
      out.push(<div key={i} style={{ margin: "10px 0 4px", fontSize: 13, fontWeight: 600 }}>{m[1]}</div>);
    } else if ((m = line.match(/^##\s+(.*)/))) {
      out.push(<div key={i} style={{ margin: "12px 0 6px", fontSize: 14, fontWeight: 600 }}>{m[1]}</div>);
    } else if ((m = line.match(/^#\s+(.*)/))) {
      out.push(<div key={i} style={{ margin: "14px 0 8px", fontSize: 16, fontWeight: 700 }}>{m[1]}</div>);
    } else if ((m = line.match(/^-\s+(.*)/))) {
      out.push(<div key={i} style={{ padding: "1px 0", paddingLeft: 8 }}>· {m[1]}</div>);
    } else if (line.trim() === "") {
      out.push(<div key={i} style={{ height: 6 }} />);
    } else {
      out.push(<div key={i} style={{ padding: "1px 0" }}>{line}</div>);
    }
  }
  if (inCode && codeBuf.length) {
    out.push(<pre key="tail" style={{
      background: "var(--dsw-alias-bg-module-platform)", padding: 8,
      borderRadius: 4, overflowX: "auto", fontSize: 11,
    }}><code>{codeBuf.join("\n")}</code></pre>);
  }
  return out;
}

// ============================================================================
// 极简行级 Diff：增(绿)/删(红)/改(黄)
// ============================================================================
interface DiffRow { type: "add" | "del" | "mod" | "ctx"; oldText?: string; newText?: string; }
function computeDiff(oldText: string, newText: string): DiffRow[] {
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

// ============================================================================
// 内联 SVG 图标（不使用 emoji / 不使用 "W" 文字）
// ============================================================================
function WikiIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h6M9 11h4" />
    </svg>
  );
}

function FolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

// ============================================================================
// Toast 容器
// ============================================================================
interface Toast { id: number; type: "error" | "success" | "info"; msg: string; }
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{
      position: "fixed", top: 12, right: 12, zIndex: 10001,
      display: "flex", flexDirection: "column", gap: 6, maxWidth: 320,
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          padding: "8px 12px", borderRadius: "var(--dsw-radius-md)",
          background: "var(--dsw-alias-bg-layer-1)",
          border: "1px solid var(--dsw-alias-border-l4)",
          borderLeft: "3px solid " + (
            t.type === "error" ? "var(--dsw-alias-state-danger)"
            : t.type === "success" ? "var(--dsw-alias-state-success)"
            : "var(--dsw-alias-state-business-primary)"
          ),
          color: "var(--dsw-alias-label-primary)", fontSize: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 骨架屏（CSS 动画 div）
// ============================================================================
function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
      <style>{`@keyframes dsw-shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
        .dsw-skel { background: var(--dsw-alias-bg-layer-2); border-radius: 6px; animation: dsw-shimmer 1.2s infinite; }`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dsw-skel" style={{ height: i === 0 ? 22 : 16, width: `${88 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

// ============================================================================
// 错误边界：捕获渲染异常，显示降级 UI
// ============================================================================
class ErrorBoundary extends Component<any, { hasError: boolean; msg?: string; retryCount: number }> {
  constructor(p: any) {
    super(p);
    this.state = { hasError: false, retryCount: 0 };
  }
  static getDerivedStateFromError(e: any) {
    return { hasError: true, msg: String(e && e.message || e) };
  }
  componentDidCatch(e: any) { console.warn("[dsh-wiki-rag] render error:", e); }
  render() {
    if (this.state.hasError) {
      // 重试超过 3 次不再让用户硬刚，提示刷新宿主
      const exhausted = this.state.retryCount >= 3;
      return (
        <div style={{
          padding: 24, color: "var(--dsw-alias-label-primary)", fontSize: 13,
          fontFamily: "var(--dsw-font-family)",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>知识库面板渲染异常</div>
          <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)", wordBreak: "break-all" }}>
            {this.state.msg}
          </div>
          <button
            onClick={() => {
              // 通过递增 key 强制 children 重新挂载，而不仅仅清除 hasError
              this.setState((s) => ({
                hasError: false,
                msg: undefined,
                retryCount: s.retryCount + 1,
              }));
            }}
            disabled={exhausted}
            style={{
              marginTop: 12, height: 28, padding: "0 12px", borderRadius: "var(--dsw-radius-sm)",
              border: "none", background: "var(--dsw-alias-state-business-primary)",
              color: "var(--dsw-alias-label-on-primary)", fontSize: 12, cursor: exhausted ? "not-allowed" : "pointer",
              opacity: exhausted ? 0.5 : 1,
            }}
          >
            {exhausted ? "重试次数已用尽，请重启宿主" : "重试"}
          </button>
        </div>
      );
    }
    // key 变化时 React 会重新挂载 children，实现“重试”语义
    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}

// ============================================================================
// 树扁平化 → 可虚拟滚动的行
// ============================================================================
interface FlatRow {
  rowType: "folder" | "doc";
  depth: number;
  id: number;        // folder.id 或 doc.fileId
  title: string;
  kind?: string;
  status?: string;
  raw: TreeNode;
}
function flattenTree(nodes: TreeNode[] | undefined, depth: number, expanded: Set<number>, out: FlatRow[]) {
  (nodes || []).forEach((n) => {
    if (n.type === "folder") {
      out.push({ rowType: "folder", depth, id: n.id!, title: n.name || "", raw: n });
      if (expanded.has(n.id!)) flattenTree(n.children, depth + 1, expanded, out);
    } else {
      out.push({ rowType: "doc", depth, id: n.fileId!, title: n.title || "", kind: n.kind, status: n.status, raw: n });
    }
  });
}

const ROW_H = 38;

interface WikiSidebarProps {
  wide?: boolean;
  expandSidebar?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
}

function statusStyle(status: WikiDoc["status"]) {
  if (status === "error") return { label: "异常", color: "var(--dsw-alias-state-danger)" };
  if (status === "stale") return { label: "待同步", color: "var(--dsw-alias-state-warning)" };
  return { label: "已索引", color: "var(--dsw-alias-state-success)" };
}

function WikiSidebar(props: WikiSidebarProps) {
  const { wide = true, expandSidebar, t } = props;

  // ---------- 状态 ----------
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<WikiDoc[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<string>("");
  const [view, setView] = useState<"list" | "editor" | "settings" | "snapshots" | "logs">("list");
  const [editTab, setEditTab] = useState<"edit" | "preview">("edit");
  const [mdContent, setMdContent] = useState<string>("");
  const [showImport, setShowImport] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [importType, setImportType] = useState<"file" | "url" | "note">("file");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [showNewMd, setShowNewMd] = useState(false);
  const [newMdTitle, setNewMdTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "doc" | "folder"; id: string | number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "stale" | "error">("all");
  const [searchResults, setSearchResults] = useState<WikiDoc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<{ total: number; ready: number; stale: number }>({ total: 0, ready: 0, stale: 0 });
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [logs, setLogs] = useState<{ time: string; action: string; detail: string }[]>([]);
  const [diffModal, setDiffModal] = useState<{ old: string; new: string; title: string; fileId?: string; newText?: string } | null>(null);
  const [settings, setSettings] = useState<Partial<SettingsState>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offline, setOffline] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  const searchInflight = useRef(false);
  const importInflight = useRef(false);
  const toastId = useRef(0);

  // ---------- Toast ----------
  const notify = useCallback((type: Toast["type"], msg: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  useEffect(() => { bindNotifiers(notify, setOffline); }, [notify]);

  // ---------- 数据加载 ----------
  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [l, tr, s, sn, lg] = await Promise.all([
        apiList().catch(() => SAMPLE_DOCS),
        apiTree().catch(() => []),
        request("/stats").catch(() => ({ total: 0, ready: 0, stale: 0 })),
        request("/snapshots").catch(() => []),
        request("/logs").catch(() => []),
      ]);
      setDocs(l);
      setTree(tr);
      setStats(s);
      setSnapshots(sn || []);
      setLogs(lg || []);
    } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // ---------- 快捷键 Ctrl+S 保存 / Ctrl+F 聚焦搜索 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (view === "editor") saveEdit();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mdContent, activeId]);

  // ---------- 导入（async 任务 + 进度条） ----------
  const pollJob = useCallback((jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const j = await apiGetJobs(jobId);
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer);
          if (j.status === "done") { notify("success", t ? t("wiki.importDone") : "导入完成"); refreshList(); }
          else notify("error", j.error || "导入失败");
          setTimeout(() => setJob(null), 1500);
        }
      } catch { /* ignore poll error */ }
    }, 700);
  }, [notify, refreshList, t]);

  const doImport = async () => {
    if (importInflight.current) return;
    try {
      let source = "", kind: any = "file", noteText: string | undefined;
      if (importType === "note") {
        if (!noteTitle.trim()) return;
        source = noteTitle.trim(); kind = "note"; noteText = noteContent;
      } else {
        if (!importPath.trim()) return;
        source = importPath.trim(); kind = importType === "url" ? "url" : "file";
      }
      importInflight.current = true;
      const res = await request("/import", {
        method: "POST",
        body: JSON.stringify({ source, kind, noteText, async: true }),
      });
      if (res && res.jobId) {
        setJob({ jobId: res.jobId, phase: "import", done: 0, total: 0, message: "", status: "running" });
        pollJob(res.jobId);
      }
    } catch (e: any) {
      if (e?.offline) notify("error", t ? t("wiki.offline") : "离线 / 宿主未连接");
      else notify("error", e?.message || "导入失败");
    } finally {
      importInflight.current = false;
      setShowImport(false); setImportPath(""); setNoteTitle(""); setNoteContent("");
    }
  };

  // ---------- 删除 ----------
  const doDelete = async (id: string) => {
    try {
      await apiDelete(id);
      notify("success", t ? t("wiki.deleted") : "已删除");
      refreshList();
    } catch (e: any) { notify("error", e?.message || "删除失败"); }
  };

  // ---------- 搜索（in-flight 去重） ----------
  const doSearch = async () => {
    if (!q.trim() || searchInflight.current) return;
    searchInflight.current = true;
    setSearching(true);
    try {
      const hits = await apiSearch(q.trim());
      setSearchResults(hits.map((r: any, i: number) => ({
        id: String(r.fileId ?? i),
        title: r.title || r.fileName || `结果 ${i + 1}`,
        type: "MD" as const,
        status: "ready" as const,
        summary: r.content?.slice(0, 120) || "",
        sourcePath: r.sourcePath || "",
        fileName: r.fileName || "",
        score: r.score,
        chunkIndex: r.chunkIndex,
      })));
    } catch (e: any) {
      if (e?.offline) notify("error", t ? t("wiki.offline") : "离线 / 宿主未连接");
      else notify("error", e?.message || "搜索失败");
      setSearchResults([]);
    } finally { searchInflight.current = false; setSearching(false); }
  };

  // ---------- 重命名文档 ----------
  const doRenameDoc = async (id: string) => {
    if (!renameText.trim()) return;
    try { await apiRename(id, renameText.trim()); notify("success", t ? t("wiki.renamed") : "已重命名"); }
    catch (e: any) { notify("error", e?.message || "重命名失败"); }
    setRenamingId(null); setRenameText(""); refreshList();
  };

  // ---------- 文件夹操作 ----------
  const doCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try { await apiCreateFolder(newFolderName.trim()); notify("success", t ? t("wiki.folderCreated") : "文件夹已创建"); }
    catch (e: any) { notify("error", e?.message || "创建失败"); }
    setNewFolderName(""); setShowNewFolder(false); refreshList();
  };
  const doRenameFolder = async (id: number) => {
    if (!renameText.trim()) return;
    try { await apiRenameFolder(id, renameText.trim()); notify("success", t ? t("wiki.renamed") : "已重命名"); }
    catch (e: any) { notify("error", e?.message || "重命名失败"); }
    setRenamingId(null); setRenameText(""); refreshList();
  };
  const doDeleteFolder = async (id: number) => {
    try { await apiDeleteFolder(id); notify("success", t ? t("wiki.folderDeleted") : "文件夹已删除"); }
    catch (e: any) { notify("error", e?.message || "删除失败"); }
    refreshList();
  };
  const doMoveDoc = async (fileId: string, folderId: number | null) => {
    try { await apiMoveFile(fileId, folderId); refreshList(); }
    catch (e: any) { notify("error", e?.message || "移动失败"); }
  };

  // ---------- 保存设置（POST /settings） ----------
  const saveSettings = async () => {
    try {
      const res = await apiSaveSettings(settings);
      if (res?.settings) setSettings(res.settings);
      notify("success", t ? t("wiki.saved") : "已保存");
    } catch (e: any) { notify("error", e?.message || "保存失败"); }
    setView("list");
  };

  // ---------- 保存编辑 ----------
  const saveEdit = () => { setView("list"); };

  // ---------- 快照恢复 ----------
  const doRestore = async (id: number) => {
    try {
      await apiRestoreSnapshot(id);
      notify("success", t ? t("wiki.restored") : "快照已恢复");
      refreshList();
    } catch (e: any) { notify("error", e?.message || "恢复失败"); }
  };

  const title = t ? t("wiki.title") : "知识库";

  // ==========================================================================
  // 收起 rail：内联 SVG 图标按钮
  // ==========================================================================
  if (!wide) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 8 }}>
        <button title={title} onClick={expandSidebar}
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "transparent", cursor: "pointer",
            color: "var(--dsw-alias-label-secondary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <WikiIcon size={18} />
        </button>
      </div>
    );
  }

  const activeDoc = docs.find((d) => d.id === activeId);

  const isEmpty = rows.length === 0 && !loadingList && docs.length === 0;

  return (
    <div style={rootStyle}>
      {/* Toast */}
      <ToastStack toasts={toasts} />

      {/* 离线提示条 */}
      {offline && (
        <div style={{
          padding: "4px 8px", borderRadius: "var(--dsw-radius-sm)", fontSize: 11,
          background: "var(--dsw-alias-state-warning)", color: "var(--dsw-alias-label-on-primary)",
        }}>{t ? t("wiki.offline") : "离线 / 宿主未连接"}</div>
      )}

      {/* 批量任务进度条 */}
      {job && (
        <div style={{ padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{job.message || (t ? t("wiki.importing") : "导入中…")}</div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-layer-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: job.total ? `${Math.min(100, (job.done / job.total) * 100)}%` : "0%",
              background: "var(--dsw-alias-state-business-primary)", transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }}>{job.done} / {job.total}</div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0" }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <WikiIcon size={16} />{title}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[
            ["+", "import", () => setShowImport(!showImport)],
            [t ? t("wiki.newFolder") : "Dir", "folder", () => setShowNewFolder(!showNewFolder)],
            ["⟳", "refresh", () => refreshList()],
            [t ? t("wiki.snapshots") : "Snap", "snap", () => setView("snapshots")],
            [t ? t("wiki.logs") : "Logs", "logs", () => setView("logs")],
            [t ? t("wiki.settings") : "Set", "set", () => setView("settings")],
          ].map(([lbl, tip, fn], i) => (
            <button key={i} title={tip as string} onClick={fn as any} style={headerBtn}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* 左右分栏主区域 */}
      <div style={mainLayoutStyle}>
        {/* 左侧：文件树 */}
        <div style={sidebarStyle}>
          {/* 搜索框 */}
          <input ref={searchInputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            placeholder={t ? t("wiki.search") : "搜索文档…"}
            style={searchInputStyle} />

          {/* 新建文件夹 */}
          {showNewFolder && (
            <div style={{ display: "flex", gap: 4 }}>
              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doCreateFolder(); }}
                placeholder={t ? t("wiki.folderName") : "文件夹名称…"} autoFocus
                style={smallInput} />
              <button onClick={doCreateFolder} style={primaryBtn}>{t ? t("wiki.new") : "新建"}</button>
            </div>
          )}

          {/* 导入面板 */}
          {showImport && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", gap: 2 }}>
                {([["file", "文件"], ["url", "URL"], ["note", "笔记"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setImportType(k)} style={{
                    flex: 1, padding: "3px 0", border: "none", cursor: "pointer", borderRadius: "var(--dsw-radius-sm)", fontSize: 11,
                    background: importType === k ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                    color: importType === k ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                  }}>{l}</button>
                ))}
              </div>
              {importType !== "note" ? (
                <input value={importPath} onChange={(e) => setImportPath(e.target.value)}
                  placeholder={importType === "url" ? "https://example.com/article" : "输入文件路径…"} style={smallInput} />
              ) : (
                <>
                  <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="笔记标题…" style={smallInput} />
                  <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="笔记内容…" rows={3}
                    style={{ ...smallInput, height: "auto", padding: "6px 8px", resize: "vertical" }} />
                </>
              )}
              <button onClick={doImport} disabled={importInflight.current} style={{ ...primaryBtn, opacity: importInflight.current ? 0.6 : 1 }}>
                {importInflight.current ? "…" : (t ? t("wiki.import") : "导入")}
              </button>
            </div>
          )}

          {/* 状态筛选 */}
          <div style={{ display: "flex", gap: 2 }}>
            {([["all", "全部"], ["ready", "已索引"], ["stale", "待同步"], ["error", "异常"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} style={{
                flex: 1, padding: "3px 0", border: "none", cursor: "pointer", borderRadius: "var(--dsw-radius-sm)", fontSize: 11,
                background: statusFilter === key ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                color: statusFilter === key ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                fontWeight: statusFilter === key ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* 文件列表区 */}
          <div ref={listScrollRef}
            onScroll={(e) => { setScrollTop(e.currentTarget.scrollTop); setViewportH(e.currentTarget.clientHeight); }}
            style={{ flex: 1, overflowY: "auto", position: "relative", minHeight: 0 }}>
            {loadingList ? (
              <SkeletonRows count={8} />
            ) : searchingMode ? (
              searching ? <SkeletonRows count={5} /> :
                searchResults!.length === 0 ? <div style={emptyHint}>{t ? t("wiki.noResult") : "无搜索结果"}</div> :
                  searchResults!.map((r, i) => (
                    <div key={i} onClick={() => { setActiveId(r.id); setMdContent(r.summary); }}
                      style={{
                        padding: "8px 10px", borderRadius: "var(--dsw-radius-md)", cursor: "pointer", marginBottom: 4,
                        background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                        <span style={{
                          fontSize: 10, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                          background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)",
                        }}>{r.fileName || "MD"}</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{r.summary}</div>
                      <div style={{ marginTop: 4, fontSize: 10, color: "var(--dsw-alias-label-tertiary)", display: "flex", gap: 8 }}>
                        {r.sourcePath && <span>{r.sourcePath}</span>}
                        {typeof r.score === "number" && <span>score {r.score.toFixed(3)}</span>}
                      </div>
                    </div>
                  ))
            ) : rows.length === 0 ? (
              <div style={emptyHint}>{t ? t("wiki.empty") : "知识库为空"}</div>
            ) : (
              <div style={{ height: rows.length * ROW_H, position: "relative" }}>
                {visibleRows.map((row) => {
                  const top = (startIndex + rows.indexOf(row)) * ROW_H;
                  if (row.rowType === "folder") {
                    const open = expandedFolders.has(row.id);
                    return (
                      <div key={"f" + row.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const fid = e.dataTransfer.getData("text/doc-id"); if (fid) doMoveDoc(fid, row.id); }}
                        onClick={() => setExpandedFolders((prev) => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: row.id }); }}
                        style={{
                          position: "absolute", top, left: 0, right: 0, height: ROW_H,
                          paddingLeft: 8 + row.depth * 14, display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                          color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 600,
                        }}>
                        <span style={{ fontSize: 10, color: "var(--dsw-alias-label-secondary)" }}>{open ? "▼" : "▶"}</span>
                        <FolderIcon size={14} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                      </div>
                    );
                  }
                  const d: WikiDoc = { id: String(row.id), title: row.title, type: row.kind || "MD", status: (row.status as any) || "ready", summary: "" };
                  const st = statusStyle(d.status);
                  const active = d.id === activeId;
                  return (
                    <div key={"d" + row.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/doc-id", d.id)}
                      onClick={() => { setActiveId(d.id); setMdContent(SAMPLE_MD[d.id] ?? "# " + d.title + "\n\n暂无内容\n"); }}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, kind: "doc", id: d.id }); }}
                      style={{
                        position: "absolute", top, left: 0, right: 0, height: ROW_H,
                        paddingLeft: 22 + row.depth * 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                        borderRadius: "var(--dsw-radius-md)",
                        background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                        borderLeft: active ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                      }}>
                      <FileIcon size={13} />
                      {renamingId === d.id ? (
                        <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") doRenameDoc(d.id); if (e.key === "Escape") { setRenamingId(null); setRenameText(""); } }}
                          onBlur={() => doRenameDoc(d.id)}
                          style={{ flex: 1, height: 20, padding: "0 4px", boxSizing: "border-box", borderRadius: 4, border: "1px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-bg-layer-0)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 13 }} />
                      ) : (
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: active ? 600 : 500 }}>{row.title}</span>
                      )}
                      <span style={{ fontSize: 10, color: st.color }}>●</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部统计 */}
          <div style={{ padding: "6px 2px 0", borderTop: "1px solid var(--dsw-alias-border-l1)", fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>
            {t ? t("wiki.count", { n: stats.total || rows.length }) : `共 ${stats.total || rows.length} 条`}
          </div>
        </div>

        {/* 右侧：编辑器 */}
        <div style={editorStyle}>
          {view === "settings" ? (
            /* 设置面板 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{t ? t("wiki.settings") : "设置"}</span>
                <button onClick={() => setView("list")} style={iconBtn}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{t ? t("wiki.storage") : "数据存储目录"}</div>
                  <input value={settings.mdStoragePath || ""} onChange={(e) => setSettings({ ...settings, mdStoragePath: e.target.value })} style={smallInput} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t ? t("wiki.chunkSize") : "分块大小"}</div>
                    <input type="number" value={settings.chunkSize || 500} onChange={(e) => setSettings({ ...settings, chunkSize: Number(e.target.value) })} style={smallInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t ? t("wiki.chunkOverlap") : "分块重叠"}</div>
                    <input type="number" value={settings.chunkOverlap || 80} onChange={(e) => setSettings({ ...settings, chunkOverlap: Number(e.target.value) })} style={smallInput} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{t ? t("wiki.rerankTopK") : "Rerank TopK"}</div>
                  <input type="number" value={settings.rerankTopK || 5} onChange={(e) => setSettings({ ...settings, rerankTopK: Number(e.target.value) })} style={smallInput} />
                </div>
                <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{t ? t("wiki.restartHint") : "修改存储路径后将自动迁移已有文件"}</div>
                <button onClick={saveSettings} style={primaryBtn}>{t ? t("wiki.save") : "保存"}</button>
              </div>
            </div>
          ) : view === "snapshots" ? (
            /* 快照面板 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t ? t("wiki.snapshots") : "快照"}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={doCreateSnapshot} style={primaryBtn}>{t ? t("wiki.new") : "新建"}</button>
                  <button onClick={() => setView("list")} style={iconBtn}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {snapshots.length === 0 ? <div style={emptyHint}>{t ? t("wiki.noSnapshots") : "暂无快照"}</div> :
                  snapshots.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-2)" }}>
                      <span style={{ flex: 1, fontSize: 12 }}>{s.name || `Snapshot ${s.id}`}</span>
                      <span style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{new Date(s.time || s.created_at || 0).toLocaleString()}</span>
                      <button onClick={() => doRestoreSnapshot(s.id)} style={ghostBtn}>{t ? t("wiki.restore") : "恢复"}</button>
                    </div>
                  ))}
              </div>
            </div>
          ) : view === "logs" ? (
            /* 日志面板 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t ? t("wiki.logs") : "日志"}</span>
                <button onClick={() => setView("list")} style={iconBtn}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {logs.length === 0 ? <div style={emptyHint}>{t ? t("wiki.noLogs") : "暂无日志"}</div> :
                  logs.map((l, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "4px 8px", borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-2)", fontSize: 11 }}>
                      <span style={{ color: "var(--dsw-alias-label-tertiary)", flexShrink: 0 }}>{new Date(l.time).toLocaleTimeString()}</span>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>{l.action}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.detail}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : activeDoc ? (
            /* MD 编辑器 */
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDoc.title}</span>
                <span style={typeBadge}>{activeDoc.type}</span>
                <button onClick={saveEdit} style={primaryBtn}>{t ? t("wiki.save") : "保存"}</button>
              </div>
              <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--dsw-alias-border-l1)" }}>
                {(["edit", "preview"] as const).map((tab) => (
                  <button key={tab} onClick={() => setEditTab(tab)} style={{
                    padding: "6px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12,
                    color: editTab === tab ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                    borderBottom: editTab === tab ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                    fontWeight: editTab === tab ? 600 : 400,
                  }}>{tab === "edit" ? (t ? t("wiki.edit") : "编辑") : (t ? t("wiki.preview") : "预览")}</button>
                ))}
              </div>
              {editTab === "edit" ? (
                <textarea value={mdContent} onChange={(e) => setMdContent(e.target.value)}
                  style={{
                    flex: 1, width: "100%", boxSizing: "border-box", padding: 12, border: "none", outline: "none", resize: "none",
                    background: "transparent", color: "var(--dsw-alias-label-primary)", fontSize: 13, fontFamily: "var(--dsw-font-family-mono, monospace)", lineHeight: 1.6,
                  }} />
              ) : (
                <div style={{ flex: 1, overflowY: "auto", padding: 12 }} dangerouslySetInnerHTML={{ __html: renderMdSafe(mdContent) }} />
              )}
            </>
          ) : (
            /* 空状态 */
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 13 }}>
              {t ? t("wiki.empty") : "选择左侧文档开始编辑"}
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 998 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y,
            background: "var(--dsw-alias-bg-layer-1)", borderRadius: "var(--dsw-radius-md)",
            border: "1px solid var(--dsw-alias-border-l4)", padding: 4, minWidth: 140,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}>
            <div onClick={() => {
              setRenamingId(contextMenu.id);
              const cur = contextMenu.kind === "doc" ? docs.find((d) => d.id === String(contextMenu.id))?.title : treeFindName(tree, Number(contextMenu.id));
              setRenameText(cur || ""); setContextMenu(null);
            }} style={menuItem}>{t ? t("wiki.rename") : "重命名"}</div>
            {contextMenu.kind === "doc" && (
              <div onClick={async () => {
                const docId = String(contextMenu.id); setContextMenu(null);
                const outcome = await apiSyncFromSource(docId).catch(() => null);
                if (outcome && outcome.status === "needs-confirm" && outcome.diff) {
                  setDiffModal({ old: outcome.diff.oldText || "", new: outcome.diff.newText || "", title: `从源目录更新：${outcome.diff.fileName || ""}`, fileId: docId, newText: outcome.diff.newText || "" });
                } else {
                  setDiffModal({ old: "", new: outcome?.reason || "无可用更新", title: "从源目录更新" });
                }
              }} style={menuItem}>{t ? t("wiki.update") : "从源目录更新"}</div>
            )}
            <div onClick={() => {
              if (contextMenu.kind === "doc") doDelete(String(contextMenu.id));
              else doDeleteFolder(Number(contextMenu.id));
              setContextMenu(null);
            }} style={{ ...menuItem, color: "var(--dsw-alias-state-danger)" }}>{t ? t("wiki.delete") : "删除"}</div>
          </div>
        </div>
      )}

      {/* Diff 三色确认弹窗 */}
      {diffModal && <DiffModalBox modal={diffModal} t={t} onClose={() => setDiffModal(null)} onAccept={async (ft, nt) => {
        try { await apiAcceptUpdate(ft, nt); refreshList(); notify("success", t ? t("wiki.accepted") : "已接受更新"); }
        catch (e: any) { notify("error", e?.message || "接受失败"); }
        setDiffModal(null);
      }} onReject={async (ft) => {
        try { await apiDismiss(ft); } catch { /* ignore */ }
        setDiffModal(null);
      }} />}
    </div>
  );
}

// ---------- 内联样式常量 ----------
const rootStyle: any = {
  height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8,
  padding: "6px 10px", color: "var(--dsw-alias-label-primary)", fontSize: 14, fontFamily: "var(--dsw-font-family)",
};

const mainLayoutStyle: any = {
  flex: 1, display: "flex", gap: 8, overflow: "hidden", minHeight: 0,
};

const sidebarStyle: any = {
  width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 0,
};

const editorStyle: any = {
  flex: 1, display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "hidden",
};
const iconBtn: any = { border: "none", background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary)", fontSize: 16, padding: 2 };
const primaryBtn: any = {
  height: 26, padding: "0 10px", borderRadius: "var(--dsw-radius-sm)", border: "none",
  background: "var(--dsw-alias-state-business-primary)", color: "var(--dsw-alias-label-on-primary)", fontSize: 12, cursor: "pointer",
};
const ghostBtn: any = {
  height: 26, padding: "0 10px", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)",
  background: "transparent", color: "var(--dsw-alias-label-primary)", fontSize: 12, cursor: "pointer",
};
const headerBtn: any = {
  width: 24, height: 24, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer",
  color: "var(--dsw-alias-label-secondary)", fontSize: 12,
};
const searchInputStyle: any = {
  height: 32, padding: "0 10px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-md)",
  border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-1)",
  color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 13,
};
const smallInput: any = {
  flex: 1, height: 28, padding: "0 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)",
  border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-0)",
  color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 12,
};
const typeBadge: any = {
  fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)",
};
const textareaStyle: any = {
  flex: 1, width: "100%", boxSizing: "border-box", resize: "none", padding: 10,
  borderRadius: "var(--dsw-radius-md)", border: "1px solid var(--dsw-alias-border-l4)",
  background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
  fontFamily: "var(--dsw-font-family-mono, monospace)", fontSize: 12, lineHeight: 1.6, outline: "none",
};
const emptyHint: any = { padding: "24px 8px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 };
const menuItem: any = {
  padding: "6px 10px", fontSize: 12, cursor: "pointer", borderRadius: 4,
};

// ---------- 工具：在树里查文件夹名 ----------
function treeFindName(nodes: TreeNode[], id: number): string {
  for (const n of nodes || []) {
    if (n.type === "folder") {
      if (n.id === id) return n.name || "";
      const r = treeFindName(n.children || [], id);
      if (r) return r;
    }
  }
  return "";
}

// ---------- Diff 三色弹窗组件 ----------
function DiffModalBox(props: {
  modal: { old: string; new: string; title: string; fileId?: string; newText?: string };
  t?: (k: string) => string;
  onClose: () => void;
  onAccept: (fileId: string, newText: string) => void;
  onReject: (fileId: string) => void;
}) {
  const { modal, t, onClose, onAccept, onReject } = props;
  const rows = computeDiff(modal.old, modal.new);
  const rowColor: Record<string, any> = {
    add: { background: "var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-success)", sign: "+" },
    del: { background: "var(--dsw-alias-state-danger-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-danger)", sign: "-" },
    mod: { background: "var(--dsw-alias-state-warning-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-warning)", sign: "~" },
    ctx: { background: "transparent", color: "var(--dsw-alias-label-secondary)", sign: " " },
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{
        width: "90%", maxWidth: 560, maxHeight: "80vh", background: "var(--dsw-alias-bg-layer-1)",
        borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t ? t("wiki.changeConfirm") : "变更确认"}：{modal.title}</div>
        <div style={{ flex: 1, overflow: "auto", fontSize: 12, fontFamily: "var(--dsw-font-family-mono, monospace)", display: "flex", flexDirection: "column" }}>
          {rows.map((r, i) => {
            if (r.type === "mod") {
              return (
                <div key={i}>
                  <div style={{ ...rowColor.mod, padding: "2px 6px", whiteSpace: "pre-wrap" }}>- {r.oldText}</div>
                  <div style={{ ...rowColor.mod, padding: "2px 6px", whiteSpace: "pre-wrap" }}>+ {r.newText}</div>
                </div>
              );
            }
            const c = rowColor[r.type];
            const txt = r.type === "del" ? r.oldText : r.newText;
            return <div key={i} style={{ ...c, padding: "2px 6px", whiteSpace: "pre-wrap" }}>{c.sign} {txt}</div>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => { if (modal.fileId) onReject(modal.fileId); else onClose(); }} style={ghostBtn}>{t ? t("wiki.reject") : "拒绝"}</button>
          <button onClick={() => { if (modal.fileId && modal.newText != null) onAccept(modal.fileId, modal.newText); else onClose(); }} style={primaryBtn}>{t ? t("wiki.accept") : "接受"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// cordis 插件入口
// ============================================================================
function apply(ctx: any): void {
  ctx.effect(() => ctx.locale.register(NS, {
    zh: {
      "wiki.title": "知识库", "wiki.search": "搜索文档…", "wiki.refresh": "刷新",
      "wiki.settings": "设置", "wiki.new": "新建", "wiki.snapshots": "快照", "wiki.logs": "日志",
      "wiki.rename": "重命名", "wiki.update": "从源目录更新", "wiki.delete": "删除",
      "wiki.root": "根目录", "wiki.empty": "暂无文档", "wiki.noLogs": "暂无日志",
      "wiki.noSnapshots": "暂无快照", "wiki.noResult": "无搜索结果", "wiki.back": "返回",
      "wiki.save": "保存", "wiki.edit": "编辑", "wiki.preview": "预览",
      "wiki.storage": "数据存储目录", "wiki.chunkSize": "分块大小", "wiki.chunkOverlap": "分块重叠",
      "wiki.rerankTopK": "Rerank TopK", "wiki.restartHint": "修改存储路径后将自动迁移已有文件",
      "wiki.import": "导入", "wiki.importing": "导入中…", "wiki.importDone": "导入完成",
      "wiki.folderName": "文件夹名称…", "wiki.newFolder": "目录", "wiki.folderCreated": "文件夹已创建",
      "wiki.folderDeleted": "文件夹已删除", "wiki.offline": "离线 / 宿主未连接",
      "wiki.restore": "恢复", "wiki.restored": "快照已恢复", "wiki.snapshotCreated": "已创建快照",
      "wiki.saved": "已保存", "wiki.deleted": "已删除", "wiki.renamed": "已重命名",
      "wiki.accepted": "已接受更新", "wiki.changeConfirm": "变更确认",
      "wiki.reject": "拒绝", "wiki.accept": "接受", "wiki.autoIndexHint": "编辑后自动刷新向量索引",
      "wiki.count": "共 {n} 条",
    },
    en: {
      "wiki.title": "Wiki", "wiki.search": "Search docs…", "wiki.refresh": "Refresh",
      "wiki.settings": "Settings", "wiki.new": "New", "wiki.snapshots": "Snapshots", "wiki.logs": "Logs",
      "wiki.rename": "Rename", "wiki.update": "Update from source", "wiki.delete": "Delete",
      "wiki.root": "Root", "wiki.empty": "No documents", "wiki.noLogs": "No logs",
      "wiki.noSnapshots": "No snapshots", "wiki.noResult": "No results", "wiki.back": "Back",
      "wiki.save": "Save", "wiki.edit": "Edit", "wiki.preview": "Preview",
      "wiki.storage": "Storage Directories", "wiki.chunkSize": "Chunk Size", "wiki.chunkOverlap": "Chunk Overlap",
      "wiki.rerankTopK": "Rerank TopK", "wiki.restartHint": "Files will be migrated on save",
      "wiki.import": "Import", "wiki.importing": "Importing…", "wiki.importDone": "Import done",
      "wiki.folderName": "Folder name…", "wiki.newFolder": "Dir", "wiki.folderCreated": "Folder created",
      "wiki.folderDeleted": "Folder deleted", "wiki.offline": "Offline / host disconnected",
      "wiki.restore": "Restore", "wiki.restored": "Snapshot restored", "wiki.snapshotCreated": "Snapshot created",
      "wiki.saved": "Saved", "wiki.deleted": "Deleted", "wiki.renamed": "Renamed",
      "wiki.accepted": "Update accepted", "wiki.changeConfirm": "Confirm changes",
      "wiki.reject": "Reject", "wiki.accept": "Accept", "wiki.autoIndexHint": "Vector index auto-refreshed after edit",
      "wiki.count": "{n} items",
    },
  }), "wiki: dictionaries");

  ctx.effect(() => {
    let disposed = false;
    let unsubPanel: (() => void) | undefined;
    let unsubMain: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    const PANEL_ID = "wiki-rag";

    const tryRegister = () => {
      if (disposed || unsubPanel || unsubMain) return;
      let panelDeclared: unknown, mainDeclared: unknown;
      try {
        panelDeclared = ctx.slots && typeof ctx.slots.spec === "function" ? ctx.slots.spec("sidebar.panellist") : undefined;
        mainDeclared = ctx.slots && typeof ctx.slots.spec === "function" ? ctx.slots.spec("main") : undefined;
      } catch { return; }
      if (!panelDeclared || !mainDeclared) return;
      try {
        unsubMain = ctx.slots.register(
          { name: "main", key: PANEL_ID, locale: NS,
            inject: () => ({ t: ctx.locale?.bind ? ctx.locale.bind(NS) : undefined }) },
          () => (
            <div style={{ width: "100%", maxWidth: "960px", margin: "0 auto", padding: "24px", height: "100%" }}>
              <ErrorBoundary>
                <WikiSidebar wide />
              </ErrorBoundary>
            </div>
          )
        );
        unsubPanel = ctx.slots.register(
          { name: "sidebar.panellist", id: PANEL_ID, order: 100,
            label: () => (ctx.locale ? ctx.locale.bind(NS)("wiki.title") : "Wiki"), locale: NS,
            icon: () => <WikiIcon size={18} /> },
          () => <WikiIcon size={18} />
        );
        if (timer) { clearInterval(timer); timer = undefined; }
      } catch (e) { console.warn("[dsh-wiki-rag] slots.register failed:", e); }
    };

    tryRegister();
    if (!unsubPanel || !unsubMain) {
      try {
        if (typeof ctx.slots?.subscribeDeclaration === "function") {
          ctx.slots.subscribeDeclaration("sidebar.panellist", tryRegister);
          ctx.slots.subscribeDeclaration("main", tryRegister);
        }
      } catch { /* ignore */ }
      timer = setInterval(() => {
        if (++attempts > 15) { if (timer) clearInterval(timer); return; }
        tryRegister();
      }, 1000);
    }
    return () => {
      disposed = true; unsubPanel?.(); unsubMain?.(); if (timer) clearInterval(timer);
    };
  }, "wiki: sidebar.panellist + main registration");
}

export { apply, WikiSidebar };
