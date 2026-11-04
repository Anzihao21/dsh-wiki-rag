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
import { useState, useEffect, useRef, useCallback, useMemo, Component, Fragment } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import TurndownService from "turndown";
import DOMPurify from "dompurify";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

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
  "wiki.newDoc": "新建文档",
  "wiki.newDocTitle": "新文档标题",
  "wiki.rebindSource": "重新绑定源路径",
  "wiki.rebindSourcePrompt": "输入新的源路径…",
  "wiki.folderSync": "从源文件夹批量同步",
  "wiki.folderRebindSource": "重新选择源文件夹",
  "wiki.folderRebindSourcePrompt": "输入新的源文件夹路径…",
  "wiki.folderRebound": "已重新选择源文件夹",
  "wiki.shelve": "暂存",
  "wiki.shelved": "已暂存",
  "wiki.moved": "已移动",
  "wiki.created": "已创建",
  "wiki.dismissed": "已忽略更新",
  "wiki.zipStorage": "压缩包存储目录",
  "wiki.snapshotStorage": "快照存储目录",
  "wiki.snapshotKeep": "快照保留份数",
  "wiki.webMode": "Web 模式",
  "webModeIntranet": "内网模式",
  "webModeExtranet": "外网模式",
  "wiki.autoSnapshot": "自动快照",
  "wiki.chunkMode": "切片模式",
  "chunkModeFixed": "固定切片",
  "chunkModeHeading": "标题分层切片",
  "wiki.pendingChanges": "待确认变更",
  "wiki.cancel": "取消",
  "wiki.confirm": "确定",
  "wiki.contentSaved": "内容已保存",
  "wiki.search": "搜索",
  "wiki.import": "导入",
  "wiki.delete": "删除",
  "wiki.rename": "重命名",
  "wiki.accept": "接受",
  "wiki.reject": "拒绝",
  "wiki.accepted": "已接受",
  "wiki.update": "更新",
  "wiki.newFolder": "新建文件夹",
  "wiki.folderName": "文件夹名称",
  "wiki.noChanges": "暂无变更",
  "wiki.noResult": "无搜索结果",
  "wiki.confirmRestore": "确认恢复",
  "wiki.restorePreview": "恢复预览",
  "wiki.restoreWarning": "恢复将覆盖当前内容",
  "wiki.changeConfirm": "确认变更",
  "wiki.willAdd": "将新增",
  "wiki.willOverwrite": "将覆盖",
  "wiki.willRemove": "将移除",
  "wiki.fullscreen": "全屏",
  "wiki.exitFullscreen": "退出全屏",
  "wiki.more": "更多",
  "wiki.browseFile": "浏览文件",
  "wiki.refresh": "刷新",
  "wiki.emptyTitle": "从左侧选择文档开始",
  "wiki.emptyHint": "在左侧导入或搜索文档，点击后即可在此查看与编辑。支持本地文件 / 网页 / 笔记 / Excel / PPT 等。",
  "wiki.statusReady": "已索引",
  "wiki.statusStale": "待同步",
  "wiki.statusError": "异常",
  "wiki.confirmDeleteDoc": "确定删除该文档？删除后不可恢复。",
  "wiki.confirmDeleteFolder": "确定删除该文件夹及其下所有文档？删除后不可恢复。",
  "wiki.autoSaveConflict": "检测到外部修改，请用“保存”按钮处理",
  "wiki.autoSaveFailed": "自动保存失败",
  "wiki.webModeHint": "网页抓取模式",
  "wiki.webModeInSettings": "见设置",
  "wiki.newSubFolder": "新建子文件夹",
  "wiki.underFolder": "位于",
  "wiki.expandAll": "全部展开",
  "wiki.collapseAll": "全部折叠",
  "wiki.charCount": "字符",
  "wiki.cannotMoveIntoSelf": "不能移动到自身的子文件夹下",
  "wiki.favSection": "收藏",
  "wiki.recentSection": "最近打开",
  "wiki.fav": "收藏",
  "wiki.unfav": "取消收藏",
  "wiki.dropImport": "释放以导入到知识库",
  "wiki.filesSelected": "已选 {n} 个文件",
  "wiki.clear": "清空",
  "wiki.importSubmitting": "已提交 {n} 个文件导入",
  "wiki.emptyFolder": "空文件夹",
  "wiki.rootAll": "全部文件",
  "wiki.create": "新建 / 导入",
  "wiki.export": "导出 Markdown",
  "wiki.exported": "已导出 Markdown",
  "wiki.copiedContent": "已复制内容到剪贴板",
  "wiki.leaveUnsaved": "有未保存的修改",
  "wiki.saveAndLeave": "保存并离开",
  "wiki.discard": "放弃修改",
  "wiki.noFavHint": "暂无收藏，点文件行 ☆ 收藏",
  "wiki.noRecentHint": "暂无最近打开",
  "wiki.searchHistory": "搜索历史",
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
  chunkMode: "fixed" | "heading";
  webMode: "intranet" | "extranet";
  webTimeout: number;
  autoSnapshot: boolean;
  snapshotKeep: number;
  embeddingProvider: string;
  embeddingModelPath: string;
  embeddingOpenAIBaseURL: string;
  embeddingOpenAIAPIKey: string;
  embeddingOpenAIModel: string;
  rerankProvider: string;
  rerankModelPath: string;
  rerankOpenAIBaseURL: string;
  rerankOpenAIAPIKey: string;
  rerankOpenAIModel: string;
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
    let j: any = null;
    try { j = await res.json(); msg = j?.error || msg; } catch { /* ignore */ }
    if (res.status >= 500) __notify("error", msg);
    if (res.status >= 500) __setOffline(true);
    throw new ApiError(msg, { status: res.status, ...(j || {}) });
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
const apiMoveFolder = (id: number, parentId: number | null) =>
  request(`/folders/${id}/move`, { method: "POST", body: JSON.stringify({ parentId }) });
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

const apiFetchVersions = (fileId: string) => request(`/files/${fileId}/versions`);
const apiGetVersion = (fileId: string, ver: number) => request(`/files/${fileId}/versions/${ver}`);
const apiRestoreVersion = (fileId: string, ver: number) => request(`/files/${fileId}/versions/${ver}/restore`, { method: "POST" });
const apiGetJobs = (jobId: string) => request(`/jobs/${jobId}`);

// ---- 新增 API ----
const apiNewFile = (title: string, folderId: number | null) =>
  request("/files/new", { method: "POST", body: JSON.stringify({ title, folderId }) });
const apiGetContent = (id: string) => request(`/files/${id}/content`);
const apiSaveContent = (id: string, content: string, baseline?: string) =>
  request(`/files/${id}/content`, { method: "POST", body: JSON.stringify(baseline === undefined ? { content } : { content, baseline }) });
const apiRebindSource = (id: string, sourcePath: string) =>
  request(`/${id}/rebind-source`, { method: "POST", body: JSON.stringify({ sourcePath }) });
const apiFolderRebindSource = (id: number, sourceDir: string) =>
  request(`/folders/${id}/rebind-source`, { method: "POST", body: JSON.stringify({ sourceDir }) });
const apiFolderSync = (id: number) => request(`/folders/${id}/sync`, { method: "POST" });
const apiShelve = (id: string) => request(`/${id}/shelve`, { method: "POST" });
const apiPendingChanges = () => request("/pending-changes");

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

// ---------- MD <-> HTML 富文本转换（所见即所得编辑器） ----------
let _td: TurndownService | null = null;
function mdToHtml(md: string): string {
  const html = marked.parse(String(md || ""), { breaks: true }) as string;
  return DOMPurify.sanitize(html);
}
function htmlToMd(html: string): string {
  if (!_td) {
    _td = new TurndownService({
      headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-",
      emDelimiter: "*", strongDelimiter: "**",
    });
    // 删除线：del/s/strike → ~~文本~~（默认会丢）
    _td.addRule("strikethrough", {
      filter: ["del", "s", "strike"],
      replacement: (content: string) => "~~" + content + "~~",
    });
    // 任务列表：li 含 checkbox → "- [x] / - [ ] "（默认会降级为普通列表，丢勾选态）
    _td.addRule("taskListItem", {
      filter: (node: any) => node.nodeName === "LI" && !!node.querySelector("input[type=checkbox]"),
      replacement: (content: string, node: any) => {
        const checked = !!node.querySelector("input[type=checkbox]")?.checked;
        return (checked ? "- [x] " : "- [ ] ") + content.trim() + "\n";
      },
    });
    // 表格：保留 HTML（富文本往返不丢结构，避免降级成纯文本）
    _td.keep(["table", "thead", "tbody", "tfoot", "tr", "th", "td"]);
  }
  return _td.turndown(html);
}

// 格式工具栏小按钮
function ToolBtn({ label, title, onClick, active }: { label: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{
      padding: "2px 9px", fontSize: 12, lineHeight: "20px", border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: "var(--dsw-radius-sm)", background: active ? "var(--dsw-alias-bg-layer-2)" : "transparent",
      color: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-primary)", cursor: "pointer",
    }}>{label}</button>
  );
}

// 竖向完整工具栏的文字按钮（段落左侧"更多"展开后使用）
function VertBtn({ label, title, onClick, active }: { label: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "none", cursor: "pointer",
      borderRadius: "var(--dsw-radius-sm)", fontSize: 12, textAlign: "left", whiteSpace: "nowrap",
      background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
      color: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-primary)",
    }}>{label}</button>
  );
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
interface Toast { id: number; type: "error" | "success" | "info"; msg: string; leaving?: boolean; }
function ToastStack({ toasts }: { toasts: Toast[] }) {
  // portal 至 body：DSH 宿主 webview 容器可能存在 transform/contain 祖先，
  // 直接 position:fixed 会被按祖先定位导致 toast 显示在页面内而非屏幕右下角。
  return createPortal(
    <div style={{
      position: "fixed", bottom: 16, right: 16, zIndex: 10002,
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 320,
      pointerEvents: "none",
    }}>
      <style>{`@keyframes dsw-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dsw-toast { animation: dsw-toast-in 160ms ease-out; }
        @media (prefers-reduced-motion: reduce) { .dsw-toast { animation: none; } }`}</style>
      {toasts.map((t) => (
        <div key={t.id} className="dsw-toast" style={{
          padding: "10px 14px", borderRadius: "var(--dsw-radius-lg)",
          background: "var(--dsw-alias-toast-bg)",
          color: "var(--dsw-alias-toast-label)", fontSize: 12, lineHeight: 1.5,
          boxShadow: "var(--dsw-shadow-lv3)",
          display: "flex", gap: 8, alignItems: "flex-start",
          pointerEvents: "auto",
          opacity: t.leaving ? 0 : 1,
          transition: "opacity 300ms ease-out",
        }}>
          <span style={{
            flexShrink: 0, fontWeight: 700, fontSize: 12, lineHeight: "16px",
            color: t.type === "error" ? "var(--dsw-alias-state-error-primary)"
              : t.type === "success" ? "var(--dsw-alias-state-success-primary)"
              : "var(--dsw-alias-state-warn-label)",
          }}>{t.type === "error" ? "✕" : t.type === "success" ? "✓" : "ℹ"}</span>
          <span style={{ flex: 1 }}>{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body
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
              color: "var(--dsw-alias-label-primary-foreground)", fontSize: 12, cursor: exhausted ? "not-allowed" : "pointer",
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
  rowType: "folder" | "doc" | "placeholder";
  depth: number;
  id: number;        // folder.id 或 doc.fileId（placeholder 为 -folderId）
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
function collectFolderIds(nodes: TreeNode[] | undefined, out: Set<number>): Set<number> {
  (nodes || []).forEach((n) => { if (n.type === "folder") { out.add(n.id!); collectFolderIds(n.children, out); } });
  return out;
}
// 收集某文件夹的全部子孙文件夹 id（用于拖拽防循环校验）
function subtreeFolderIds(nodes: TreeNode[] | undefined, id: number, out: Set<number>): Set<number> {
  for (const n of (nodes || [])) {
    if (n.type === "folder") {
      if (n.id === id) { collectFolderIds(n.children, out); return out; }
      subtreeFolderIds(n.children, id, out);
    }
  }
  return out;
}
// 查找某文件所在的文件夹链（返回祖先 folder id 数组，根为 []）
function findDocFolderPath(nodes: TreeNode[] | undefined, fileId: number, trail: number[]): number[] | null {
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

const ROW_H = 32;

interface WikiSidebarProps {
  wide?: boolean;
  expandSidebar?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
}

function statusStyle(status: WikiDoc["status"]) {
  if (status === "error") return { label: "异常", color: "var(--dsw-alias-state-error-primary)" };
  if (status === "stale") return { label: "待同步", color: "var(--dsw-alias-state-warn-primary)" };
  return { label: "已索引", color: "var(--dsw-alias-state-success-primary)" };
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
  const [view, setView] = useState<"list" | "editor" | "settings" | "versions" | "logs">("list");
  const [mdContent, setMdContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [selToolbar, setSelToolbar] = useState<{ x: number; y: number; bottom: number } | null>(null);
  const selToolbarTimer = useRef<number | null>(null);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // 段落左侧样式标签（悬停段落时显示）+ 点击"更多"展开的竖向完整工具栏
  const [paraBar, setParaBar] = useState<{ x: number; y: number; label: string } | null>(null);
  const [vertBar, setVertBar] = useState<{ x: number; y: number } | null>(null);
  // Tiptap 富文本内核：StarterKit + Link + Table；onUpdate 同步回 MD、选区驱动浮动工具栏
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Underline,
      TaskList.configure({ nested: true }),
      // 兼容 marked GFM 输出的任务列表（li 直接含 checkbox，无 label 包装）
      TaskItem.configure({ nested: true }).extend({
        parseHTML() {
          return [
            { tag: 'li[data-type="taskItem"]', priority: 60 },
            { tag: 'li > label > input[type="checkbox"]', priority: 50 },
            { tag: 'li > input[type="checkbox"]', priority: 40, getAttrs: (el: any) => ({ checked: !!el.querySelector("input[type=checkbox]")?.checked }) },
          ];
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    onUpdate: ({ editor }) => setMdContent(htmlToMd(editor.getHTML())),
    // 选中文字松开后，在选区上方显示横向格式工具栏（无选中自动隐藏）；
    // 拖动选字过程中防抖 120ms，避免工具栏跟着光标闪烁
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (selToolbarTimer.current != null) { clearTimeout(selToolbarTimer.current); selToolbarTimer.current = null; }
      if (empty || from === to) { setSelToolbar(null); setLinkInputOpen(false); return; }
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      const pos = { x: (a.left + b.left) / 2, y: a.top, bottom: a.bottom };
      selToolbarTimer.current = window.setTimeout(() => setSelToolbar(pos), 120);
    },
    editorProps: { attributes: { class: "dsh-wiki-editor", style: "outline: none;" } },
  });
  // 导入入口：原生文件/文件夹选择器 + 网页 URL 对话框（不再使用右侧常驻导入面板）
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDialog, setUrlDialog] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "doc" | "folder"; id: string | number } | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "stale" | "error">("all");
  const [searchResults, setSearchResults] = useState<WikiDoc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  // 搜索历史（localStorage 最近 10 条）
  const [searchHistory, setSearchHistory] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("dsh-wiki-rag:searchHistory") || "[]"); } catch { return []; } });
  const [historyOpen, setHistoryOpen] = useState(false);
  const pushHistory = useCallback((term: string) => {
    const v = term.trim();
    if (!v) return;
    setSearchHistory((prev) => {
      const next = [v, ...prev.filter((x) => x !== v)].slice(0, 10);
      try { localStorage.setItem("dsh-wiki-rag:searchHistory", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [stats, setStats] = useState<{ total: number; ready: number; stale: number; byType: Record<string, number> }>({ total: 0, ready: 0, stale: 0, byType: {} });
  // 历史版本：当前查看文件 + 版本列表 + 版本内容预览（每文件最多保留 3 个版本）
  const [verFileId, setVerFileId] = useState<string | null>(null);
  const [versions, setVersions] = useState<{ version: number; create_time: number }[]>([]);
  const [verPreview, setVerPreview] = useState<{ title: string; old: string; new: string } | null>(null);
  const [logs, setLogs] = useState<{ time: string; action: string; detail: string }[]>([]);
  const [diffModal, setDiffModal] = useState<{ old: string; new: string; title: string; fileId?: string; newText?: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onYes: () => void } | null>(null);
  // 未保存离开守卫：切换 view / 文档时若有改动，先弹确认
  const [leaveGuard, setLeaveGuard] = useState<{ action: () => void } | null>(null);
  const [scrollToFolderId, setScrollToFolderId] = useState<number | null>(null);
  const [scrollToFileId, setScrollToFileId] = useState<number | null>(null);
  // 拖拽导入悬停遮罩
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  // 文件树行交互：hover 行（显操作按钮/缩进引导线高亮）、拖拽落点、定位 flash
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [hoverRowDepth, setHoverRowDepth] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | string | null>(null);
  const [flashRowKey, setFlashRowKey] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const draggedFolderId = useRef<number | null>(null);
  // 最近打开 + 收藏（localStorage 持久化）
  const [favs, setFavs] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem("dsh-wiki-rag:favs") || "[]")); } catch { return new Set(); } });
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("dsh-wiki-rag:recent") || "[]"); } catch { return []; } });
  // 最近编辑时间戳（保存成功时写入），用于最近区按时间排序置顶
  const [editTimes, setEditTimes] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem("dsh-wiki-rag:editTimes") || "{}"); } catch { return {}; } });
  const markEdited = useCallback((id: string) => {
    setEditTimes((prev) => {
      const next = { ...prev, [id]: Date.now() };
      try { localStorage.setItem("dsh-wiki-rag:editTimes", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [showFavs, setShowFavs] = useState(true);
  const [showRecent, setShowRecent] = useState(false);
  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { localStorage.setItem("dsh-wiki-rag:favs", JSON.stringify([...n])); } catch {}
      return n;
    });
  };
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [settings, setSettings] = useState<Partial<SettingsState>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offline, setOffline] = useState(false);
  // 新增：待确认变更 / 重绑定源路径（文件级 + 文件夹级）
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);
  const [rebindState, setRebindState] = useState<{ fileId: string; value: string } | null>(null);
  const [folderRebindState, setFolderRebindState] = useState<{ folderId: number; value: string } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  // 按 fileId 记住编辑区滚动位置
  const editorScrollMap = useRef<Map<string, number>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  const searchInflight = useRef(false);
  const searchTimer = useRef<number | null>(null);
  const importInflight = useRef(false);
  const toastId = useRef(0);
  const baselineRef = useRef<string>("");

  // ---------- Toast ----------
  // 相同 (type, msg) 在 1500ms 内去重：request 5xx 自动 notify 与业务 catch 里的
  // notify 会重复弹出同一条错误，收敛为一条。
  const lastToast = useRef<{ key: string; at: number } | null>(null);
  const toastTimers = useRef<number[]>([]);
  const notify = useCallback((type: Toast["type"], msg: string) => {
    const key = type + "\u0001" + msg;
    const now = Date.now();
    if (lastToast.current && lastToast.current.key === key && now - lastToast.current.at < 1500) return;
    lastToast.current = { key, at: now };
    const id = ++toastId.current;
    // 堆叠上限 3 条：新 toast 挤掉最旧的（保留最近 2 条 + 新条 = 3）
    setToasts((prev) => [...prev.slice(-2), { id, type, msg }]);
    // 3.2s 后开始淡出，300ms 淡出过渡结束后再从 DOM 移除
    toastTimers.current.push(window.setTimeout(() => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 3200));
    toastTimers.current.push(window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500));
  }, []);

  useEffect(() => { bindNotifiers(notify, setOffline); }, [notify]);

  // ---------- 数据加载 ----------
  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [l, tr, s, lg] = await Promise.all([
        apiList().catch(() => SAMPLE_DOCS),
        apiTree().catch(() => []),
        request("/stats").catch(() => ({ total: 0, ready: 0, stale: 0, byType: {} })),
        request("/logs").catch(() => []),
      ]);
      setDocs(l);
      setTree(tr);
      setStats(s);
      setLogs(lg || []);
    } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // ---------- 加载设置 ----------
  useEffect(() => {
    (async () => {
      try {
        const s = await apiGetSettings();
        if (s) setSettings(s);
      } catch { /* offline, keep defaults */ }
      finally { setSettingsLoaded(true); }
    })();
  }, []);

  // ---------- 轮询 pending-changes（每 5 秒） ----------
  const pollPending = useCallback(async () => {
    try {
      const list = await apiPendingChanges();
      setPendingChanges(list || []);
      // 自动弹出未暂存的变更
      const firstUnshelved = (list || []).find((c: any) => !c.shelved);
      if (firstUnshelved && !diffModal) {
        setDiffModal({
          old: firstUnshelved.oldText || "",
          new: firstUnshelved.newText || "",
          title: firstUnshelved.fileName || "",
          fileId: String(firstUnshelved.fileId),
          newText: firstUnshelved.newText || "",
        });
      }
    } catch { /* ignore */ }
  }, [diffModal]);

  useEffect(() => {
    const t = setInterval(pollPending, 5000);
    return () => clearInterval(t);
  }, [pollPending]);

  // ---------- 快捷键 Ctrl+S 保存 / Ctrl+F、Ctrl+P、/ 聚焦搜索 / Esc 分层关闭 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (view === "editor") saveEdit();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "p")) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ae = document.activeElement as HTMLElement | null;
        const tag = ae?.tagName;
        const editable = tag === "INPUT" || tag === "TEXTAREA" || (!!ae && ae.isContentEditable);
        if (!editable) { e.preventDefault(); searchInputRef.current?.focus(); }
      } else if (e.key === "Escape") {
        // 分层关闭：弹窗 → 菜单 → 搜索面板；重命名/URL 输入框自身已有 Esc
        if (diffModal) setDiffModal(null);
        else if (verPreview) setVerPreview(null);
        else if (confirmState) setConfirmState(null);
        else if (urlDialog) { setUrlDialog(false); setUrlInput(""); }
        else if (rebindState) setRebindState(null);
        else if (folderRebindState) setFolderRebindState(null);
        else if (contextMenu) setContextMenu(null);
        else if (showMore) setShowMore(false);
        else if (showPlus) setShowPlus(false);
        else if (searchingMode) { setQ(""); setSearchResults(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeId, diffModal, verPreview, confirmState, urlDialog, rebindState, folderRebindState, contextMenu, showMore, showPlus, searchingMode]);



  // ---------- 导入（async 任务 + 进度条） ----------
  const jobTimers = useRef<number[]>([]);
  const scrollRaf = useRef<number | null>(null);
  // 卸载统一清理：轮询 interval、toast 移除定时器、搜索/选区/flash 防抖窗口、滚动 rAF
  useEffect(() => () => {
    jobTimers.current.forEach((t) => clearInterval(t));
    toastTimers.current.forEach((t) => clearTimeout(t));
    if (searchTimer.current != null) clearTimeout(searchTimer.current);
    if (selToolbarTimer.current != null) clearTimeout(selToolbarTimer.current);
    if (flashTimer.current != null) clearTimeout(flashTimer.current);
    if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
  }, []);

  const pollJob = useCallback((jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const j = await apiGetJobs(jobId);
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer);
          if (j.status === "done") { notify("success", tt(t, "wiki.importDone")); refreshList(); }
          else notify("error", j.error || "导入失败");
          setTimeout(() => setJob(null), 1500);
        }
      } catch { /* ignore poll error */ }
    }, 700);
    jobTimers.current.push(timer);
  }, [notify, refreshList, t]);

  // 批量导入：轮询全部 jobId，按真实结果聚合 成功/失败/跳过，失败列文件名+原因
  const pollJobsBatch = useCallback((items: { jobId: string; name: string }[], skipCount = 0) => {
    if (!items.length) {
      if (skipCount > 0) notify("info", `导入完成：跳过 ${skipCount} 个（不支持的类型）`);
      return;
    }
    let settled = 0;
    let ok = 0, fail = 0;
    const failures: string[] = [];
    setJob({ jobId: items.map((i) => i.jobId).join(","), phase: "import", done: 0, total: items.length, message: "", status: "running" });
    items.forEach(({ jobId, name }) => {
      const timer = setInterval(async () => {
        try {
          const j = await apiGetJobs(jobId);
          if (j.status === "done" || j.status === "error") {
            clearInterval(timer);
            settled++;
            if (j.status === "done") ok++;
            else { fail++; failures.push(`${name}：${j.error || "导入失败"}`); }
            setJob((prev) => prev ? { ...prev, done: settled } : prev);
            if (settled === items.length) {
              setTimeout(() => setJob(null), 1500);
              const skipMsg = skipCount ? `，跳过 ${skipCount}` : "";
              if (!fail) notify("success", `${tt(t, "wiki.importDone")}：成功 ${ok}${skipMsg}`);
              else notify("error", `导入完成：成功 ${ok}，失败 ${fail}${skipMsg}（${failures.slice(0, 3).join("；")}${fail > 3 ? " 等" : ""}）`);
              refreshList();
            }
          }
        } catch { /* ignore */ }
      }, 700);
      jobTimers.current.push(timer);
    });
  }, [notify, refreshList, t]);

  // 导入文件夹（原生文件夹选择器 webkitdirectory 选中后调用）
  const doImportFolder = async (source: string) => {
    if (!source || importInflight.current) return;
    importInflight.current = true;
    try {
      const res = await request("/import", { method: "POST", body: JSON.stringify({ source, kind: "folder", async: true }) });
      if (res && res.jobId) { setJob({ jobId: res.jobId, phase: "import", done: 0, total: 0, message: "", status: "running" }); pollJob(res.jobId); }
      notify("success", tt(t, "wiki.importSubmitting").replace("{n}", "1"));
      refreshList();
    } catch (e: any) {
      if (e?.offline) notify("error", tt(t, "wiki.offline"));
      else notify("error", e?.message || "导入失败");
    } finally { importInflight.current = false; }
  };

  // 导入网页（URL 对话框提交）
  const doImportUrl = async () => {
    const src = urlInput.trim();
    if (!src) return;
    setUrlDialog(false); setUrlInput("");
    if (importInflight.current) return;
    importInflight.current = true;
    try {
      const res = await request("/import", { method: "POST", body: JSON.stringify({ source: src, kind: "url", async: true }) });
      if (res && res.jobId) { setJob({ jobId: res.jobId, phase: "import", done: 0, total: 0, message: "", status: "running" }); pollJob(res.jobId); }
      notify("success", tt(t, "wiki.importSubmitting").replace("{n}", "1"));
      refreshList();
    } catch (e: any) {
      if (e?.offline) notify("error", tt(t, "wiki.offline"));
      else notify("error", e?.message || "导入失败");
    } finally { importInflight.current = false; }
  };

  // 拖拽系统文件/原生文件选择器 → 直接导入（可指定目标文件夹与类型）
  const importSystemFiles = async (paths: string[], folderId: number | null = null, kind: "file" | "folder" = "file") => {
    if (!paths.length) return;
    if (importInflight.current) return;
    importInflight.current = true;
    try {
      const jobs = await Promise.all(
        paths.map((src) => request("/import", { method: "POST", body: JSON.stringify({ source: src, kind, async: true, folderId }) }))
      );
      const items = jobs.map((j: any, i: number) => (j && j.jobId ? { jobId: j.jobId, name: paths[i]?.split("/").pop() || `文件 ${i + 1}` } : null)).filter(Boolean) as { jobId: string; name: string }[];
      pollJobsBatch(items);
      notify("success", tt(t, "wiki.importSubmitting").replace("{n}", String(paths.length)));
      refreshList();
    } catch (e: any) {
      if (e?.offline) notify("error", tt(t, "wiki.offline"));
      else notify("error", e?.message || "导入失败");
    } finally { importInflight.current = false; }
  };

  // ---------- 按内容上传导入（植入式面板拿不到 File.path 时走此通道，浏览器安全允许读所选文件内容） ----------
  const toBase64 = (buf: Uint8Array): string => {
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode(...buf.subarray(i, i + CH));
    return btoa(s);
  };
  const importFilesContent = async (files: File[], folderId: number | null = null): Promise<void> => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const over = list.filter((f) => f.size > 10 * 1024 * 1024);
    const okList = list.filter((f) => f.size <= 10 * 1024 * 1024);
    if (over.length) notify("error", `${over.length} 个文件超过 10MB 已跳过：${over.slice(0, 3).map((f) => f.name).join("、")}`);
    if (!okList.length) return;
    importInflight.current = true;
    const pending: { jobId: string; name: string }[] = [];
    let skipCount = 0;
    const CONC = 4;
    let idx = 0;
    const worker = async () => {
      while (idx < okList.length) {
        const f = okList[idx++];
        try {
          const b64 = toBase64(new Uint8Array(await f.arrayBuffer()));
          const r = await request("/import", { method: "POST", body: JSON.stringify({ fileName: f.name, content: b64, kind: "upload", async: true, folderId }) });
          if (r?.jobId) pending.push({ jobId: r.jobId, name: f.name });
          else if (r?.skipped) skipCount++;
        } catch { skipCount++; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, okList.length) }, () => worker()));
    importInflight.current = false;
    // 轮询全部 jobId，按真实结果聚合
    pollJobsBatch(pending, skipCount);
  };

  // 文件夹内容上传：还原顶层目录（找/建同名文件夹后平铺导入）
  const importFolderContent = async (files: File[]) => {
    const rel = (files[0] as any)?.webkitRelativePath || "";
    const topName = rel.split("/")[0] || "导入文件夹";
    let folderId: number | null = null;
    try {
      const existing = rows.find((r: any) => r.kind === "folder" && r.title === topName && r.parentId == null);
      if (existing) { folderId = Number(existing.id); }
      else {
        const r = await apiCreateFolder(topName, null);
        folderId = r?.id ?? null;
      }
      if (folderId != null) setExpandedFolders((prev) => { const n = new Set(prev); n.add(folderId); return n; });
    } catch { /* 建文件夹失败则平铺到根目录 */ }
    await importFilesContent(files, folderId);
  };

  // ---------- 删除（DSH 风格确认弹窗） ----------
  const doDelete = (id: string) => {
    setConfirmState({
      message: tt(t, "wiki.confirmDeleteDoc"),
      onYes: async () => {
        try {
          await apiDelete(id);
          notify("success", tt(t, "wiki.deleted"));
          refreshList();
        } catch (e: any) { notify("error", e?.message || "删除失败"); }
      },
    });
  };

  // ---------- 搜索（序号丢弃过期响应，防抖自动触发） ----------
  const searchSeq = useRef(0);
  const doSearch = useCallback(async (query?: string) => {
    const qq = (query ?? q).trim();
    if (!qq) { setSearchResults(null); setActiveResultIdx(0); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const hits = await apiSearch(qq);
      if (seq !== searchSeq.current) return; // 已有更新的查询，丢弃过期响应
      pushHistory(qq);
      setSearchResults(hits.map((r: any, i: number) => ({
        id: String(r.fileId ?? i),
        fileId: r.fileId as number | undefined,
        title: r.title || r.fileName || `结果 ${i + 1}`,
        type: "MD" as const,
        status: "ready" as const,
        summary: r.content?.slice(0, 160) || "",
        sourcePath: r.sourcePath || "",
        fileName: r.fileName || "",
        score: r.score,
        chunkIndex: r.chunkIndex,
      })));
      setActiveResultIdx(0);
    } catch (e: any) {
      if (seq !== searchSeq.current) return;
      if (e?.offline) notify("error", tt(t, "wiki.offline"));
      else notify("error", e?.message || "搜索失败");
      setSearchResults([]);
    } finally { if (seq === searchSeq.current) setSearching(false); }
  }, [q, notify, t]);

  // 打开搜索结果：展开父级链 + 滚动定位 + flash，延迟 800ms 再清面板
  const openSearchResult = useCallback((r: WikiDoc) => {
    const fId = r.fileId;
    if (fId != null) {
      const path = findDocFolderPath(tree, fId, []);
      if (path) setExpandedFolders((prev) => { const n = new Set(prev); path.forEach((p) => n.add(p)); return n; });
      setScrollToFileId(fId);
      openDoc(String(fId));
    } else {
      setActiveId(r.id); setMdContent(r.summary);
    }
    window.setTimeout(() => { setSearchResults(null); setQ(""); }, 800);
  }, [tree, openDoc]);

  // 搜索结果键盘导航：↑↓ 移动、Enter 打开、Esc 清空退出
  useEffect(() => {
    if (!searchingMode || !searchResults || !searchResults.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveResultIdx((i) => Math.min(searchResults.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveResultIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const r = searchResults[activeResultIdx]; if (r) openSearchResult(r); }
      else if (e.key === "Escape") { e.preventDefault(); setQ(""); setSearchResults(null); searchInputRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchingMode, searchResults, activeResultIdx, openSearchResult]);

  // ---------- 重命名文档 ----------
  const doRenameDoc = async (id: string) => {
    if (!renameText.trim()) return;
    try { await apiRename(id, renameText.trim()); notify("success", tt(t, "wiki.renamed")); }
    catch (e: any) { notify("error", e?.message || "重命名失败"); }
    setRenamingId(null); setRenameText(""); refreshList();
  };

  // ---------- 文件夹操作 ----------
  // 新建文件夹：直接创建默认名并进入名称编辑态（不再先弹窗输入确认）
  const doCreateFolder = async (parentId: number | null = null) => {
    try {
      const r = await apiCreateFolder("新文件夹", parentId);
      if (r?.id) {
        if (parentId != null) setExpandedFolders((prev) => { const n = new Set(prev); n.add(parentId); return n; });
        setScrollToFolderId(r.id);
        setRenamingId(r.id); setRenameText(""); // 自动进入名称编辑
        notify("success", tt(t, "wiki.folderCreated"));
      }
    } catch (e: any) { notify("error", e?.message || "创建失败"); }
    refreshList();
  };
  const doRenameFolder = async (id: number) => {
    if (!renameText.trim()) return;
    try { await apiRenameFolder(id, renameText.trim()); notify("success", tt(t, "wiki.renamed")); }
    catch (e: any) { notify("error", e?.message || "重命名失败"); }
    setRenamingId(null); setRenameText(""); refreshList();
  };
  const doDeleteFolder = (id: number) => {
    setConfirmState({
      message: tt(t, "wiki.confirmDeleteFolder"),
      onYes: async () => {
        try { await apiDeleteFolder(id); notify("success", tt(t, "wiki.folderDeleted")); }
        catch (e: any) { notify("error", e?.message || "删除失败"); }
        refreshList();
      },
    });
  };
  const doMoveDoc = async (fileId: string, folderId: number | null) => {
    try { await apiMoveFile(fileId, folderId); notify("success", tt(t, "wiki.moved")); refreshList(); }
    catch (e: any) { notify("error", e?.message || "移动失败"); }
  };
  const doMoveFolder = async (id: number, targetParentId: number | null) => {
    if (id === targetParentId) return; // 拖到自身，忽略
    // 防循环：target 不能是 id 的子孙文件夹
    if (targetParentId != null && subtreeFolderIds(tree, id, new Set()).has(targetParentId)) {
      notify("info", tt(t, "wiki.cannotMoveIntoSelf"));
      return;
    }
    try { await apiMoveFolder(id, targetParentId); notify("success", tt(t, "wiki.moved")); refreshList(); }
    catch (e: any) { notify("error", e?.message || "移动失败"); }
  };

  // ---------- 保存设置（POST /settings） ----------
  const saveSettings = async () => {
    try {
      const res = await apiSaveSettings(settings);
      if (res?.settings) setSettings(res.settings);
      notify("success", tt(t, "wiki.saved"));
    } catch (e: any) { notify("error", e?.message || "保存失败"); }
    setView("list");
  };

  // ---------- 保存编辑（真实写回 API，带冲突检测） ----------
  const saveEdit = useCallback(async () => {
    if (!activeId) return;
    const finalMd = editor ? htmlToMd(editor.getHTML()) : mdContent;
    try {
      await apiSaveContent(activeId, finalMd, baselineRef.current);
      baselineRef.current = finalMd;
      setMdContent(finalMd);
      setSavedContent(finalMd);
      markEdited(activeId);
      notify("success", tt(t, "wiki.contentSaved"));
      refreshList();
    } catch (e: any) {
      if (e?.status === 409) {
        const disk = (e?.diskContent as string) || "";
        const overwrite = window.confirm("该文件在外部被修改过。\n\n点“确定”覆盖外部修改；点“取消”放弃本地编辑并重新加载外部版本。");
        if (overwrite) {
          try {
            // 不带 baseline → 强制覆盖保存
            await apiSaveContent(activeId, finalMd);
            baselineRef.current = finalMd;
            setMdContent(finalMd);
            setSavedContent(finalMd);
            notify("success", tt(t, "wiki.contentSaved"));
            refreshList();
          } catch (e2: any) { notify("error", e2?.message || "保存失败"); }
        } else {
          baselineRef.current = disk;
          setMdContent(disk);
          setSavedContent(disk);
          if (editor) editor.commands.setContent(mdToHtml(disk));
          notify("info", "已重新加载外部版本，本地编辑已放弃");
        }
        return;
      }
      notify("error", e?.message || "保存失败");
    }
  }, [activeId, mdContent, editor, notify, refreshList, t]);

  // ---------- 编辑器自动保存（防抖 900ms，静默；遇外部冲突不弹窗打断） ----------
  useEffect(() => {
    if (!activeId || mdContent === savedContent) return;
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const final = await apiSaveContent(activeId, mdContent, savedContent);
        baselineRef.current = final;
        setSavedContent(final);
        setSaveState("saved");
        markEdited(activeId);
      } catch (e: any) {
        setSaveState("error");
        if (e?.status === 409) {
          // 自动保存不打断编辑：提示有外部修改，交手动“保存”按钮处理
          notify("info", tt(t, "wiki.autoSaveConflict"));
        } else {
          notify("error", e?.message || tt(t, "wiki.autoSaveFailed"));
        }
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [activeId, mdContent, savedContent, notify, t]);

  // 切换文档 / 从其他 view 返回编辑态时恢复编辑区滚动位置
  useEffect(() => {
    if (view !== "editor" || !activeId || !editor || !editorScrollRef.current) return;
    const target = editorScrollMap.current.get(activeId) || 0;
    // 等待内容渲染后恢复
    const raf = requestAnimationFrame(() => { if (editorScrollRef.current) editorScrollRef.current.scrollTop = target; });
    return () => cancelAnimationFrame(raf);
  }, [view, activeId, editor, mdContent]);

  // ---------- 加载文档真实内容 ----------
  const openDoc = useCallback(async (id: string) => {
    setRecent((prev) => {
      const n = [id, ...prev.filter((x) => x !== id)].slice(0, 10);
      try { localStorage.setItem("dsh-wiki-rag:recent", JSON.stringify(n)); } catch {}
      return n;
    });
    setActiveId(id);
    setView("editor");
    setMdContent("");
    setSavedContent("");
    try {
      const r = await apiGetContent(id);
      const c = r?.content || "";
      baselineRef.current = c;
      setMdContent(c);
      setSavedContent(c);
      if (editor) editor.commands.setContent(mdToHtml(c));
    } catch (e: any) {
      const c = e?.offline ? (SAMPLE_MD[id] || "# 离线\n\n无法加载内容") : "# 加载失败\n\n" + (e?.message || "");
      baselineRef.current = c;
      setMdContent(c); setSavedContent(c);
      if (editor) editor.commands.setContent(mdToHtml(c));
    }
  }, [editor]);

  // 未保存离开守卫：编辑态有改动时先弹确认（保存并离开 / 放弃 / 取消）
  const requestLeave = useCallback((action: () => void) => {
    if (view === "editor" && activeId && mdContent !== savedContent) setLeaveGuard({ action });
    else action();
  }, [view, activeId, mdContent, savedContent]);

  const doSaveThenLeave = async () => {
    const action = leaveGuard?.action;
    setLeaveGuard(null);
    try { await saveEdit(); } catch {}
    action?.();
  };

  // ---------- 导出 Markdown：a[download]+Blob，受限则复制内容兜底 ----------
  const exportDoc = useCallback(async (id: string) => {
    const doc = docs.find((d) => d.id === id);
    let content = id === activeId ? mdContent : "";
    if (!content) {
      try { const r = await apiGetContent(id); content = r?.content || ""; } catch { content = ""; }
    }
    const base = (doc?.fileName || doc?.title || "document").replace(/\.(md|txt)$/i, "");
    try {
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = base + ".md";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("success", tt(t, "wiki.exported"));
    } catch {
      try { await navigator.clipboard.writeText(content); notify("success", tt(t, "wiki.copiedContent")); }
      catch (e: any) { notify("error", e?.message || "导出失败"); }
    }
  }, [docs, activeId, mdContent, notify]);

  // ---------- 新建文档（空白 MD，人工创作链路） ----------
  // 新建文档：直接创建空白文档并进入名称编辑态（不再先弹窗输入标题）
  const doNewDoc = async () => {
    try {
      const r = await apiNewFile("新文档", null);
      refreshList();
      notify("success", tt(t, "wiki.created"));
      if (r && r.fileId) {
        openDoc(String(r.fileId));
        setRenamingId(String(r.fileId)); setRenameText(""); // 自动进入名称编辑
      }
    } catch (e: any) { notify("error", e?.message || "创建失败"); }
  };

  // ---------- 重新绑定源路径 ----------
  const doRebindSource = async () => {
    if (!rebindState) return;
    try {
      await apiRebindSource(rebindState.fileId, rebindState.value.trim());
      notify("success", tt(t, "wiki.saved"));
      refreshList();
    } catch (e: any) { notify("error", e?.message || "绑定失败"); }
    setRebindState(null);
  };

  // ---------- 文件夹批量同步 ----------
  const doFolderSync = async (folderId: number) => {
    try {
      const r = await apiFolderSync(folderId);
      if (r && Array.isArray(r.needsConfirm) && r.needsConfirm.length) {
        // 逐条弹出 Diff 确认
        r.needsConfirm.forEach((nc: any, i: number) => {
          setTimeout(() => {
            setDiffModal({
              old: nc.diff?.oldText || "",
              new: nc.diff?.newText || "",
              title: nc.fileName || "",
              fileId: String(nc.fileId),
              newText: nc.diff?.newText || "",
            });
          }, i * 100);
        });
      } else {
        notify("success", `同步完成：${r?.synced || 0}/${r?.total || 0}`);
      }
      refreshList();
    } catch (e: any) { notify("error", e?.message || "同步失败"); }
  };

  // ---------- 文件夹重新选择源文件夹 ----------
  const doFolderRebindSource = async () => {
    if (!folderRebindState) return;
    const dir = folderRebindState.value.trim();
    if (!dir) { notify("error", tt(t, "wiki.rebindSourcePrompt")); return; }
    try {
      const r = await apiFolderRebindSource(folderRebindState.folderId, dir);
      notify("success", `${tt(t, "wiki.folderRebound")}：${r?.count || 0} 个文件`);
      refreshList();
    } catch (e: any) { notify("error", e?.message || "重选源失败"); }
    setFolderRebindState(null);
  };

  // ---------- 暂存变更 ----------
  const doShelve = async (fileId: string) => {
    try {
      await apiShelve(fileId);
      notify("success", tt(t, "wiki.shelved"));
      setDiffModal(null);
      pollPending();
    } catch (e: any) { notify("error", e?.message || "暂存失败"); }
  };

  // ---------- 历史版本：加载列表 ----------
  const loadVersions = async (fileId: string) => {
    setVerFileId(fileId);
    setVersions([]);
    try {
      const r = await apiFetchVersions(fileId);
      setVersions(r?.versions || []);
    } catch (e: any) { notify("error", e?.message || "加载版本失败"); }
  };

  // ---------- 历史版本：查看内容（只读，与当前内容行级 diff） ----------
  const doViewVersion = async (fileId: string, ver: number) => {
    try {
      const r = await apiGetVersion(fileId, ver);
      const doc = docs.find((d) => d.id === fileId);
      // 当前内容：打开的文档直接用 mdContent，否则拉取
      let current = "";
      if (fileId === activeId) current = mdContent;
      else { try { const c = await apiGetContent(fileId); current = c?.content || ""; } catch {} }
      setVerPreview({ title: `${doc?.fileName || "文档"} · ${new Date(ver).toLocaleString()}`, old: r?.content || "", new: current });
    } catch (e: any) { notify("error", e?.message || "加载版本内容失败"); }
  };

  // ---------- 历史版本：恢复 ----------
  const doRestoreVersion = async (fileId: string, ver: number) => {
    try {
      await apiRestoreVersion(fileId, ver);
      notify("success", tt(t, "wiki.restored"));
      setVerPreview(null);
      loadVersions(fileId);
      refreshList();
    } catch (e: any) { notify("error", e?.message || "恢复失败"); }
  };

  const title = tt(t, "wiki.title");

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

  // 每个文件夹的直接子文档数（角标用）
  const folderDocCounts: Record<number, number> = useMemo(() => {
    const out: Record<number, number> = {};
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children) {
          out[n.id] = n.children.filter((c) => !c.children).length;
          walk(n.children);
        }
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  // ---------- 树扁平化为虚拟滚动行（展开的空文件夹追加占位行） ----------
  const rows: FlatRow[] = useMemo(() => {
    const base: FlatRow[] = [];
    flattenTree(tree, 0, expandedFolders, base);
    const out: FlatRow[] = [];
    for (const r of base) {
      out.push(r);
      if (r.rowType === "folder" && expandedFolders.has(r.id) && (!r.raw.children || r.raw.children.length === 0)) {
        out.push({ rowType: "placeholder", depth: r.depth + 1, id: -r.id, title: "", raw: r.raw });
      }
    }
    return out;
  }, [tree, expandedFolders]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - 2);
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + 2);
  const visibleRows = rows.slice(startIndex, endIndex);

  // 新建文件夹后滚动定位到新行
  useEffect(() => {
    if (scrollToFolderId == null) return;
    const idx = rows.findIndex((r) => r.rowType === "folder" && r.id === scrollToFolderId);
    if (idx >= 0 && listScrollRef.current) {
      listScrollRef.current.scrollTop = Math.max(0, idx * ROW_H - viewportH / 2);
      setScrollToFolderId(null);
      triggerFlash("f" + rows[idx].id);
    }
  }, [rows, scrollToFolderId, viewportH]);

  // 搜索「定位到树」后滚动到对应文件行
  useEffect(() => {
    if (scrollToFileId == null) return;
    const idx = rows.findIndex((r) => r.rowType === "doc" && r.id === scrollToFileId);
    if (idx >= 0 && listScrollRef.current) {
      listScrollRef.current.scrollTop = Math.max(0, idx * ROW_H - viewportH / 2);
      setScrollToFileId(null);
      triggerFlash("d" + rows[idx].id);
    }
  }, [rows, scrollToFileId, viewportH]);

  // 定位 flash：600ms 后清除高亮
  const triggerFlash = (key: string) => {
    setFlashRowKey(key);
    if (flashTimer.current != null) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashRowKey(null), 650);
  };

  // 树全展开 / 全折叠
  const toggleTreeExpand = useCallback(() => {
    if (treeExpanded) setExpandedFolders(new Set());
    else setExpandedFolders(collectFolderIds(tree, new Set()));
    setTreeExpanded(!treeExpanded);
  }, [treeExpanded, tree]);

  // 点击编辑区/外部任意处关闭浮动格式工具栏与段落工具栏（工具栏自身用 stopPropagation 拦截）
  useEffect(() => {
    const close = () => { setSelToolbar(null); setParaBar(null); setVertBar(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // 段落左侧样式标签：悬停段落时显示"当前样式 + 更多"；鼠标移出延迟隐藏（留出点到"更多"的时间）
  const hoverRaf = useRef<number | null>(null);
  const paraHideTimer = useRef<number | null>(null);
  const clearParaTimer = () => { if (paraHideTimer.current != null) { clearTimeout(paraHideTimer.current); paraHideTimer.current = null; } };
  const paraLeave = () => {
    clearParaTimer();
    paraHideTimer.current = window.setTimeout(() => { setParaBar(null); setVertBar(null); }, 220);
  };
  const blockLabel = (node: any): string => {
    if (node.type.name === "heading") return `标题 ${node.attrs.level}`;
    if (node.type.name === "bulletList") return "无序列表";
    if (node.type.name === "orderedList") return "有序列表";
    if (node.type.name === "taskList") return "任务列表";
    if (node.type.name === "blockquote") return "引用";
    if (node.type.name === "codeBlock") return "代码块";
    return "正文";
  };
  const onEditorHover = (e: React.MouseEvent) => {
    if (!editor) { setParaBar(null); return; }
    if (hoverRaf.current != null) return;
    hoverRaf.current = requestAnimationFrame(() => {
      hoverRaf.current = null;
      const pos = editor!.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (pos == null) { setParaBar(null); return; }
      const $p = editor!.state.doc.resolve(pos.pos);
      const depth = Math.max(0, $p.depth);
      if (depth === 0) { setParaBar(null); return; }
      const blockStart = $p.before(depth);
      const node = $p.node(depth);
      if (!node || node.type.name === "doc") { setParaBar(null); return; }
      const coords = editor!.view.coordsAtPos(blockStart);
      setParaBar({ x: coords.left, y: coords.top + coords.height / 2, label: blockLabel(node) });
      clearParaTimer();
    });
  };

  const searchingMode = searchResults !== null;
  const isEmpty = rows.length === 0 && !loadingList && docs.length === 0;

  return (
    <div style={fullscreen ? { ...rootStyle, position: "fixed", inset: 0, zIndex: 10050, background: "var(--dsw-alias-bg-base)" } : { ...rootStyle, position: "relative" }}
      onDragEnter={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); dragDepth.current++; setDragOver(true); } }}
      onDragOver={(e) => { if (e.dataTransfer?.files?.length) e.preventDefault(); }}
      onDragLeave={(e) => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } }}
      onDrop={(e) => {
        dragDepth.current = 0; setDragOver(false);
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) {
          e.preventDefault();
          const withPath = files.filter((f) => (f as any).path);
          const noPath = files.filter((f) => !(f as any).path);
          if (withPath.length) importSystemFiles(withPath.map((f) => (f as any).path));
          if (noPath.length) importFilesContent(noPath);
        }
      }}>
      <style>{`@keyframes dsw-indeterminate { 0% { left: -30%; } 100% { left: 100%; } }`}</style>
      {/* 拖拽悬停提示遮罩 */}
      {dragOver && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--dsw-alias-bg-mask-2)", border: "2px dashed var(--dsw-alias-state-business-primary)", borderRadius: "var(--dsw-radius-lg)", color: "var(--dsw-alias-state-business-primary)", fontSize: 14, fontWeight: 600, pointerEvents: "none", transition: "opacity 150ms ease" }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
          {tt(t, "wiki.dropImport")}
        </div>
      )}
      {/* Toast */}
      <ToastStack toasts={toasts} />

      {/* 离线贯穿警告条 */}
      {offline && (
        <div style={{
          padding: "6px 12px", borderRadius: "var(--dsw-radius-sm)", fontSize: 12, marginBottom: 6,
          background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-label)",
        }}>{tt(t, "wiki.offline")} — 数据仅本地缓存</div>
      )}

      {/* 批量任务进度条（total 未知时 indeterminate 滑动，可取消） */}
      {job && (
        <div style={{ padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 12 }}>{job.message || (tt(t, "wiki.importing"))}</div>
            <button title={tt(t, "wiki.cancel")} onClick={() => setJob(null)} style={{ ...iconBtn, fontSize: 12 }}>✕</button>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-layer-2)", overflow: "hidden", position: "relative" }}>
            {job.total ? (
              <div style={{
                height: "100%", width: `${Math.min(100, (job.done / job.total) * 100)}%`,
                background: "var(--dsw-alias-state-business-primary)", transition: "width 0.3s ease",
              }} />
            ) : (
              <div style={{
                position: "absolute", top: 0, bottom: 0, width: "30%", borderRadius: 3,
                background: "var(--dsw-alias-state-business-primary)",
                animation: "dsw-indeterminate 1.2s ease-in-out infinite",
              }} />
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }}>{job.done} / {job.total || "…"}</div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0" }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <WikiIcon size={16} />{title}
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {/* 待确认变更徽标 */}
          {pendingChanges.filter((c: any) => !c.shelved).length > 0 && (
            <button
              onClick={pollPending}
              title={tt(t, "wiki.pendingChanges")}
              style={{
                ...headerBtn, position: "relative", width: 26, height: 26,
                background: "var(--dsw-alias-state-warn-primary)", color: "var(--dsw-alias-label-primary-foreground)",
                fontSize: 11, fontWeight: 700,
              }}>
              {pendingChanges.filter((c: any) => !c.shelved).length}
            </button>
          )}
          {/* 主操作已收敛到搜索框旁的 + 菜单（新建文档/新建文件夹/导入文件/导入文件夹/导入网页） */}
          {/* 全屏 / 退出全屏 */}
          <button title={fullscreen ? tt(t, "wiki.exitFullscreen") : tt(t, "wiki.fullscreen")}
            onClick={() => setFullscreen(!fullscreen)} style={headerBtn}>
            {fullscreen ? (
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}>
                <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}>
                <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
          {/* 更多 ⋯：快照 / 日志 / 设置 */}
          <div style={{ position: "relative" }}>
            <button title={tt(t, "wiki.more")} onClick={() => setShowMore(!showMore)} style={headerBtn}>⋯</button>
            {showMore && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setShowMore(false)} />
                <div style={{ position: "absolute", right: 0, top: 26, zIndex: 10001, background: "var(--dsw-alias-bg-layer-1)", borderRadius: "var(--dsw-radius-md)", border: "1px solid var(--dsw-alias-border-l4)", padding: 4, minWidth: 110, boxShadow: "var(--dsw-shadow-lv2)" }}>
                  <div onClick={() => { requestLeave(() => { setView("versions"); }); setShowMore(false); }} style={menuItem}>{tt(t, "wiki.versions")}</div>
                  <div onClick={() => { requestLeave(() => { setView("logs"); }); setShowMore(false); }} style={menuItem}>{tt(t, "wiki.logs")}</div>
                  <div onClick={() => { requestLeave(() => { setView("settings"); }); setShowMore(false); }} style={menuItem}>{tt(t, "wiki.settings")}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 左右分栏主区域 */}
      <div style={mainLayoutStyle}>
        {/* 左侧：文件树（全屏时加宽，缓解左右失衡） */}
        <div style={fullscreen ? { ...sidebarStyle, width: 340 } : sidebarStyle}>
          {/* 最近打开 + 收藏快捷区 */}
          {(recent.length > 0 || favs.size > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
              {favs.size > 0 && (
                <>
                  <div onClick={() => setShowFavs(!showFavs)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: "var(--dsw-alias-label-secondary)", padding: "2px 6px", fontWeight: 600 }}>
                    <span>{showFavs ? "▾" : "▸"}</span><span style={{ color: "var(--dsw-alias-state-warn-primary)" }}>★</span> {tt(t, "wiki.favSection")} ({favs.size})
                  </div>
                  {showFavs && [...favs].map((fid) => {
                    const d = docs.find((x) => x.id === fid);
                    return d ? (
                      <div key={fid} onClick={() => openDoc(fid)} title={d.fileName || d.title}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                          height: 28, paddingLeft: 12, fontSize: 12, borderRadius: "var(--dsw-radius-sm)",
                          color: "var(--dsw-alias-label-primary)",
                          background: d.id === activeId ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                        }}>
                        <FileIcon size={12} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.fileName || d.title}</span>
                      </div>
                    ) : null;
                  })}
                  {showFavs && favs.size === 0 && (
                    <div style={{ padding: "4px 6px 4px 18px", fontSize: 11, color: "var(--dsw-alias-label-caption)" }}>★ {tt(t, "wiki.noFavHint")}</div>
                  )}
                </>
              )}
              {recent.length > 0 && (
                <>
                  <div onClick={() => setShowRecent(!showRecent)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: "var(--dsw-alias-label-secondary)", padding: "2px 6px", fontWeight: 600 }}>
                    <span>{showRecent ? "▾" : "▸"}</span> {tt(t, "wiki.recentSection")}
                  </div>
                  {showRecent && [...recent].sort((a, b) => (editTimes[b] || 0) - (editTimes[a] || 0)).map((fid) => {
                    const d = docs.find((x) => x.id === fid);
                    return d ? (
                      <div key={fid} onClick={() => openDoc(fid)} title={d.fileName || d.title}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                          height: 28, paddingLeft: 12, fontSize: 12, borderRadius: "var(--dsw-radius-sm)",
                          color: "var(--dsw-alias-label-primary)",
                          background: d.id === activeId ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                        }}>
                        <FileIcon size={12} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.fileName || d.title}</span>
                      </div>
                    ) : null;
                  })}
                  {showRecent && recent.length === 0 && (
                    <div style={{ padding: "4px 6px 4px 18px", fontSize: 11, color: "var(--dsw-alias-label-caption)" }}>🕘 {tt(t, "wiki.noRecentHint")}</div>
                  )}
                </>
              )}
            </div>
          )}
          {/* 搜索框 + 加号主操作菜单 */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-label-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 8, pointerEvents: "none" }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input ref={searchInputRef}
                value={q}
                onFocus={() => setHistoryOpen(true)}
                onBlur={() => setTimeout(() => setHistoryOpen(false), 150)}
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  if (!v.trim()) { setSearchResults(null); setActiveResultIdx(0); return; }
                  searchTimer.current = window.setTimeout(() => doSearch(v), 280);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") { if (searchTimer.current) clearTimeout(searchTimer.current); doSearch(q); } }}
                placeholder={tt(t, "wiki.search")}
                style={{ ...searchInputStyle, flex: 1, paddingLeft: 28 }} />
              {historyOpen && !q.trim() && searchHistory.length > 0 && (
                <div style={{ position: "absolute", top: 34, left: 0, right: 0, zIndex: 10001, background: "var(--dsw-alias-bg-layer-1)", borderRadius: "var(--dsw-radius-md)", border: "1px solid var(--dsw-alias-border-l4)", boxShadow: "var(--dsw-shadow-lv2)", padding: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 6px", fontSize: 10, color: "var(--dsw-alias-label-tertiary)" }}>
                    <span>{tt(t, "wiki.searchHistory")}</span>
                    <button style={{ border: "none", background: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary)", fontSize: 10 }}
                      onClick={() => { setSearchHistory([]); try { localStorage.removeItem("dsh-wiki-rag:searchHistory"); } catch {} }}>{tt(t, "wiki.clear")}</button>
                  </div>
                  {searchHistory.map((h) => (
                    <div key={h} onMouseDown={() => { setQ(h); doSearch(h); setHistoryOpen(false); searchInputRef.current?.blur(); }}
                      style={{ padding: "4px 8px", fontSize: 12, cursor: "pointer", borderRadius: "var(--dsw-radius-sm)", color: "var(--dsw-alias-label-primary)" }}>🕘 {h}</div>
                  ))}
                </div>
              )}
            </div>
            {searchingMode && (
              <button title={tt(t, "wiki.cancel")} onClick={() => { setQ(""); setSearchResults(null); setActiveResultIdx(0); }} style={iconBtn}>✕</button>
            )}
            {/* + 主操作菜单：新建文档 / 新建文件夹 / 导入文件 / 导入文件夹 / 导入网页 */}
            <div style={{ position: "relative" }}>
              <button title={tt(t, "wiki.create")} onClick={() => setShowPlus(!showPlus)} style={headerBtn}>＋</button>
              {showPlus && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setShowPlus(false)} />
                  <div style={{ position: "absolute", left: 0, top: 26, zIndex: 10001, background: "var(--dsw-alias-bg-layer-1)", borderRadius: "var(--dsw-radius-md)", border: "1px solid var(--dsw-alias-border-l4)", padding: 4, minWidth: 110, boxShadow: "var(--dsw-shadow-lv2)" }}>
                    <div onClick={() => { setShowPlus(false); doNewDoc(); }} style={menuItem}>{tt(t, "wiki.newDoc")}</div>
                    <div onClick={() => { setShowPlus(false); doCreateFolder(null); }} style={menuItem}>{tt(t, "wiki.newFolder")}</div>
                    <div onClick={() => { setShowPlus(false); fileInputRef.current?.click(); }} style={menuItem}>{tt(t, "wiki.importFile")}</div>
                    <div onClick={() => { setShowPlus(false); folderInputRef.current?.click(); }} style={menuItem}>{tt(t, "wiki.importFolder")}</div>
                    <div onClick={() => { setShowPlus(false); setUrlDialog(true); }} style={menuItem}>{tt(t, "wiki.importWeb")}</div>
                  </div>
                </>
              )}
            </div>
            {/* 原生文件/文件夹选择器（点菜单项触发，选中即导入；有 File.path 走路径通道，否则内容上传） */}
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const withPath = files.filter((f) => (f as any).path);
                const noPath = files.filter((f) => !(f as any).path);
                if (withPath.length) importSystemFiles(withPath.map((f) => (f as any).path));
                if (noPath.length) importFilesContent(noPath);
                e.target.value = "";
              }} />
            <input ref={folderInputRef} type="file" multiple webkitdirectory style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const f0 = files[0] as any;
                if (!f0) return;
                const rel = f0.webkitRelativePath || "";
                const full = f0.path || "";
                if (full && rel) {
                  const source = full.slice(0, full.length - rel.length - 1);
                  if (source) doImportFolder(source);
                  else importFolderContent(files);
                } else if (full) {
                  doImportFolder(full);
                } else {
                  // 无路径环境：还原顶层目录 + 内容上传
                  importFolderContent(files);
                }
                e.target.value = "";
              }} />
          </div>

          {/* 状态筛选（pill 风格，窄栏自动换行防挤压） */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {([["all", "全部"], ["ready", "已索引"], ["stale", "待同步"], ["error", "异常"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} style={{
                padding: "3px 10px", border: "none", cursor: "pointer", borderRadius: "var(--dsw-radius-sm)", fontSize: 11,
                background: statusFilter === key ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                color: statusFilter === key ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                fontWeight: statusFilter === key ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* 文件列表区 */}
          <div ref={listScrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              // rAF 合并滚动事件，避免滚动期间每帧重复 setState
              if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
              scrollRaf.current = requestAnimationFrame(() => { setScrollTop(el.scrollTop); setViewportH(el.clientHeight); });
            }}
            style={{ flex: 1, overflowY: "auto", position: "relative", minHeight: 0 }}>
            {loadingList ? (
              <SkeletonRows count={8} />
            ) : searchingMode ? (
              searching ? <SkeletonRows count={5} /> :
                searchResults!.length === 0 ? (
                  <div style={{ padding: "24px 10px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)" }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>未找到「{q}」</div>
                    <div style={{ fontSize: 11 }}>试试更短的关键词，或检查拼写</div>
                  </div>
                ) :
                  searchResults!.map((r, i) => {
                    const fId = r.fileId;
                    const trail = fId != null ? findDocFolderPath(tree, fId, []) : null;
                    const crumb = trail && trail.length ? trail.map((fid) => treeFindName(tree, fid)).filter(Boolean).join(" / ") : "";
                    const hl = (text: string) => {
                      if (!q.trim()) return text;
                      const idx = text.toLowerCase().indexOf(q.trim().toLowerCase());
                      if (idx < 0) return text;
                      return (<>{text.slice(0, idx)}<mark style={{ background: "var(--dsw-specific-bubble-highlight)", color: "inherit", padding: "0 2px", borderRadius: 2 }}>{text.slice(idx, idx + q.trim().length)}</mark>{text.slice(idx + q.trim().length)}</>);
                    };
                    return (
                    <div key={i} onClick={() => openSearchResult(r)}
                      onMouseEnter={() => setActiveResultIdx(i)}
                      style={{
                        padding: "8px 10px", borderRadius: "var(--dsw-radius-sm)", cursor: "pointer", marginBottom: 4,
                        background: i === activeResultIdx ? "var(--dsw-specific-sidebar-nav-item-active)" : "var(--dsw-alias-bg-layer-1)",
                        border: "1px solid var(--dsw-alias-border-l4)",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                        <span style={{
                          fontSize: 10, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                          background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)",
                        }}>{r.fileName || "MD"}</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{hl(r.summary)}</div>
                      {crumb && <div style={{ marginTop: 4, fontSize: 10, color: "var(--dsw-alias-label-caption)" }}>📁 {crumb}</div>}
                    </div>
                  );
                  })
            ) : rows.length === 0 ? (
              <div style={emptyHint}>{tt(t, "wiki.empty")}</div>
            ) : (
              <>
              {/* 根目录落点：拖文档/文件夹到此移回根目录 */}
              <div
                onDragEnter={(e) => { e.preventDefault(); setDropTargetId("__root__"); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDropTargetId((p) => (p === "__root__" ? null : p))}
                onDrop={(e) => {
                  e.preventDefault(); setDropTargetId(null);
                  const fid = e.dataTransfer.getData("text/doc-id");
                  const fld = e.dataTransfer.getData("text/folder-id");
                  if (fid) doMoveDoc(fid, null);
                  else if (fld) doMoveFolder(Number(fld), null);
                }}
                style={{
                  height: 28, display: "flex", alignItems: "center", gap: 6, paddingLeft: 12, fontSize: 12, fontWeight: 600,
                  borderRadius: "var(--dsw-radius-sm)", cursor: "pointer",
                  color: "var(--dsw-alias-label-secondary)",
                  background: dropTargetId === "__root__" ? "var(--dsw-specific-sidebar-nav-item-active-accent)" : "transparent",
                }}>
                <FolderIcon size={13} />{tt(t, "wiki.rootAll")}
              </div>
              <div style={{ height: rows.length * ROW_H, position: "relative" }}>
                {visibleRows.map((row, vi) => {
                  const top = (startIndex + vi) * ROW_H;
                  const rowKey = row.rowType === "folder" ? "f" + row.id : row.rowType === "doc" ? "d" + row.id : "ph" + row.id;
                  const rowHovered = hoveredRowKey === rowKey;
                  // 缩进引导线：每个祖先深度一条 1px 竖线，hover 行时祖先链提亮
                  const guides: any[] = [];
                  if (row.rowType !== "placeholder") {
                    for (let k = 0; k <= row.depth; k++) {
                      guides.push(
                        <span key={"g" + k} style={{
                          position: "absolute", left: 4 + k * 16, top: 0, bottom: 0, width: 1,
                          background: hoverRowDepth != null && k <= hoverRowDepth ? "var(--dsw-alias-border-l3)" : "var(--dsw-alias-border-l1)",
                        }} />
                      );
                    }
                  }
                  if (row.rowType === "placeholder") {
                    return (
                      <div key={rowKey} style={{
                        position: "absolute", top, left: 0, right: 0, height: ROW_H,
                        paddingLeft: 12 + row.depth * 16, display: "flex", alignItems: "center",
                        fontSize: 11, fontStyle: "italic", color: "var(--dsw-alias-label-caption)",
                      }}>{tt(t, "wiki.emptyFolder")}</div>
                    );
                  }
                  if (row.rowType === "folder") {
                    const open = expandedFolders.has(row.id);
                    const isDropTarget = dropTargetId === row.id;
                    const dangerDrop = draggedFolderId.current != null && subtreeFolderIds(tree, draggedFolderId.current, new Set()).has(row.id);
                    return (
                      <div key={rowKey}
                        draggable
                        onDragStart={(e) => { draggedFolderId.current = row.id; e.dataTransfer.setData("text/folder-id", String(row.id)); }}
                        onDragEnd={() => { draggedFolderId.current = null; setDropTargetId(null); }}
                        onDragEnter={(e) => { e.preventDefault(); setDropTargetId(row.id); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragLeave={() => setDropTargetId((p) => (p === row.id ? null : p))}
                        onDrop={(e) => {
                          e.preventDefault(); setDropTargetId(null);
                          const files = Array.from(e.dataTransfer?.files || []);
                          if (files.length) {
                            const paths = files.map((f) => (f as any).path || f.name).filter(Boolean);
                            if (paths.length) importSystemFiles(paths, row.id);
                            return;
                          }
                          const fid = e.dataTransfer.getData("text/doc-id");
                          const fld = e.dataTransfer.getData("text/folder-id");
                          if (fid) doMoveDoc(fid, row.id);
                          else if (fld && Number(fld) !== row.id) doMoveFolder(Number(fld), row.id);
                        }}
                        onClick={() => setExpandedFolders((prev) => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })}
                        onDoubleClick={() => { setRenamingId(row.id); setRenameText(row.title); }}
                        onMouseEnter={() => { setHoveredRowKey(rowKey); setHoverRowDepth(row.depth); }}
                        onMouseLeave={() => { setHoveredRowKey(null); setHoverRowDepth(null); }}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: row.id }); }}
                        style={{
                          position: "absolute", top, left: 0, right: 0, height: ROW_H,
                          paddingLeft: 12 + row.depth * 16, display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                          borderRadius: "var(--dsw-radius-sm)",
                          background: dangerDrop && isDropTarget ? "var(--dsw-alias-interactive-bg-hover-danger)"
                            : isDropTarget ? "var(--dsw-specific-sidebar-nav-item-active-accent)"
                            : rowHovered ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
                          transition: "background 120ms ease-out",
                        }}>
                        {guides}
                        <span style={{
                          display: "inline-flex", width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0,
                          transition: "transform 120ms ease-out", transform: open ? "rotate(90deg)" : "rotate(0deg)",
                          color: "var(--dsw-alias-label-tertiary)",
                        }}>
                          <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 2.5L6.5 5L3 7.5" /></svg>
                        </span>
                        <FolderIcon size={14} />
                        {renamingId === row.id ? (
                          <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") doRenameFolder(row.id); if (e.key === "Escape") { setRenamingId(null); setRenameText(""); } }}
                            onBlur={() => doRenameFolder(row.id)}
                            style={{ flex: 1, height: 20, padding: "0 4px", boxSizing: "border-box", borderRadius: 4, border: "1px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontSize: 13 }} />
                        ) : (
                          <span title={row.title} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>{row.title}</span>
                        )}
                        {(folderDocCounts[row.id] || 0) > 0 && (
                          <span style={{ fontSize: 10, color: "var(--dsw-alias-label-caption)", flexShrink: 0, opacity: rowHovered ? 0 : 1, transition: "opacity 120ms ease-out" }}>{folderDocCounts[row.id]}</span>
                        )}
                        <button title={tt(t, "wiki.more")}
                          onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setContextMenu({ x: Math.max(4, r.left), y: r.bottom + 2, kind: "folder", id: row.id }); }}
                          style={{ ...iconBtn, flexShrink: 0, fontSize: 14, width: 20, height: 20, opacity: rowHovered ? 0.9 : 0, transition: "opacity 120ms ease-out" }}>⋯</button>
                      </div>
                    );
                  }
                  const d: WikiDoc = { id: String(row.id), title: row.title, type: row.kind || "MD", status: (row.status as any) || "ready", summary: "" };
                  const st = statusStyle(d.status);
                  const active = d.id === activeId;
                  const flashing = flashRowKey === rowKey;
                  return (
                    <div key={rowKey}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/doc-id", d.id)}
                      onClick={() => { requestLeave(() => openDoc(d.id)); }}
                      onDoubleClick={() => { setRenamingId(d.id); setRenameText(row.title); }}
                      onMouseEnter={() => { setHoveredRowKey(rowKey); setHoverRowDepth(row.depth); }}
                      onMouseLeave={() => { setHoveredRowKey(null); setHoverRowDepth(null); }}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, kind: "doc", id: d.id }); }}
                      style={{
                        position: "absolute", top, left: 0, right: 0, height: ROW_H,
                        paddingLeft: 12 + row.depth * 16 + 16, display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                        borderRadius: "var(--dsw-radius-sm)",
                        background: flashing ? "var(--dsw-alias-interactive-bg-hover-accent)"
                          : active ? "var(--dsw-specific-sidebar-nav-item-active)"
                          : rowHovered ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
                        borderLeft: active ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                        transition: "background 120ms ease-out",
                      }}>
                      {guides}
                      <FileIcon size={13} />
                      {renamingId === d.id ? (
                        <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") doRenameDoc(d.id); if (e.key === "Escape") { setRenamingId(null); setRenameText(""); } }}
                          onBlur={() => doRenameDoc(d.id)}
                          style={{ flex: 1, height: 20, padding: "0 4px", boxSizing: "border-box", borderRadius: 4, border: "1px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontSize: 13 }} />
                      ) : (
                        <span title={row.title} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: active ? 600 : 450, color: "var(--dsw-alias-label-primary)" }}>{row.title}</span>
                      )}
                      <button title={favs.has(d.id) ? tt(t, "wiki.unfav") : tt(t, "wiki.fav")}
                        onClick={(e) => { e.stopPropagation(); toggleFav(d.id); }}
                        style={{ ...iconBtn, flexShrink: 0, fontSize: 13, width: 18, height: 18, opacity: rowHovered ? 0.9 : 0, color: favs.has(d.id) ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-tertiary)", transition: "opacity 120ms ease-out" }}>{favs.has(d.id) ? "★" : "☆"}</button>
                      {/* 状态点：正常(ready)不显示，仅异常/待同步显示 */}
                      {d.status !== "ready" && <span style={{ fontSize: 10, color: st.color }}>●</span>}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>

          {/* 底部统计 */}
          <div style={{ padding: "6px 2px 0", borderTop: "1px solid var(--dsw-alias-border-l1)", fontSize: 11, color: "var(--dsw-alias-label-tertiary)", display: "flex", flexDirection: "column", gap: 4 }}>
            <div>{t ? t("wiki.count", { n: stats.total || rows.length }) : `共 ${stats.total || rows.length} 条`}</div>
            {Object.keys(stats.byType || {}).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(stats.byType).map(([k, n]) => (
                  <span key={k} style={{ padding: "0 5px", borderRadius: 4, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)" }}>
                    {typeLabel(k)} {n}
                  </span>
                ))}
              </div>
            )}
            {/* 状态图例 */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 1 }}>
              <span><span style={{ color: "var(--dsw-alias-state-success-primary)" }}>●</span> {tt(t, "wiki.statusReady")}</span>
              <span><span style={{ color: "var(--dsw-alias-state-warn-primary)" }}>●</span> {tt(t, "wiki.statusStale")}</span>
              <span><span style={{ color: "var(--dsw-alias-state-error-primary)" }}>●</span> {tt(t, "wiki.statusError")}</span>
            </div>
          </div>
        </div>

        {/* 右侧：编辑器 */}
        <div style={editorStyle}>
          {view === "settings" ? (
            /* 设置面板 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{tt(t, "wiki.settings")}</span>
                <button onClick={() => setView("list")} style={iconBtn}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.storage")}</div>
                  <input value={settings.mdStoragePath || ""} onChange={(e) => setSettings({ ...settings, mdStoragePath: e.target.value })} style={smallInput} />
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.zipStorage")}</div>
                  <input value={settings.zipStoragePath || ""} onChange={(e) => setSettings({ ...settings, zipStoragePath: e.target.value })} style={smallInput} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.chunkSize")}</div>
                    <input type="number" value={settings.chunkSize || 500} onChange={(e) => setSettings({ ...settings, chunkSize: Number(e.target.value) })} style={smallInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.chunkOverlap")}</div>
                    <input type="number" value={settings.chunkOverlap || 80} onChange={(e) => setSettings({ ...settings, chunkOverlap: Number(e.target.value) })} style={smallInput} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.chunkMode")}</div>
                  <select value={settings.chunkMode || "fixed"}
                    onChange={(e) => setSettings({ ...settings, chunkMode: e.target.value as any })}
                    style={{ ...smallInput, height: 28 }}>
                    <option value="fixed">{tt(t, "chunkModeFixed")}</option>
                    <option value="heading">{tt(t, "chunkModeHeading")}</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.webMode")}</div>
                  <select value={settings.webMode || "intranet"}
                    onChange={(e) => setSettings({ ...settings, webMode: e.target.value as any })}
                    style={{ ...smallInput, height: 28 }}>
                    <option value="intranet">{tt(t, "webModeIntranet")}</option>
                    <option value="extranet">{tt(t, "webModeExtranet")}</option>
                  </select>
                </div>
                {/* 嵌入模型配置 */}
                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{tt(t, "wiki.embedModel")}</div>
                <select value={settings.embeddingProvider || "fallback"}
                  onChange={(e) => setSettings({ ...settings, embeddingProvider: e.target.value })}
                  style={{ ...smallInput, height: 28 }}>
                  <option value="fallback">{tt(t, "wiki.embedFallback")}</option>
                  <option value="local">{tt(t, "wiki.embedLocal")}</option>
                  <option value="openai">{tt(t, "wiki.embedOpenAI")}</option>
                </select>
                {(settings.embeddingProvider || "fallback") === "local" && (
                  <div>
                    <input placeholder={tt(t, "wiki.modelPath")} value={settings.embeddingModelPath || ""}
                      onChange={(e) => setSettings({ ...settings, embeddingModelPath: e.target.value })} style={smallInput} />
                  </div>
                )}
                {(settings.embeddingProvider || "fallback") === "openai" && (
                  <>
                    <input placeholder={tt(t, "wiki.openaiBaseURL")} value={settings.embeddingOpenAIBaseURL || ""}
                      onChange={(e) => setSettings({ ...settings, embeddingOpenAIBaseURL: e.target.value })} style={smallInput} />
                    <input placeholder={tt(t, "wiki.openaiAPIKey")} type="password" value={settings.embeddingOpenAIAPIKey || ""}
                      onChange={(e) => setSettings({ ...settings, embeddingOpenAIAPIKey: e.target.value })} style={smallInput} />
                    <input placeholder={tt(t, "wiki.openaiModel")} value={settings.embeddingOpenAIModel || ""}
                      onChange={(e) => setSettings({ ...settings, embeddingOpenAIModel: e.target.value })} style={smallInput} />
                  </>
                )}
                {/* 重排模型配置 */}
                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{tt(t, "wiki.rerankModel")}</div>
                <select value={settings.rerankProvider || "none"}
                  onChange={(e) => setSettings({ ...settings, rerankProvider: e.target.value })}
                  style={{ ...smallInput, height: 28 }}>
                  <option value="none">{tt(t, "wiki.rerankNone")}</option>
                  <option value="local">{tt(t, "wiki.embedLocal")}</option>
                  <option value="openai">{tt(t, "wiki.embedOpenAI")}</option>
                </select>
                {(settings.rerankProvider || "none") === "local" && (
                  <div>
                    <input placeholder={tt(t, "wiki.modelPath")} value={settings.rerankModelPath || ""}
                      onChange={(e) => setSettings({ ...settings, rerankModelPath: e.target.value })} style={smallInput} />
                  </div>
                )}
                {(settings.rerankProvider || "none") === "openai" && (
                  <>
                    <input placeholder={tt(t, "wiki.openaiBaseURL")} value={settings.rerankOpenAIBaseURL || ""}
                      onChange={(e) => setSettings({ ...settings, rerankOpenAIBaseURL: e.target.value })} style={smallInput} />
                    <input placeholder={tt(t, "wiki.openaiAPIKey")} type="password" value={settings.rerankOpenAIAPIKey || ""}
                      onChange={(e) => setSettings({ ...settings, rerankOpenAIAPIKey: e.target.value })} style={smallInput} />
                    <input placeholder={tt(t, "wiki.openaiModel")} value={settings.rerankOpenAIModel || ""}
                      onChange={(e) => setSettings({ ...settings, rerankOpenAIModel: e.target.value })} style={smallInput} />
                  </>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{tt(t, "wiki.rerankTopK")}</div>
                    <input type="number" value={settings.rerankTopK || 5} onChange={(e) => setSettings({ ...settings, rerankTopK: Number(e.target.value) })} style={smallInput} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{tt(t, "wiki.restartHint")}</div>
                <button onClick={saveSettings} style={primaryBtn}>{tt(t, "wiki.save")}</button>
              </div>
            </div>
          ) : view === "versions" ? (
            /* 历史版本面板：按文件查看最多 3 个历史版本，可查看内容 / 恢复 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{tt(t, "wiki.versions")}</span>
                <button onClick={() => setView("list")} style={iconBtn}>✕</button>
              </div>
              <select value={verFileId || ""}
                onChange={(e) => { if (e.target.value) loadVersions(e.target.value); }}
                style={{ ...smallInput, height: 28 }}>
                <option value="">{tt(t, "wiki.selectFile")}</option>
                {docs.map((d) => (<option key={d.id} value={d.id}>{d.fileName}</option>))}
              </select>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {!verFileId ? <div style={emptyHint}>{tt(t, "wiki.selectFileFirst")}</div> :
                  versions.length === 0 ? <div style={emptyHint}>{tt(t, "wiki.noVersions")}</div> :
                    versions.map((v) => (
                      <div key={v.version} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-2)" }}>
                        <span style={{ flex: 1, fontSize: 12 }}>{new Date(v.create_time || v.version).toLocaleString()}</span>
                        <button onClick={() => doViewVersion(verFileId, v.version)} style={ghostBtn}>{tt(t, "wiki.view")}</button>
                        <button onClick={() => doRestoreVersion(verFileId, v.version)} style={ghostBtn}>{tt(t, "wiki.restore")}</button>
                      </div>
                    ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>{tt(t, "wiki.versionsHint")}</div>
            </div>
          ) : view === "logs" ? (
            /* 日志面板 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{tt(t, "wiki.logs")}</span>
                <button onClick={() => setView("list")} style={iconBtn}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {logs.length === 0 ? <div style={emptyHint}>{tt(t, "wiki.noLogs")}</div> :
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
              {/* 标题 + 保存状态 + 保存按钮 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDoc.title}</span>
                <span style={typeBadge}>{typeLabel(activeDoc.type)}</span>
                <span style={{ fontSize: 11, color: saveState === "error" ? "var(--dsw-alias-state-error-primary)" : saveState === "saving" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-tertiary)" }}>
                  {saveState === "error" ? "保存失败" : saveState === "saving" ? "保存中…" : tt(t, "wiki.saved")}
                </span>
                <button onClick={saveEdit} disabled={mdContent === savedContent} style={{ ...primaryBtn, opacity: mdContent === savedContent ? 0.4 : 1, cursor: mdContent === savedContent ? "not-allowed" : "pointer" }}>
                  {tt(t, "wiki.save")}
                </button>
              </div>
              {/* Tiptap 富文本编辑区：ProseMirror 内核，所见即所得；超宽行长限 720px */}
              <div ref={editorScrollRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}
                onScroll={(e) => { if (activeId) editorScrollMap.current.set(activeId, e.currentTarget.scrollTop); }}
                onMouseMove={onEditorHover}
                onMouseLeave={paraLeave}>
                <style>{`.dsh-wiki-editor p { font-size: 14px; line-height: 1.7; margin: 4px 0; }
                  .dsh-wiki-editor h1 { font-size: 26px; font-weight: 700; line-height: 1.3; margin: 24px 0 12px; }
                  .dsh-wiki-editor h2 { font-size: 20px; font-weight: 600; line-height: 1.35; margin: 20px 0 8px; }
                  .dsh-wiki-editor h3 { font-size: 16px; font-weight: 600; margin: 16px 0 6px; }
                  .dsh-wiki-editor code { background: var(--dsw-alias-markdown-inline-code); padding: "1px 4px"; border-radius: var(--dsw-radius-xs); font-size: 12px; }
                  .dsh-wiki-editor pre { background: var(--dsw-alias-markdown-code-block); padding: 12px; border-radius: var(--dsw-radius-md); margin: 8px 0; }
                  .dsh-wiki-editor blockquote { border-left: 3px solid var(--dsw-alias-border-l4); padding-left: 12px; color: var(--dsw-alias-label-secondary); margin: 8px 0; }
                  .dsh-wiki-editor ::selection { background: var(--dsw-alias-bg-document-selection); }`}</style>
                <div style={{ maxWidth: 720, margin: "0 auto" }}>
                  <EditorContent editor={editor} />
                </div>
              </div>
              {/* 字数统计 */}
              <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)", padding: "4px 2px 0", borderTop: "1px solid var(--dsw-alias-border-l1)", display: "flex", gap: 12 }}>
                <span>{mdContent.length.toLocaleString()} {tt(t, "wiki.charCount")}</span>
              </div>
              {/* 浮动格式工具栏：选中文本松开后在选区上方弹出，无选中自动隐藏 */}
              {selToolbar && (() => {
                const clampedX = Math.max(80, Math.min(selToolbar.x, window.innerWidth - 80));
                const below = selToolbar.y < 60;
                const ty = below ? selToolbar.bottom + 6 : selToolbar.y - 40;
                return (
                <div style={{ position: "fixed", left: 0, top: 0, zIndex: 10002, display: "flex", gap: 2, padding: 4, flexWrap: "wrap", maxWidth: "min(560px, calc(100vw - 24px))",
                  transform: `translate(${clampedX}px, ${ty}px) translateX(-50%)`,
                  background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)",
                  borderRadius: "var(--dsw-radius-md)", boxShadow: "var(--dsw-shadow-lv3)" }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <ToolBtn label="B" title="粗体 (Ctrl+B)" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} />
                  <ToolBtn label="I" title="斜体 (Ctrl+I)" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} />
                  <ToolBtn label="U" title="下划线" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} />
                  <ToolBtn label="S" title="删除线" active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} />
                  <ToolBtn label="H1" title="一级标题" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
                  <ToolBtn label="H2" title="二级标题" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
                  <ToolBtn label="H3" title="三级标题" active={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
                  <ToolBtn label="•" title="无序列表" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
                  <ToolBtn label="1." title="有序列表" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
                  <ToolBtn label="☑" title="任务列表" active={editor?.isActive("taskList")} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
                  <ToolBtn label="❝" title="引用" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
                  <ToolBtn label="</>" title="代码块" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
                  <ToolBtn label="⇔" title="对齐（左/中/右 循环）" onClick={() => {
                    if (!editor) return;
                    if (editor.isActive({ textAlign: "center" })) editor.chain().focus().setTextAlign("right").run();
                    else if (editor.isActive({ textAlign: "right" })) editor.chain().focus().setTextAlign("left").run();
                    else editor.chain().focus().setTextAlign("center").run();
                  }} />
                  <ToolBtn label="—" title="分隔线" onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
                  <ToolBtn label="链接" title="插入链接" active={editor?.isActive("link")} onClick={() => { setLinkUrl(""); setLinkInputOpen((v) => !v); }} />
                  {linkInputOpen && (
                    <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { if (linkUrl.trim()) editor?.chain().focus().setLink({ href: linkUrl.trim() }).run(); setLinkInputOpen(false); }
                        else if (e.key === "Escape") { setLinkInputOpen(false); editor?.chain().focus().run(); }
                      }}
                      placeholder="https://…"
                      style={{ width: 180, height: 22, fontSize: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "var(--dsw-radius-xs)", padding: "0 6px", background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)" }} />
                  )}
                </div>
                );
              })()}
              {/* 段落左侧：悬停段落时显示当前样式 + 更多（点击"更多"展开竖向完整工具栏） */}
              {paraBar && (
                <div style={{ position: "fixed", left: 0, top: 0, zIndex: 10001, display: "flex", alignItems: "center", gap: 2, padding: "2px 4px",
                  transform: `translate(${Math.max(0, paraBar.x - 4)}px, ${paraBar.y}px) translate(-100%, -50%)`,
                  background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)",
                  borderRadius: "var(--dsw-radius-sm)", boxShadow: "var(--dsw-shadow-lv2)", fontSize: 11 }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseEnter={clearParaTimer} onMouseLeave={paraLeave}>
                  <span style={{ color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" }}>{paraBar.label}</span>
                  <button title="更多格式" onClick={() => setVertBar({ x: paraBar.x, y: paraBar.y })} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-primary)", padding: "0 3px", fontSize: 13, lineHeight: 1 }}>⋯</button>
                </div>
              )}
              {/* 竖向完整格式工具栏：点击段落左侧"更多"展开 */}
              {vertBar && (
                <div style={{ position: "fixed", left: 0, top: 0, zIndex: 10003, display: "flex", flexDirection: "column", gap: 1, padding: 4,
                  transform: `translate(${Math.max(0, vertBar.x - 4)}px, ${vertBar.y}px) translate(-100%, 0)`,
                  background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)",
                  borderRadius: "var(--dsw-radius-md)", boxShadow: "var(--dsw-shadow-lv3)" }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseEnter={clearParaTimer} onMouseLeave={paraLeave}>
                  <VertBtn label="正文" title="正文" active={editor?.isActive("paragraph")} onClick={() => editor?.chain().focus().setParagraph().run()} />
                  {[1, 2, 3, 4, 5, 6].map((l) => (
                    <VertBtn key={l} label={`标题 ${l}`} title={`标题 ${l}`} active={editor?.isActive("heading", { level: l })} onClick={() => editor?.chain().focus().toggleHeading({ level: l }).run()} />
                  ))}
                  <div style={{ height: 1, background: "var(--dsw-alias-border-l2)", margin: "3px 0" }} />
                  <VertBtn label="无序列表" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
                  <VertBtn label="有序列表" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
                  <VertBtn label="任务列表" active={editor?.isActive("taskList")} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
                  <VertBtn label="引用" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
                  <VertBtn label="代码块" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
                  <VertBtn label="分隔线" onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
                  <div style={{ height: 1, background: "var(--dsw-alias-border-l2)", margin: "3px 0" }} />
                  <VertBtn label="粗体" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} />
                  <VertBtn label="斜体" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} />
                  <VertBtn label="下划线" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} />
                  <VertBtn label="删除线" active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} />
                  <VertBtn label="链接" active={editor?.isActive("link")} onClick={() => {
                    if (!editor) return;
                    const url = window.prompt("链接地址 URL：");
                    if (url) editor.chain().focus().setLink({ href: url }).run();
                    else editor.chain().focus().unsetLink().run();
                  }} />
                  <div style={{ height: 1, background: "var(--dsw-alias-border-l2)", margin: "3px 0" }} />
                  <VertBtn label="左对齐" active={editor?.isActive({ textAlign: "left" })} onClick={() => editor?.chain().focus().setTextAlign("left").run()} />
                  <VertBtn label="居中" active={editor?.isActive({ textAlign: "center" })} onClick={() => editor?.chain().focus().setTextAlign("center").run()} />
                  <VertBtn label="右对齐" active={editor?.isActive({ textAlign: "right" })} onClick={() => editor?.chain().focus().setTextAlign("right").run()} />
                  <div style={{ height: 1, background: "var(--dsw-alias-border-l2)", margin: "3px 0" }} />
                  <VertBtn label="撤销" onClick={() => editor?.chain().focus().undo().run()} />
                  <VertBtn label="重做" onClick={() => editor?.chain().focus().redo().run()} />
                  <VertBtn label="复制" onClick={async () => {
                    if (!editor) return;
                    const sel = editor.state.selection;
                    const text = editor.state.doc.textBetween(sel.from, sel.to, " ");
                    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => {});
                  }} />
                  <VertBtn label="剪切" onClick={async () => {
                    if (!editor) return;
                    const sel = editor.state.selection;
                    const text = editor.state.doc.textBetween(sel.from, sel.to, " ");
                    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => {});
                    editor.chain().focus().deleteSelection().run();
                  }} />
                  <VertBtn label="删除" onClick={() => editor?.chain().focus().deleteSelection().run()} />
                </div>
              )}
            </>
          ) : (
            /* 空状态：引导 + 统计概览 */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
              <div style={{ color: "var(--dsw-alias-label-tertiary)" }}><WikiIcon size={48} /></div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{tt(t, "wiki.emptyTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--dsw-alias-label-tertiary)", textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                {tt(t, "wiki.emptyHint")}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => fileInputRef.current?.click()} style={primaryBtn}>{tt(t, "wiki.importFile")}</button>
                <button onClick={doNewDoc} style={ghostBtn}>{tt(t, "wiki.newDoc")}</button>
              </div>
              {stats.total > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 }}>
                  {Object.entries(stats.byType || {}).map(([k, n]) => (
                    <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)" }}>
                      {typeLabel(k)} × {n}
                    </span>
                  ))}
                </div>
              )}
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
            boxShadow: "var(--dsw-shadow-lv2)",
          }}>
            <div onClick={() => {
              setRenamingId(contextMenu.id);
              const cur = contextMenu.kind === "doc" ? docs.find((d) => d.id === String(contextMenu.id))?.title : treeFindName(tree, Number(contextMenu.id));
              setRenameText(cur || ""); setContextMenu(null);
            }} style={menuItem}>{tt(t, "wiki.rename")}</div>
            {contextMenu.kind === "folder" && (
              <div onClick={() => {
                doCreateFolder(Number(contextMenu.id));
                setContextMenu(null);
              }} style={menuItem}>{tt(t, "wiki.newSubFolder")}</div>
            )}
            {contextMenu.kind === "doc" && (
              <div onClick={async () => {
                const docId = String(contextMenu.id); setContextMenu(null);
                const outcome = await apiSyncFromSource(docId).catch(() => null);
                if (outcome && outcome.status === "needs-confirm" && outcome.diff) {
                  setDiffModal({ old: outcome.diff.oldText || "", new: outcome.diff.newText || "", title: `从源目录更新：${outcome.diff.fileName || ""}`, fileId: docId, newText: outcome.diff.newText || "" });
                } else {
                  setDiffModal({ old: "", new: outcome?.reason || "无可用更新", title: "从源目录更新" });
                }
              }} style={menuItem}>{tt(t, "wiki.update")}</div>
            )}
            {contextMenu.kind === "doc" && (
              <div onClick={() => {
                setRebindState({ fileId: String(contextMenu.id), value: "" });
                setContextMenu(null);
              }} style={menuItem}>{tt(t, "wiki.rebindSource")}</div>
            )}
            {contextMenu.kind === "doc" && (
              <div onClick={() => { exportDoc(String(contextMenu.id)); setContextMenu(null); }} style={menuItem}>{tt(t, "wiki.export")}</div>
            )}
            {contextMenu.kind === "folder" && (
              <div onClick={() => {
                const fid = Number(contextMenu.id); setContextMenu(null);
                doFolderSync(fid);
              }} style={menuItem}>{tt(t, "wiki.folderSync")}</div>
            )}
            {contextMenu.kind === "folder" && (
              <div onClick={() => {
                setFolderRebindState({ folderId: Number(contextMenu.id), value: "" });
                setContextMenu(null);
              }} style={menuItem}>{tt(t, "wiki.folderRebindSource")}</div>
            )}
            <div onClick={() => {
              if (contextMenu.kind === "doc") doDelete(String(contextMenu.id));
              else doDeleteFolder(Number(contextMenu.id));
              setContextMenu(null);
            }} style={{ ...menuItem, color: "var(--dsw-alias-state-error-primary)" }}>{tt(t, "wiki.delete")}</div>
          </div>
        </div>
      )}

      {/* Diff 三色确认弹窗 */}
      {diffModal && <DiffModalBox modal={diffModal} t={t} onClose={() => setDiffModal(null)} onAccept={async (ft, nt) => {
        try { await apiAcceptUpdate(ft, nt); refreshList(); notify("success", tt(t, "wiki.accepted")); }
        catch (e: any) { notify("error", e?.message || "接受失败"); }
        setDiffModal(null);
      }} onReject={async (ft) => {
        try { await apiDismiss(ft); notify("success", tt(t, "wiki.dismissed")); }
        catch (e: any) { notify("error", e?.message || "忽略失败"); }
        setDiffModal(null);
      }} onShelve={(ft) => doShelve(ft)} />}

      {/* 删除确认弹窗（DSH 风格） */}
      {confirmState && (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "min(90%, 420px)", background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{confirmState.message}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmState(null)} style={ghostBtn}>{tt(t, "wiki.cancel")}</button>
              <button onClick={() => { const cb = confirmState.onYes; setConfirmState(null); cb(); }}
                style={{ ...primaryBtn, background: "var(--dsw-alias-state-error-primary)" }}>{tt(t, "wiki.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 未保存离开确认：保存并离开 / 放弃修改 / 取消 */}
      {leaveGuard && (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "min(90%, 420px)", background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tt(t, "wiki.leaveUnsaved")}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => setLeaveGuard(null)} style={ghostBtn}>{tt(t, "wiki.cancel")}</button>
              <button onClick={() => { const a = leaveGuard.action; setLeaveGuard(null); a(); }} style={ghostBtn}>{tt(t, "wiki.discard")}</button>
              <button onClick={doSaveThenLeave} style={primaryBtn}>{tt(t, "wiki.saveAndLeave")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 历史版本 vs 当前内容：行级 diff（只读） */}
      {verPreview && (() => {
        const rows = computeDiff(verPreview.old, verPreview.new);
        const rowStyle: Record<string, any> = {
          add: { background: "var(--dsw-alias-code-diff-added)", color: "var(--dsw-alias-state-success-primary)" },
          del: { background: "var(--dsw-alias-code-diff-deleted)", color: "var(--dsw-alias-state-error-primary)" },
          mod: { background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-primary)" },
          ctx: { background: "transparent", color: "var(--dsw-alias-label-secondary)" },
        };
        return (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "92%", maxWidth: 720, background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", display: "flex", flexDirection: "column", gap: 0,
            maxHeight: "82vh", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{verPreview.title}</div>
              <button onClick={() => setVerPreview(null)} style={iconBtn}>✕</button>
            </div>
            <div style={{ padding: "6px 12px", background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-label)", fontSize: 12, borderRadius: "var(--dsw-radius-sm)", margin: "0 12px 8px" }}>
              历史版本 vs 当前内容 — 只读（绿=新增 红=删除 黄=修改）
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "0 0 12px", fontSize: 12, lineHeight: 1.6, fontFamily: "var(--dsw-font-family-mono, monospace)" }}>
              {rows.map((r, i) => {
                const s = rowStyle[r.type] || rowStyle.ctx;
                return (
                  <div key={i} style={{ padding: "1px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word", ...s }}>
                    <span style={{ opacity: 0.6, marginRight: 8 }}>{s.background === rowStyle.add.background ? "+" : s.background === rowStyle.del.background ? "-" : s.background === rowStyle.mod.background ? "~" : " "}</span>{r.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* 导入网页 URL 对话框 */}
      {urlDialog && (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "90%", maxWidth: 440, background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tt(t, "wiki.importWeb")}</div>
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doImportUrl(); }}
              placeholder="https://example.com/article" style={smallInput} autoFocus />
            <div style={{ fontSize: 10, color: "var(--dsw-alias-label-tertiary)" }}>
              {tt(t, "wiki.webModeHint")}：{settings.webMode === "extranet" ? tt(t, "webModeExtranet") : tt(t, "webModeIntranet")}（{tt(t, "wiki.webModeInSettings")}）
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setUrlDialog(false); setUrlInput(""); }} style={ghostBtn}>{tt(t, "wiki.cancel")}</button>
              <button onClick={doImportUrl} disabled={!urlInput.trim()} style={{ ...primaryBtn, opacity: urlInput.trim() ? 1 : 0.6 }}>{tt(t, "wiki.import")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 重绑定源路径对话框 */}
      {rebindState && (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "90%", maxWidth: 420, background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{tt(t, "wiki.rebindSource")}</div>
            <input autoFocus value={rebindState.value}
              onChange={(e) => setRebindState({ ...rebindState, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") doRebindSource(); if (e.key === "Escape") setRebindState(null); }}
              placeholder={tt(t, "wiki.rebindSourcePrompt")}
              style={{ ...smallInput, flex: "none" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRebindState(null)} style={ghostBtn}>{tt(t, "wiki.cancel")}</button>
              <button onClick={doRebindSource} style={primaryBtn}>{tt(t, "wiki.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 文件夹重新选择源对话框 */}
      {folderRebindState && (
        <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{
            width: "90%", maxWidth: 420, background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{tt(t, "wiki.folderRebindSource")}</div>
            <input autoFocus value={folderRebindState.value}
              onChange={(e) => setFolderRebindState({ ...folderRebindState, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") doFolderRebindSource(); if (e.key === "Escape") setFolderRebindState(null); }}
              placeholder={tt(t, "wiki.folderRebindSourcePrompt")}
              style={{ ...smallInput, flex: "none" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setFolderRebindState(null)} style={ghostBtn}>{tt(t, "wiki.cancel")}</button>
              <button onClick={doFolderRebindSource} style={primaryBtn}>{tt(t, "wiki.confirm")}</button>
            </div>
          </div>
        </div>
      )}
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
  background: "var(--dsw-alias-state-business-primary)", color: "var(--dsw-alias-label-primary-foreground)", fontSize: 12, cursor: "pointer",
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
  color: "var(--dsw-alias-label-primary)", fontSize: 13,
};
const smallInput: any = {
  flex: 1, height: 28, padding: "0 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)",
  border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-1)",
  color: "var(--dsw-alias-label-primary)", fontSize: 12,
};
const typeBadge: any = {
  fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)",
};
/** 文档类型中文标签（sheet 表示 Excel/CSV 表格文档） */
const TYPE_LABEL: Record<string, string> = {
  md: "MD", txt: "TXT", pdf: "PDF", docx: "DOCX", url: "网页", note: "笔记", sheet: "表格", pptx: "PPT",
};
function typeLabel(type: string): string {
  return TYPE_LABEL[type] || type || "";
}
const textareaStyle: any = {
  flex: 1, width: "100%", boxSizing: "border-box", resize: "none", padding: 10,
  borderRadius: "var(--dsw-radius-md)", border: "1px solid var(--dsw-alias-border-l4)",
  background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
  fontFamily: "var(--ds-font-family-code, monospace)", fontSize: 12, lineHeight: 1.6,
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
  onShelve?: (fileId: string) => void;
}) {
  const { modal, t, onClose, onAccept, onReject, onShelve } = props;
  const rows = computeDiff(modal.old, modal.new);
  const rowColor: Record<string, any> = {
    add: { background: "var(--dsw-alias-code-diff-added)", color: "var(--dsw-alias-state-success-primary)", sign: "+" },
    del: { background: "var(--dsw-alias-code-diff-deleted)", color: "var(--dsw-alias-state-error-primary)", sign: "-" },
    mod: { background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-primary)", sign: "~" },
    ctx: { background: "transparent", color: "var(--dsw-alias-label-secondary)", sign: " " },
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--dsw-alias-bg-mask-3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{
        width: "90%", maxWidth: 560, maxHeight: "80vh", background: "var(--dsw-alias-bg-layer-1)",
        borderRadius: "var(--dsw-radius-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{tt(t, "wiki.changeConfirm")}：{modal.title}</div>
        <div style={{ flex: 1, overflow: "auto", fontSize: 12, fontFamily: "var(--ds-font-family-code, monospace)", display: "flex", flexDirection: "column" }}>
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
          <button onClick={() => { if (modal.fileId && onShelve) onShelve(modal.fileId); else onClose(); }} style={ghostBtn}>{tt(t, "wiki.shelve")}</button>
          <button onClick={() => { if (modal.fileId) onReject(modal.fileId); else onClose(); }} style={ghostBtn}>{tt(t, "wiki.reject")}</button>
          <button onClick={() => { if (modal.fileId && modal.newText != null) onAccept(modal.fileId, modal.newText); else onClose(); }} style={primaryBtn}>{tt(t, "wiki.accept")}</button>
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
      "wiki.newDoc": "新建文档", "wiki.newDocTitle": "新文档标题…",
      "wiki.rebindSource": "重新绑定源路径", "wiki.rebindSourcePrompt": "输入新的源路径…",
      "wiki.folderSync": "从源文件夹批量同步",
      "wiki.folderRebindSource": "重新选择源文件夹", "wiki.folderRebindSourcePrompt": "输入新的源文件夹路径…", "wiki.folderRebound": "已重新选择源文件夹",
      "wiki.shelve": "暂存", "wiki.shelved": "已暂存",
      "wiki.moved": "已移动", "wiki.created": "已创建", "wiki.dismissed": "已忽略更新",
      "wiki.zipStorage": "压缩包存储目录", "wiki.snapshotStorage": "快照存储目录",
      "wiki.snapshotKeep": "快照保留份数",
      "wiki.webMode": "Web 模式", "webModeIntranet": "内网模式", "webModeExtranet": "外网模式",
      "wiki.autoSnapshot": "自动快照",
      "wiki.chunkMode": "切片模式", "chunkModeFixed": "固定切片", "chunkModeHeading": "标题分层切片",
      "wiki.pendingChanges": "待确认变更",
      "wiki.embedModel": "嵌入模型", "wiki.rerankModel": "重排模型",
      "wiki.embedFallback": "离线哈希（默认）", "wiki.embedLocal": "本地模型", "wiki.embedOpenAI": "OpenAI 兼容",
      "wiki.rerankNone": "关闭重排", "wiki.modelPath": "本地模型路径", "wiki.openaiBaseURL": "Base URL（如 https://api.openai.com/v1）",
      "wiki.openaiAPIKey": "API Key", "wiki.openaiModel": "模型名",
      "wiki.versions": "历史版本", "wiki.selectFile": "选择文件", "wiki.selectFileFirst": "请先选择文件", "wiki.noVersions": "暂无历史版本",
      "wiki.versionsHint": "人工编辑保存时自动生成历史版本，每文件最多保留 3 个",
      "wiki.view": "查看", "wiki.importFile": "导入文件", "wiki.importFolder": "导入文件夹", "wiki.importWeb": "导入网页",
      "wiki.cancel": "取消", "wiki.confirm": "确定", "wiki.contentSaved": "内容已保存",
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
      "wiki.newDoc": "New Doc", "wiki.newDocTitle": "New document title…",
      "wiki.rebindSource": "Rebind source path", "wiki.rebindSourcePrompt": "Enter new source path…",
      "wiki.folderSync": "Batch sync from source folder",
      "wiki.folderRebindSource": "Re-select source folder", "wiki.folderRebindSourcePrompt": "Enter new source folder path…", "wiki.folderRebound": "Source folder re-selected",
      "wiki.shelve": "Shelve", "wiki.shelved": "Shelved",
      "wiki.moved": "Moved", "wiki.created": "Created", "wiki.dismissed": "Change dismissed",
      "wiki.zipStorage": "Zip storage path", "wiki.snapshotStorage": "Snapshot storage path",
      "wiki.snapshotKeep": "Snapshot keep count",
      "wiki.webMode": "Web Mode", "webModeIntranet": "Intranet", "webModeExtranet": "Extranet",
      "wiki.autoSnapshot": "Auto snapshot",
      "wiki.chunkMode": "Chunk Mode", "chunkModeFixed": "Fixed", "chunkModeHeading": "Heading-based",
      "wiki.pendingChanges": "Pending changes",
      "wiki.embedModel": "Embedding model", "wiki.rerankModel": "Rerank model",
      "wiki.embedFallback": "Offline hash (default)", "wiki.embedLocal": "Local model", "wiki.embedOpenAI": "OpenAI-compatible",
      "wiki.rerankNone": "Disabled", "wiki.modelPath": "Local model path", "wiki.openaiBaseURL": "Base URL (e.g. https://api.openai.com/v1)",
      "wiki.openaiAPIKey": "API Key", "wiki.openaiModel": "Model name",
      "wiki.versions": "History versions", "wiki.selectFile": "Select file", "wiki.selectFileFirst": "Select a file first", "wiki.noVersions": "No versions yet",
      "wiki.versionsHint": "A version is created on each manual save, max 3 per file",
      "wiki.view": "View", "wiki.importFile": "Import files", "wiki.importFolder": "Import folder", "wiki.importWeb": "Import web page",
      "wiki.cancel": "Cancel", "wiki.confirm": "OK", "wiki.contentSaved": "Content saved",
      "wiki.importSubmitting": "Submitted {n} files for import",
      "wiki.confirmDeleteDoc": "Delete this document? This cannot be undone.",
      "wiki.confirmDeleteFolder": "Delete this folder and all documents inside? This cannot be undone.",
      "wiki.cannotMoveIntoSelf": "Cannot move into its own subfolder",
      "wiki.autoSaveConflict": "External changes detected — use Save to resolve",
      "wiki.autoSaveFailed": "Auto-save failed",
      "wiki.dropImport": "Drop to import into the wiki",
      "wiki.exitFullscreen": "Exit fullscreen", "wiki.fullscreen": "Fullscreen", "wiki.more": "More",
      "wiki.favSection": "Favorites", "wiki.recentSection": "Recent", "wiki.create": "New / Import",
      "wiki.rootAll": "All files", "wiki.emptyFolder": "Empty folder",
      "wiki.unfav": "Remove from favorites", "wiki.fav": "Add to favorites",
      "wiki.statusReady": "Indexed", "wiki.statusStale": "Stale", "wiki.statusError": "Error",
      "wiki.charCount": "chars",
      "wiki.emptyTitle": "Select a document from the left to get started",
      "wiki.emptyHint": "Import or search documents from the left, then click to view and edit. Supports local files / web pages / notes / Excel / PPT.",
      "wiki.newSubFolder": "New subfolder",
      "wiki.webModeHint": "Web fetch mode", "wiki.webModeInSettings": "See settings",
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
