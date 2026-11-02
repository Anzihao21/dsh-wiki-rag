window.__ModuleLoader__.load({id: "dsh-wiki-rag",factory: (require) => {var module = { exports: {} };var exports = module.exports;Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.tsx
var client_exports = {};
__export(client_exports, {
  WikiSidebar: () => WikiSidebar,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "locale"];
var NS = "wiki";
var API_BASE = "http://localhost:3081/api/wiki";
var SAMPLE_DOCS = [
  { id: "1", title: "\u9879\u76EE\u603B\u89C8", type: "MD", status: "ready", summary: "\u5E73\u53F0\u5B9A\u4F4D\u4E0E\u6574\u4F53\u67B6\u6784" },
  { id: "2", title: "\u63A5\u5165\u6307\u5357", type: "MD", status: "ready", summary: "\u4E09\u6B65\u5B8C\u6210\u9996\u6B21\u63A5\u5165" },
  { id: "3", title: "API \u53C2\u8003", type: "MD", status: "stale", summary: "\u63A5\u53E3\u5B57\u6BB5\u4E0E\u793A\u4F8B" },
  { id: "4", title: "\u90E8\u7F72\u624B\u518C", type: "PDF", status: "ready", summary: "\u751F\u4EA7\u73AF\u5883\u90E8\u7F72\u6E05\u5355" },
  { id: "5", title: "\u5E38\u89C1\u95EE\u9898 FAQ", type: "MD", status: "error", summary: "\u6700\u8FD1\u4E00\u6B21\u540C\u6B65\u5931\u8D25" }
];
var SAMPLE_MD = {
  "1": "# \u9879\u76EE\u603B\u89C8\n\n## \u5B9A\u4F4D\n\nDeepSeek Harness \u77E5\u8BC6\u5E93\u63D2\u4EF6\uFF0C\u672C\u5730\u4F18\u5148\u7684 Wiki \u98CE\u683C RAG \u7CFB\u7EDF\u3002\n\n## \u6838\u5FC3\u80FD\u529B\n\n- \u591A\u6765\u6E90\u6587\u6863\u5BFC\u5165\n- \u5411\u91CF + \u5173\u952E\u8BCD\u6DF7\u5408\u68C0\u7D22\n- MD \u53EF\u89C6\u5316\u7F16\u8F91\n- \u5FEB\u7167\u5907\u4EFD\n",
  "2": "# \u63A5\u5165\u6307\u5357\n\n## \u7B2C\u4E00\u6B65\n\n\u5B89\u88C5\u63D2\u4EF6\u3002\n\n```bash\ndsh plugin add dsh-wiki-rag\n```\n\n## \u7B2C\u4E8C\u6B65\n\n\u91CD\u542F DSH\uFF0C\u5DE6\u4FA7\u680F\u51FA\u73B0\u77E5\u8BC6\u5E93\u9762\u677F\u3002\n",
  "3": "# API \u53C2\u8003\n\n### wiki_rag_search\n\n\u68C0\u7D22\u77E5\u8BC6\u5E93\uFF0C\u8FD4\u56DE\u76F8\u5173\u6587\u6863\u7247\u6BB5\u3002\n\n| \u53C2\u6570 | \u7C7B\u578B | \u8BF4\u660E |\n|------|------|------|\n| query | string | \u68C0\u7D22\u8BCD |\n| topK | number | \u8FD4\u56DE\u6761\u6570 |\n"
};
var ApiError = class extends Error {
  constructor(msg, opts = {}) {
    super(msg);
    __publicField(this, "status");
    __publicField(this, "offline");
    this.status = opts.status;
    this.offline = opts.offline;
  }
};
var __notify = () => {
};
var __setOffline = () => {
};
function bindNotifiers(notify, setOffline) {
  __notify = notify;
  __setOffline = setOffline;
}
async function request(path, opts = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
  } catch {
    __setOffline(true);
    throw new ApiError("offline", { offline: true });
  }
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
    }
    if (res.status >= 500) __notify("error", msg);
    if (res.status >= 500) __setOffline(true);
    throw new ApiError(msg, { status: res.status });
  }
  __setOffline(false);
  try {
    return await res.json();
  } catch {
    return null;
  }
}
var apiList = () => request("/list").then(
  (data) => (data || []).map((f) => ({
    id: String(f.id),
    title: f.title || f.source_path?.split("/").pop() || "\u672A\u547D\u540D",
    type: f.kind === "pdf" ? "PDF" : "MD",
    status: f.chunk_count > 0 ? "ready" : "stale",
    summary: f.source_path || "",
    sourcePath: f.source_path || ""
  }))
);
var apiTree = () => request("/tree");
var apiCreateFolder = (name, parentId = null) => request("/folders", { method: "POST", body: JSON.stringify({ name, parentId }) });
var apiRenameFolder = (id, name) => request(`/folders/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) });
var apiDeleteFolder = (id) => request(`/folders/${id}`, { method: "DELETE" });
var apiMoveFile = (fileId, folderId) => request(`/files/${fileId}/move`, { method: "POST", body: JSON.stringify({ folderId }) });
var apiRename = (id, newName) => request(`/${id}/rename`, { method: "POST", body: JSON.stringify({ newName }) });
var apiSyncFromSource = (id) => request(`/${id}/sync`, { method: "POST" });
var apiAcceptUpdate = (id, newText) => request(`/${id}/accept-update`, { method: "POST", body: JSON.stringify({ newText }) });
var apiDismiss = (id) => request(`/${id}/dismiss`, { method: "POST" });
var apiDelete = (id) => request(`/${id}`, { method: "DELETE" });
var apiSearch = (query) => request("/search", { method: "POST", body: JSON.stringify({ query, topK: 10 }) }).then((r) => r || []);
var apiGetSettings = () => request("/settings");
var apiSaveSettings = (patch) => request("/settings", { method: "POST", body: JSON.stringify(patch) });
var apiCreateSnapshot = () => request("/snapshots", { method: "POST" });
var apiRestoreSnapshot = (id) => request(`/snapshots/${id}/restore`, { method: "POST" });
var apiGetJobs = (jobId) => request(`/jobs/${jobId}`);
function renderMdSafe(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let inCode = false;
  let codeBuf = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: {
            background: "var(--dsw-alias-bg-module-platform)",
            padding: 8,
            borderRadius: 4,
            overflowX: "auto",
            fontSize: 11,
            margin: "6px 0"
          }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: codeBuf.join("\n") }) }, "c" + i)
        );
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    let m;
    if (m = line.match(/^###\s+(.*)/)) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { margin: "10px 0 4px", fontSize: 13, fontWeight: 600 }, children: m[1] }, i));
    } else if (m = line.match(/^##\s+(.*)/)) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { margin: "12px 0 6px", fontSize: 14, fontWeight: 600 }, children: m[1] }, i));
    } else if (m = line.match(/^#\s+(.*)/)) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { margin: "14px 0 8px", fontSize: 16, fontWeight: 700 }, children: m[1] }, i));
    } else if (m = line.match(/^-\s+(.*)/)) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "1px 0", paddingLeft: 8 }, children: [
        "\xB7 ",
        m[1]
      ] }, i));
    } else if (line.trim() === "") {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: 6 } }, i));
    } else {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "1px 0" }, children: line }, i));
    }
  }
  if (inCode && codeBuf.length) {
    out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: {
      background: "var(--dsw-alias-bg-module-platform)",
      padding: 8,
      borderRadius: 4,
      overflowX: "auto",
      fontSize: 11
    }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: codeBuf.join("\n") }) }, "tail"));
  }
  return out;
}
function computeDiff(oldText, newText) {
  const a = String(oldText || "").split("\n");
  const b = String(newText || "").split("\n");
  const setB = new Set(b);
  const setA = new Set(a);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", oldText: a[i] });
      i++;
      j++;
    } else {
      const aDel = !setB.has(a[i]);
      const bAdd = !setA.has(b[j]);
      if (aDel && bAdd) {
        out.push({ type: "mod", oldText: a[i], newText: b[j] });
        i++;
        j++;
      } else if (aDel) {
        out.push({ type: "del", oldText: a[i] });
        i++;
      } else {
        out.push({ type: "add", newText: b[j] });
        j++;
      }
    }
  }
  while (i < a.length) out.push({ type: "del", oldText: a[i++] });
  while (j < b.length) out.push({ type: "add", newText: b[j++] });
  return out;
}
function WikiIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 7h6M9 11h4" })
      ]
    }
  );
}
function FolderIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" })
    }
  );
}
function FileIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14 2v6h6" })
      ]
    }
  );
}
function ToastStack({ toasts }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
    position: "fixed",
    top: 12,
    right: 12,
    zIndex: 10001,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxWidth: 320
  }, children: toasts.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
    padding: "8px 12px",
    borderRadius: "var(--dsw-radius-md)",
    background: "var(--dsw-alias-bg-layer-1)",
    border: "1px solid var(--dsw-alias-border-l4)",
    borderLeft: "3px solid " + (t.type === "error" ? "var(--dsw-alias-state-danger)" : t.type === "success" ? "var(--dsw-alias-state-success)" : "var(--dsw-alias-state-business-primary)"),
    color: "var(--dsw-alias-label-primary)",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
  }, children: t.msg }, t.id)) });
}
function SkeletonRows({ count = 6 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: `@keyframes dsw-shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
        .dsw-skel { background: var(--dsw-alias-bg-layer-2); border-radius: 6px; animation: dsw-shimmer 1.2s infinite; }` }),
    Array.from({ length: count }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsw-skel", style: { height: i === 0 ? 22 : 16, width: `${88 - i % 3 * 12}%` } }, i))
  ] });
}
var ErrorBoundary = class extends import_react.Component {
  constructor(p) {
    super(p);
    this.state = { hasError: false, retryCount: 0 };
  }
  static getDerivedStateFromError(e) {
    return { hasError: true, msg: String(e && e.message || e) };
  }
  componentDidCatch(e) {
    console.warn("[dsh-wiki-rag] render error:", e);
  }
  render() {
    if (this.state.hasError) {
      const exhausted = this.state.retryCount >= 3;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
        padding: 24,
        color: "var(--dsw-alias-label-primary)",
        fontSize: 13,
        fontFamily: "var(--dsw-font-family)"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "\u77E5\u8BC6\u5E93\u9762\u677F\u6E32\u67D3\u5F02\u5E38" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", wordBreak: "break-all" }, children: this.state.msg }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: () => {
              this.setState((s) => ({
                hasError: false,
                msg: void 0,
                retryCount: s.retryCount + 1
              }));
            },
            disabled: exhausted,
            style: {
              marginTop: 12,
              height: 28,
              padding: "0 12px",
              borderRadius: "var(--dsw-radius-sm)",
              border: "none",
              background: "var(--dsw-alias-state-business-primary)",
              color: "var(--dsw-alias-label-on-primary)",
              fontSize: 12,
              cursor: exhausted ? "not-allowed" : "pointer",
              opacity: exhausted ? 0.5 : 1
            },
            children: exhausted ? "\u91CD\u8BD5\u6B21\u6570\u5DF2\u7528\u5C3D\uFF0C\u8BF7\u91CD\u542F\u5BBF\u4E3B" : "\u91CD\u8BD5"
          }
        )
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: this.props.children }, this.state.retryCount);
  }
};
function flattenTree(nodes, depth, expanded, out) {
  (nodes || []).forEach((n) => {
    if (n.type === "folder") {
      out.push({ rowType: "folder", depth, id: n.id, title: n.name || "", raw: n });
      if (expanded.has(n.id)) flattenTree(n.children, depth + 1, expanded, out);
    } else {
      out.push({ rowType: "doc", depth, id: n.fileId, title: n.title || "", kind: n.kind, status: n.status, raw: n });
    }
  });
}
var ROW_H = 38;
function statusStyle(status) {
  if (status === "error") return { label: "\u5F02\u5E38", color: "var(--dsw-alias-state-danger)" };
  if (status === "stale") return { label: "\u5F85\u540C\u6B65", color: "var(--dsw-alias-state-warning)" };
  return { label: "\u5DF2\u7D22\u5F15", color: "var(--dsw-alias-state-success)" };
}
function WikiSidebar(props) {
  const { wide = true, expandSidebar, t } = props;
  const [q, setQ] = (0, import_react.useState)("");
  const [docs, setDocs] = (0, import_react.useState)([]);
  const [loadingList, setLoadingList] = (0, import_react.useState)(true);
  const [tree, setTree] = (0, import_react.useState)([]);
  const [expandedFolders, setExpandedFolders] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [activeId, setActiveId] = (0, import_react.useState)("");
  const [view, setView] = (0, import_react.useState)("list");
  const [editTab, setEditTab] = (0, import_react.useState)("edit");
  const [mdContent, setMdContent] = (0, import_react.useState)("");
  const [showImport, setShowImport] = (0, import_react.useState)(false);
  const [importPath, setImportPath] = (0, import_react.useState)("");
  const [importType, setImportType] = (0, import_react.useState)("file");
  const [noteTitle, setNoteTitle] = (0, import_react.useState)("");
  const [noteContent, setNoteContent] = (0, import_react.useState)("");
  const [showNewMd, setShowNewMd] = (0, import_react.useState)(false);
  const [newMdTitle, setNewMdTitle] = (0, import_react.useState)("");
  const [contextMenu, setContextMenu] = (0, import_react.useState)(null);
  const [renamingId, setRenamingId] = (0, import_react.useState)(null);
  const [renameText, setRenameText] = (0, import_react.useState)("");
  const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
  const [searchResults, setSearchResults] = (0, import_react.useState)(null);
  const [searching, setSearching] = (0, import_react.useState)(false);
  const [stats, setStats] = (0, import_react.useState)({ total: 0, ready: 0, stale: 0 });
  const [snapshots, setSnapshots] = (0, import_react.useState)([]);
  const [logs, setLogs] = (0, import_react.useState)([]);
  const [diffModal, setDiffModal] = (0, import_react.useState)(null);
  const [settings, setSettings] = (0, import_react.useState)({});
  const [settingsLoaded, setSettingsLoaded] = (0, import_react.useState)(false);
  const [job, setJob] = (0, import_react.useState)(null);
  const [toasts, setToasts] = (0, import_react.useState)([]);
  const [offline, setOffline] = (0, import_react.useState)(false);
  const [newFolderName, setNewFolderName] = (0, import_react.useState)("");
  const [showNewFolder, setShowNewFolder] = (0, import_react.useState)(false);
  const searchInputRef = (0, import_react.useRef)(null);
  const listScrollRef = (0, import_react.useRef)(null);
  const [scrollTop, setScrollTop] = (0, import_react.useState)(0);
  const [viewportH, setViewportH] = (0, import_react.useState)(400);
  const searchInflight = (0, import_react.useRef)(false);
  const importInflight = (0, import_react.useRef)(false);
  const toastId = (0, import_react.useRef)(0);
  const notify = (0, import_react.useCallback)((type, msg) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t2) => t2.id !== id)), 3200);
  }, []);
  (0, import_react.useEffect)(() => {
    bindNotifiers(notify, setOffline);
  }, [notify]);
  const refreshList = (0, import_react.useCallback)(async () => {
    setLoadingList(true);
    try {
      const [l, tr, s, sn, lg] = await Promise.all([
        apiList().catch(() => SAMPLE_DOCS),
        apiTree().catch(() => []),
        request("/stats").catch(() => ({ total: 0, ready: 0, stale: 0 })),
        request("/snapshots").catch(() => []),
        request("/logs").catch(() => [])
      ]);
      setDocs(l);
      setTree(tr);
      setStats(s);
      setSnapshots(sn || []);
      setLogs(lg || []);
    } finally {
      setLoadingList(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    refreshList();
  }, [refreshList]);
  (0, import_react.useEffect)(() => {
    const onKey = (e) => {
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
  }, [view, mdContent, activeId]);
  const pollJob = (0, import_react.useCallback)((jobId) => {
    const timer = setInterval(async () => {
      try {
        const j = await apiGetJobs(jobId);
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer);
          if (j.status === "done") {
            notify("success", t ? t("wiki.importDone") : "\u5BFC\u5165\u5B8C\u6210");
            refreshList();
          } else notify("error", j.error || "\u5BFC\u5165\u5931\u8D25");
          setTimeout(() => setJob(null), 1500);
        }
      } catch {
      }
    }, 700);
  }, [notify, refreshList, t]);
  const doImport = async () => {
    if (importInflight.current) return;
    try {
      let source = "", kind = "file", noteText;
      if (importType === "note") {
        if (!noteTitle.trim()) return;
        source = noteTitle.trim();
        kind = "note";
        noteText = noteContent;
      } else {
        if (!importPath.trim()) return;
        source = importPath.trim();
        kind = importType === "url" ? "url" : "file";
      }
      importInflight.current = true;
      const res = await request("/import", {
        method: "POST",
        body: JSON.stringify({ source, kind, noteText, async: true })
      });
      if (res && res.jobId) {
        setJob({ jobId: res.jobId, phase: "import", done: 0, total: 0, message: "", status: "running" });
        pollJob(res.jobId);
      }
    } catch (e) {
      if (e?.offline) notify("error", t ? t("wiki.offline") : "\u79BB\u7EBF / \u5BBF\u4E3B\u672A\u8FDE\u63A5");
      else notify("error", e?.message || "\u5BFC\u5165\u5931\u8D25");
    } finally {
      importInflight.current = false;
      setShowImport(false);
      setImportPath("");
      setNoteTitle("");
      setNoteContent("");
    }
  };
  const doDelete = async (id) => {
    try {
      await apiDelete(id);
      notify("success", t ? t("wiki.deleted") : "\u5DF2\u5220\u9664");
      refreshList();
    } catch (e) {
      notify("error", e?.message || "\u5220\u9664\u5931\u8D25");
    }
  };
  const doSearch = async () => {
    if (!q.trim() || searchInflight.current) return;
    searchInflight.current = true;
    setSearching(true);
    try {
      const hits = await apiSearch(q.trim());
      setSearchResults(hits.map((r, i) => ({
        id: String(r.fileId ?? i),
        title: r.title || r.fileName || `\u7ED3\u679C ${i + 1}`,
        type: "MD",
        status: "ready",
        summary: r.content?.slice(0, 120) || "",
        sourcePath: r.sourcePath || "",
        fileName: r.fileName || "",
        score: r.score,
        chunkIndex: r.chunkIndex
      })));
    } catch (e) {
      if (e?.offline) notify("error", t ? t("wiki.offline") : "\u79BB\u7EBF / \u5BBF\u4E3B\u672A\u8FDE\u63A5");
      else notify("error", e?.message || "\u641C\u7D22\u5931\u8D25");
      setSearchResults([]);
    } finally {
      searchInflight.current = false;
      setSearching(false);
    }
  };
  const doRenameDoc = async (id) => {
    if (!renameText.trim()) return;
    try {
      await apiRename(id, renameText.trim());
      notify("success", t ? t("wiki.renamed") : "\u5DF2\u91CD\u547D\u540D");
    } catch (e) {
      notify("error", e?.message || "\u91CD\u547D\u540D\u5931\u8D25");
    }
    setRenamingId(null);
    setRenameText("");
    refreshList();
  };
  const doCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await apiCreateFolder(newFolderName.trim());
      notify("success", t ? t("wiki.folderCreated") : "\u6587\u4EF6\u5939\u5DF2\u521B\u5EFA");
    } catch (e) {
      notify("error", e?.message || "\u521B\u5EFA\u5931\u8D25");
    }
    setNewFolderName("");
    setShowNewFolder(false);
    refreshList();
  };
  const doRenameFolder = async (id) => {
    if (!renameText.trim()) return;
    try {
      await apiRenameFolder(id, renameText.trim());
      notify("success", t ? t("wiki.renamed") : "\u5DF2\u91CD\u547D\u540D");
    } catch (e) {
      notify("error", e?.message || "\u91CD\u547D\u540D\u5931\u8D25");
    }
    setRenamingId(null);
    setRenameText("");
    refreshList();
  };
  const doDeleteFolder = async (id) => {
    try {
      await apiDeleteFolder(id);
      notify("success", t ? t("wiki.folderDeleted") : "\u6587\u4EF6\u5939\u5DF2\u5220\u9664");
    } catch (e) {
      notify("error", e?.message || "\u5220\u9664\u5931\u8D25");
    }
    refreshList();
  };
  const doMoveDoc = async (fileId, folderId) => {
    try {
      await apiMoveFile(fileId, folderId);
      refreshList();
    } catch (e) {
      notify("error", e?.message || "\u79FB\u52A8\u5931\u8D25");
    }
  };
  const saveSettings = async () => {
    try {
      const res = await apiSaveSettings(settings);
      if (res?.settings) setSettings(res.settings);
      notify("success", t ? t("wiki.saved") : "\u5DF2\u4FDD\u5B58");
    } catch (e) {
      notify("error", e?.message || "\u4FDD\u5B58\u5931\u8D25");
    }
    setView("list");
  };
  const saveEdit = () => {
    setView("list");
  };
  const doRestore = async (id) => {
    try {
      await apiRestoreSnapshot(id);
      notify("success", t ? t("wiki.restored") : "\u5FEB\u7167\u5DF2\u6062\u590D");
      refreshList();
    } catch (e) {
      notify("error", e?.message || "\u6062\u590D\u5931\u8D25");
    }
  };
  const title = t ? t("wiki.title") : "\u77E5\u8BC6\u5E93";
  if (!wide) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 8 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        title,
        onClick: expandSidebar,
        style: {
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--dsw-alias-label-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikiIcon, { size: 18 })
      }
    ) });
  }
  const activeDoc = docs.find((d) => d.id === activeId);
  if (view === "editor" && activeDoc) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setView("list"), style: iconBtn, children: "\u2190" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: activeDoc.title }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: typeBadge, children: activeDoc.type }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: saveEdit, style: primaryBtn, children: t ? t("wiki.save") : "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2, borderBottom: "1px solid var(--dsw-alias-border-l1)" }, children: ["edit", "preview"].map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setEditTab(tab), style: {
        padding: "6px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
        color: editTab === tab ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
        borderBottom: editTab === tab ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
        fontWeight: editTab === tab ? 600 : 400
      }, children: tab === "edit" ? t ? t("wiki.edit") : "\u7F16\u8F91" : t ? t("wiki.preview") : "\u9884\u89C8" }, tab)) }),
      editTab === "edit" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { value: mdContent, onChange: (e) => setMdContent(e.target.value), style: textareaStyle }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
        flex: 1,
        overflowY: "auto",
        padding: 10,
        borderRadius: "var(--dsw-radius-md)",
        background: "var(--dsw-alias-bg-layer-1)",
        fontSize: 13,
        lineHeight: 1.7
      }, children: renderMdSafe(mdContent) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: t ? t("wiki.autoIndexHint") : "\u7F16\u8F91\u540E\u81EA\u52A8\u5237\u65B0\u5411\u91CF\u7D22\u5F15" })
    ] });
  }
  if (view === "settings") {
    const inputStyle = {
      height: 30,
      padding: "0 8px",
      boxSizing: "border-box",
      borderRadius: "var(--dsw-radius-sm)",
      border: "1px solid var(--dsw-alias-border-l4)",
      background: "var(--dsw-alias-bg-layer-1)",
      color: "var(--dsw-alias-label-primary)",
      outline: "none",
      fontSize: 12,
      width: "100%"
    };
    const labelStyle = { fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginBottom: 2, display: "block" };
    const sectionStyle = {
      fontSize: 13,
      fontWeight: 600,
      margin: "8px 0 6px",
      color: "var(--dsw-alias-label-primary)",
      paddingBottom: 4,
      borderBottom: "1px solid var(--dsw-alias-border-l1)"
    };
    if (!settingsLoaded) {
      apiGetSettings().then((s) => {
        setSettings(s || {});
        setSettingsLoaded(true);
      }).catch(() => setSettingsLoaded(true));
    }
    const set = (k, v) => setSettings((prev) => ({ ...prev, [k]: v }));
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setView("list"), style: iconBtn, children: "\u2190" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, fontWeight: 600, fontSize: 13 }, children: t ? t("wiki.settings") : "\u8BBE\u7F6E" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: saveSettings, style: primaryBtn, children: t ? t("wiki.save") : "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: sectionStyle, children: t ? t("wiki.storage") : "\u6570\u636E\u5B58\u50A8\u76EE\u5F55" }),
        [
          ["mdStoragePath", "MD \u5B58\u50A8\u76EE\u5F55"],
          ["zipStoragePath", "ZIP \u5B58\u50A8\u76EE\u5F55"],
          ["snapshotStoragePath", "\u5FEB\u7167\u5B58\u50A8\u76EE\u5F55"]
        ].map(([k, lbl]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: lbl }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: settings[k] || "", onChange: (e) => set(k, e.target.value), style: inputStyle, placeholder: "/path/to/store" })
        ] }, k)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: t ? t("wiki.chunkSize") : "\u5206\u5757\u5927\u5C0F" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "number", value: settings.chunkSize ?? 500, onChange: (e) => set("chunkSize", Number(e.target.value)), style: inputStyle })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: t ? t("wiki.chunkOverlap") : "\u5206\u5757\u91CD\u53E0" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "number", value: settings.chunkOverlap ?? 50, onChange: (e) => set("chunkOverlap", Number(e.target.value)), style: inputStyle })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: sectionStyle, children: "Rerank" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: t ? t("wiki.rerankTopK") : "Rerank TopK" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "number", value: settings.rerankTopK ?? 5, onChange: (e) => set("rerankTopK", Number(e.target.value)), style: inputStyle })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: t ? t("wiki.restartHint") : "\u4FEE\u6539\u5B58\u50A8\u8DEF\u5F84\u540E\u5C06\u81EA\u52A8\u8FC1\u79FB\u5DF2\u6709\u6587\u4EF6" })
    ] });
  }
  if (view === "snapshots") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { onClick: () => setView("list"), style: ghostBtn, children: [
          "\u2190 ",
          t ? t("wiki.back") : "\u8FD4\u56DE"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14 }, children: t ? t("wiki.snapshots") : "\u5FEB\u7167\u7BA1\u7406" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { onClick: async () => {
          await apiCreateSnapshot();
          notify("success", t ? t("wiki.snapshotCreated") : "\u5DF2\u521B\u5EFA\u5FEB\u7167");
          refreshList();
        }, style: primaryBtn, children: [
          "+ ",
          t ? t("wiki.new") : "\u65B0\u5EFA"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" }, children: snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: emptyHint, children: t ? t("wiki.noSnapshots") : "\u6682\u65E0\u5FEB\u7167" }) : snapshots.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "8px 10px", borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 13, fontWeight: 500 }, children: [
            "#",
            s.id,
            " ",
            s.note || "\u624B\u52A8\u5FEB\u7167"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }, children: new Date(s.created_at || s.created_at_ms || Date.now()).toLocaleString() })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => doRestore(s.id), style: ghostBtn, children: t ? t("wiki.restore") : "\u6062\u590D" })
      ] }) }, s.id)) })
    ] });
  }
  if (view === "logs") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { onClick: () => setView("list"), style: ghostBtn, children: [
          "\u2190 ",
          t ? t("wiki.back") : "\u8FD4\u56DE"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14 }, children: t ? t("wiki.logs") : "\u5BA1\u8BA1\u65E5\u5FD7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 60 } })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" }, children: logs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: emptyHint, children: t ? t("wiki.noLogs") : "\u6682\u65E0\u65E5\u5FD7" }) : logs.map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "6px 10px", borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)", fontSize: 11 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: l.time }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 2 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: l.action }),
          " \xB7 ",
          l.detail
        ] })
      ] }, i)) })
    ] });
  }
  const searchingMode = !!searchResults;
  let rows = [];
  if (!searchingMode) {
    rows = [];
    flattenTree(tree, 0, expandedFolders, rows);
    if (rows.length === 0 && docs.length) {
      rows = docs.map((d) => ({ rowType: "doc", depth: 0, id: Number(d.id) || 0, title: d.title, kind: d.type, status: d.status, raw: {} }));
    }
  }
  const overscan = 6;
  const maxScrollTop = Math.max(0, rows.length * ROW_H - 1);
  const clampedScrollTop = Math.min(scrollTop, maxScrollTop);
  const startIndex = Math.max(0, Math.floor(clampedScrollTop / ROW_H) - overscan);
  const endIndex = Math.min(rows.length, Math.ceil((clampedScrollTop + viewportH) / ROW_H) + overscan);
  const visibleRows = rows.slice(startIndex, endIndex);
  const isEmpty = rows.length === 0 && !loadingList && docs.length === 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rootStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToastStack, { toasts }),
    offline && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
      padding: "4px 8px",
      borderRadius: "var(--dsw-radius-sm)",
      fontSize: 11,
      background: "var(--dsw-alias-state-warning)",
      color: "var(--dsw-alias-label-on-primary)"
    }, children: t ? t("wiki.offline") : "\u79BB\u7EBF / \u5BBF\u4E3B\u672A\u8FDE\u63A5" }),
    job && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 8, borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, marginBottom: 4 }, children: job.message || (t ? t("wiki.importing") : "\u5BFC\u5165\u4E2D\u2026") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-layer-2)", overflow: "hidden" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
        height: "100%",
        width: job.total ? `${Math.min(100, job.done / job.total * 100)}%` : "0%",
        background: "var(--dsw-alias-state-business-primary)",
        transition: "width 0.3s"
      } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }, children: [
        job.done,
        " / ",
        job.total
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikiIcon, { size: 16 }),
        title
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2 }, children: [
        ["+", "import", () => setShowImport(!showImport)],
        [t ? t("wiki.newFolder") : "Dir", "folder", () => setShowNewFolder(!showNewFolder)],
        ["\u27F3", "refresh", () => refreshList()],
        [t ? t("wiki.snapshots") : "Snap", "snap", () => setView("snapshots")],
        [t ? t("wiki.logs") : "Logs", "logs", () => setView("logs")],
        [t ? t("wiki.settings") : "Set", "set", () => setView("settings")]
      ].map(([lbl, tip, fn], i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { title: tip, onClick: fn, style: headerBtn, children: lbl }, i)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        ref: searchInputRef,
        value: q,
        onChange: (e) => {
          setQ(e.target.value);
          if (!e.target.value.trim()) setSearchResults(null);
        },
        onKeyDown: (e) => {
          if (e.key === "Enter") doSearch();
        },
        placeholder: t ? t("wiki.search") : "\u641C\u7D22\u6587\u6863\u2026",
        style: searchInputStyle
      }
    ),
    showNewFolder && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          value: newFolderName,
          onChange: (e) => setNewFolderName(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") doCreateFolder();
          },
          placeholder: t ? t("wiki.folderName") : "\u6587\u4EF6\u5939\u540D\u79F0\u2026",
          autoFocus: true,
          style: smallInput
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: doCreateFolder, style: primaryBtn, children: t ? t("wiki.new") : "\u65B0\u5EFA" })
    ] }),
    showImport && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4, padding: 6, borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2 }, children: [["file", "\u6587\u4EF6"], ["url", "URL"], ["note", "\u7B14\u8BB0"]].map(([k, l]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setImportType(k), style: {
        flex: 1,
        padding: "3px 0",
        border: "none",
        cursor: "pointer",
        borderRadius: "var(--dsw-radius-sm)",
        fontSize: 11,
        background: importType === k ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
        color: importType === k ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)"
      }, children: l }, k)) }),
      importType !== "note" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          value: importPath,
          onChange: (e) => setImportPath(e.target.value),
          placeholder: importType === "url" ? "https://example.com/article" : "\u8F93\u5165\u6587\u4EF6\u8DEF\u5F84\u2026",
          style: smallInput
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: noteTitle, onChange: (e) => setNoteTitle(e.target.value), placeholder: "\u7B14\u8BB0\u6807\u9898\u2026", style: smallInput }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: noteContent,
            onChange: (e) => setNoteContent(e.target.value),
            placeholder: "\u7B14\u8BB0\u5185\u5BB9\u2026",
            rows: 3,
            style: { ...smallInput, height: "auto", padding: "6px 8px", resize: "vertical" }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: doImport, disabled: importInflight.current, style: { ...primaryBtn, opacity: importInflight.current ? 0.6 : 1 }, children: importInflight.current ? "\u2026" : t ? t("wiki.import") : "\u5BFC\u5165" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2 }, children: [["all", "\u5168\u90E8"], ["ready", "\u5DF2\u7D22\u5F15"], ["stale", "\u5F85\u540C\u6B65"], ["error", "\u5F02\u5E38"]].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setStatusFilter(key), style: {
      flex: 1,
      padding: "3px 0",
      border: "none",
      cursor: "pointer",
      borderRadius: "var(--dsw-radius-sm)",
      fontSize: 11,
      background: statusFilter === key ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
      color: statusFilter === key ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
      fontWeight: statusFilter === key ? 600 : 400
    }, children: label }, key)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref: listScrollRef,
        onScroll: (e) => {
          setScrollTop(e.currentTarget.scrollTop);
          setViewportH(e.currentTarget.clientHeight);
        },
        style: { flex: 1, overflowY: "auto", position: "relative", minHeight: 0 },
        children: loadingList ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonRows, { count: 8 }) : searchingMode ? (
          /* ---- 搜索结果：来源文件名 + 片段 + 徽章 ---- */
          searching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonRows, { count: 5 }) : searchResults.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: emptyHint, children: t ? t("wiki.noResult") : "\u65E0\u641C\u7D22\u7ED3\u679C" }) : searchResults.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              onClick: () => {
                setActiveId(r.id);
                setMdContent(r.summary);
                setView("editor");
              },
              style: {
                padding: "8px 10px",
                borderRadius: "var(--dsw-radius-md)",
                cursor: "pointer",
                marginBottom: 4,
                background: "var(--dsw-alias-bg-layer-1)",
                border: "1px solid var(--dsw-alias-border-l4)"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: r.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 4,
                    flexShrink: 0,
                    background: "var(--dsw-alias-bg-module-platform)",
                    color: "var(--dsw-alias-label-secondary)"
                  }, children: r.fileName || "MD" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 3, fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: r.summary }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 4, fontSize: 10, color: "var(--dsw-alias-label-tertiary)", display: "flex", gap: 8 }, children: [
                  r.sourcePath && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: r.sourcePath }),
                  typeof r.score === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "score ",
                    r.score.toFixed(3)
                  ] })
                ] })
              ]
            },
            i
          ))
        ) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: emptyHint, children: t ? t("wiki.empty") : "\u77E5\u8BC6\u5E93\u4E3A\u7A7A" }) : (
          /* ---- 虚拟列表占位 ---- */
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: rows.length * ROW_H, position: "relative" }, children: visibleRows.map((row) => {
            const top = (startIndex + rows.indexOf(row)) * ROW_H;
            if (row.rowType === "folder") {
              const open = expandedFolders.has(row.id);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: (e) => {
                    e.preventDefault();
                    const fid = e.dataTransfer.getData("text/doc-id");
                    if (fid) doMoveDoc(fid, row.id);
                  },
                  onClick: () => setExpandedFolders((prev) => {
                    const n = new Set(prev);
                    if (n.has(row.id)) n.delete(row.id);
                    else n.add(row.id);
                    return n;
                  }),
                  onContextMenu: (e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: row.id });
                  },
                  style: {
                    position: "absolute",
                    top,
                    left: 0,
                    right: 0,
                    height: ROW_H,
                    paddingLeft: 8 + row.depth * 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                    color: "var(--dsw-alias-label-primary)",
                    fontSize: 13,
                    fontWeight: 600
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 10, color: "var(--dsw-alias-label-secondary)" }, children: open ? "\u25BC" : "\u25B6" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderIcon, { size: 14 }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: row.title })
                  ]
                },
                "f" + row.id
              );
            }
            const d = { id: String(row.id), title: row.title, type: row.kind || "MD", status: row.status || "ready", summary: "" };
            const st = statusStyle(d.status);
            const active = d.id === activeId;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                draggable: true,
                onDragStart: (e) => e.dataTransfer.setData("text/doc-id", d.id),
                onClick: () => {
                  setActiveId(d.id);
                  setMdContent(SAMPLE_MD[d.id] ?? "# " + d.title + "\n\n\u6682\u65E0\u5185\u5BB9\n");
                  setView("editor");
                },
                onContextMenu: (e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, kind: "doc", id: d.id });
                },
                style: {
                  position: "absolute",
                  top,
                  left: 0,
                  right: 0,
                  height: ROW_H,
                  paddingLeft: 22 + row.depth * 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  borderRadius: "var(--dsw-radius-md)",
                  background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                  borderLeft: active ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent"
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileIcon, { size: 13 }),
                  renamingId === d.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      autoFocus: true,
                      value: renameText,
                      onChange: (e) => setRenameText(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === "Enter") doRenameDoc(d.id);
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameText("");
                        }
                      },
                      onBlur: () => doRenameDoc(d.id),
                      style: { flex: 1, height: 20, padding: "0 4px", boxSizing: "border-box", borderRadius: 4, border: "1px solid var(--dsw-alias-state-business-primary)", background: "var(--dsw-alias-bg-layer-0)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 13 }
                    }
                  ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: active ? 600 : 500 }, children: row.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 10, color: st.color }, children: "\u25CF" })
                ]
              },
              "d" + row.id
            );
          }) })
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "6px 2px 0", borderTop: "1px solid var(--dsw-alias-border-l1)", fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: t ? t("wiki.count", { n: stats.total || rows.length }) : `\u5171 ${stats.total || rows.length} \u6761` }),
    contextMenu && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        onClick: () => setContextMenu(null),
        onContextMenu: (e) => {
          e.preventDefault();
          setContextMenu(null);
        },
        style: { position: "fixed", inset: 0, zIndex: 998 },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { onClick: (e) => e.stopPropagation(), style: {
          position: "fixed",
          left: contextMenu.x,
          top: contextMenu.y,
          background: "var(--dsw-alias-bg-layer-1)",
          borderRadius: "var(--dsw-radius-md)",
          border: "1px solid var(--dsw-alias-border-l4)",
          padding: 4,
          minWidth: 140,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { onClick: () => {
            setRenamingId(contextMenu.id);
            const cur = contextMenu.kind === "doc" ? docs.find((d) => d.id === String(contextMenu.id))?.title : treeFindName(tree, Number(contextMenu.id));
            setRenameText(cur || "");
            setContextMenu(null);
          }, style: menuItem, children: t ? t("wiki.rename") : "\u91CD\u547D\u540D" }),
          contextMenu.kind === "doc" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { onClick: async () => {
            const docId = String(contextMenu.id);
            setContextMenu(null);
            const outcome = await apiSyncFromSource(docId).catch(() => null);
            if (outcome && outcome.status === "needs-confirm" && outcome.diff) {
              setDiffModal({ old: outcome.diff.oldText || "", new: outcome.diff.newText || "", title: `\u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0\uFF1A${outcome.diff.fileName || ""}`, fileId: docId, newText: outcome.diff.newText || "" });
            } else {
              setDiffModal({ old: "", new: outcome?.reason || "\u65E0\u53EF\u7528\u66F4\u65B0", title: "\u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0" });
            }
          }, style: menuItem, children: t ? t("wiki.update") : "\u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { onClick: () => {
            if (contextMenu.kind === "doc") doDelete(String(contextMenu.id));
            else doDeleteFolder(Number(contextMenu.id));
            setContextMenu(null);
          }, style: { ...menuItem, color: "var(--dsw-alias-state-danger)" }, children: t ? t("wiki.delete") : "\u5220\u9664" })
        ] })
      }
    ),
    diffModal && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiffModalBox, { modal: diffModal, t, onClose: () => setDiffModal(null), onAccept: async (ft, nt) => {
      try {
        await apiAcceptUpdate(ft, nt);
        refreshList();
        notify("success", t ? t("wiki.accepted") : "\u5DF2\u63A5\u53D7\u66F4\u65B0");
      } catch (e) {
        notify("error", e?.message || "\u63A5\u53D7\u5931\u8D25");
      }
      setDiffModal(null);
    }, onReject: async (ft) => {
      try {
        await apiDismiss(ft);
      } catch {
      }
      setDiffModal(null);
    } })
  ] });
}
var rootStyle = {
  height: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "6px 10px",
  color: "var(--dsw-alias-label-primary)",
  fontSize: 14,
  fontFamily: "var(--dsw-font-family)"
};
var iconBtn = { border: "none", background: "transparent", cursor: "pointer", color: "var(--dsw-alias-label-secondary)", fontSize: 16, padding: 2 };
var primaryBtn = {
  height: 26,
  padding: "0 10px",
  borderRadius: "var(--dsw-radius-sm)",
  border: "none",
  background: "var(--dsw-alias-state-business-primary)",
  color: "var(--dsw-alias-label-on-primary)",
  fontSize: 12,
  cursor: "pointer"
};
var ghostBtn = {
  height: 26,
  padding: "0 10px",
  borderRadius: "var(--dsw-radius-sm)",
  border: "1px solid var(--dsw-alias-border-l4)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: 12,
  cursor: "pointer"
};
var headerBtn = {
  width: 24,
  height: 24,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  cursor: "pointer",
  color: "var(--dsw-alias-label-secondary)",
  fontSize: 12
};
var searchInputStyle = {
  height: 32,
  padding: "0 10px",
  boxSizing: "border-box",
  borderRadius: "var(--dsw-radius-md)",
  border: "1px solid var(--dsw-alias-border-l4)",
  background: "var(--dsw-alias-bg-layer-1)",
  color: "var(--dsw-alias-label-primary)",
  outline: "none",
  fontSize: 13
};
var smallInput = {
  flex: 1,
  height: 28,
  padding: "0 8px",
  boxSizing: "border-box",
  borderRadius: "var(--dsw-radius-sm)",
  border: "1px solid var(--dsw-alias-border-l4)",
  background: "var(--dsw-alias-bg-layer-0)",
  color: "var(--dsw-alias-label-primary)",
  outline: "none",
  fontSize: 12
};
var typeBadge = {
  fontSize: 10,
  padding: "1px 5px",
  borderRadius: 4,
  background: "var(--dsw-alias-bg-layer-2)",
  color: "var(--dsw-alias-label-secondary)"
};
var textareaStyle = {
  flex: 1,
  width: "100%",
  boxSizing: "border-box",
  resize: "none",
  padding: 10,
  borderRadius: "var(--dsw-radius-md)",
  border: "1px solid var(--dsw-alias-border-l4)",
  background: "var(--dsw-alias-bg-layer-1)",
  color: "var(--dsw-alias-label-primary)",
  fontFamily: "var(--dsw-font-family-mono, monospace)",
  fontSize: 12,
  lineHeight: 1.6,
  outline: "none"
};
var emptyHint = { padding: "24px 8px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 };
var menuItem = {
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 4
};
function treeFindName(nodes, id) {
  for (const n of nodes || []) {
    if (n.type === "folder") {
      if (n.id === id) return n.name || "";
      const r = treeFindName(n.children || [], id);
      if (r) return r;
    }
  }
  return "";
}
function DiffModalBox(props) {
  const { modal, t, onClose, onAccept, onReject } = props;
  const rows = computeDiff(modal.old, modal.new);
  const rowColor = {
    add: { background: "var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-success)", sign: "+" },
    del: { background: "var(--dsw-alias-state-danger-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-danger)", sign: "-" },
    mod: { background: "var(--dsw-alias-state-warning-bg, var(--dsw-alias-bg-layer-2))", color: "var(--dsw-alias-state-warning)", sign: "~" },
    ctx: { background: "transparent", color: "var(--dsw-alias-label-secondary)", sign: " " }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
    width: "90%",
    maxWidth: 560,
    maxHeight: "80vh",
    background: "var(--dsw-alias-bg-layer-1)",
    borderRadius: "var(--dsw-radius-lg)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, fontSize: 14 }, children: [
      t ? t("wiki.changeConfirm") : "\u53D8\u66F4\u786E\u8BA4",
      "\uFF1A",
      modal.title
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, overflow: "auto", fontSize: 12, fontFamily: "var(--dsw-font-family-mono, monospace)", display: "flex", flexDirection: "column" }, children: rows.map((r, i) => {
      if (r.type === "mod") {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...rowColor.mod, padding: "2px 6px", whiteSpace: "pre-wrap" }, children: [
            "- ",
            r.oldText
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...rowColor.mod, padding: "2px 6px", whiteSpace: "pre-wrap" }, children: [
            "+ ",
            r.newText
          ] })
        ] }, i);
      }
      const c = rowColor[r.type];
      const txt = r.type === "del" ? r.oldText : r.newText;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...c, padding: "2px 6px", whiteSpace: "pre-wrap" }, children: [
        c.sign,
        " ",
        txt
      ] }, i);
    }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => {
        if (modal.fileId) onReject(modal.fileId);
        else onClose();
      }, style: ghostBtn, children: t ? t("wiki.reject") : "\u62D2\u7EDD" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => {
        if (modal.fileId && modal.newText != null) onAccept(modal.fileId, modal.newText);
        else onClose();
      }, style: primaryBtn, children: t ? t("wiki.accept") : "\u63A5\u53D7" })
    ] })
  ] }) });
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, {
    zh: {
      "wiki.title": "\u77E5\u8BC6\u5E93",
      "wiki.search": "\u641C\u7D22\u6587\u6863\u2026",
      "wiki.refresh": "\u5237\u65B0",
      "wiki.settings": "\u8BBE\u7F6E",
      "wiki.new": "\u65B0\u5EFA",
      "wiki.snapshots": "\u5FEB\u7167",
      "wiki.logs": "\u65E5\u5FD7",
      "wiki.rename": "\u91CD\u547D\u540D",
      "wiki.update": "\u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0",
      "wiki.delete": "\u5220\u9664",
      "wiki.root": "\u6839\u76EE\u5F55",
      "wiki.empty": "\u6682\u65E0\u6587\u6863",
      "wiki.noLogs": "\u6682\u65E0\u65E5\u5FD7",
      "wiki.noSnapshots": "\u6682\u65E0\u5FEB\u7167",
      "wiki.noResult": "\u65E0\u641C\u7D22\u7ED3\u679C",
      "wiki.back": "\u8FD4\u56DE",
      "wiki.save": "\u4FDD\u5B58",
      "wiki.edit": "\u7F16\u8F91",
      "wiki.preview": "\u9884\u89C8",
      "wiki.storage": "\u6570\u636E\u5B58\u50A8\u76EE\u5F55",
      "wiki.chunkSize": "\u5206\u5757\u5927\u5C0F",
      "wiki.chunkOverlap": "\u5206\u5757\u91CD\u53E0",
      "wiki.rerankTopK": "Rerank TopK",
      "wiki.restartHint": "\u4FEE\u6539\u5B58\u50A8\u8DEF\u5F84\u540E\u5C06\u81EA\u52A8\u8FC1\u79FB\u5DF2\u6709\u6587\u4EF6",
      "wiki.import": "\u5BFC\u5165",
      "wiki.importing": "\u5BFC\u5165\u4E2D\u2026",
      "wiki.importDone": "\u5BFC\u5165\u5B8C\u6210",
      "wiki.folderName": "\u6587\u4EF6\u5939\u540D\u79F0\u2026",
      "wiki.newFolder": "\u76EE\u5F55",
      "wiki.folderCreated": "\u6587\u4EF6\u5939\u5DF2\u521B\u5EFA",
      "wiki.folderDeleted": "\u6587\u4EF6\u5939\u5DF2\u5220\u9664",
      "wiki.offline": "\u79BB\u7EBF / \u5BBF\u4E3B\u672A\u8FDE\u63A5",
      "wiki.restore": "\u6062\u590D",
      "wiki.restored": "\u5FEB\u7167\u5DF2\u6062\u590D",
      "wiki.snapshotCreated": "\u5DF2\u521B\u5EFA\u5FEB\u7167",
      "wiki.saved": "\u5DF2\u4FDD\u5B58",
      "wiki.deleted": "\u5DF2\u5220\u9664",
      "wiki.renamed": "\u5DF2\u91CD\u547D\u540D",
      "wiki.accepted": "\u5DF2\u63A5\u53D7\u66F4\u65B0",
      "wiki.changeConfirm": "\u53D8\u66F4\u786E\u8BA4",
      "wiki.reject": "\u62D2\u7EDD",
      "wiki.accept": "\u63A5\u53D7",
      "wiki.autoIndexHint": "\u7F16\u8F91\u540E\u81EA\u52A8\u5237\u65B0\u5411\u91CF\u7D22\u5F15",
      "wiki.count": "\u5171 {n} \u6761"
    },
    en: {
      "wiki.title": "Wiki",
      "wiki.search": "Search docs\u2026",
      "wiki.refresh": "Refresh",
      "wiki.settings": "Settings",
      "wiki.new": "New",
      "wiki.snapshots": "Snapshots",
      "wiki.logs": "Logs",
      "wiki.rename": "Rename",
      "wiki.update": "Update from source",
      "wiki.delete": "Delete",
      "wiki.root": "Root",
      "wiki.empty": "No documents",
      "wiki.noLogs": "No logs",
      "wiki.noSnapshots": "No snapshots",
      "wiki.noResult": "No results",
      "wiki.back": "Back",
      "wiki.save": "Save",
      "wiki.edit": "Edit",
      "wiki.preview": "Preview",
      "wiki.storage": "Storage Directories",
      "wiki.chunkSize": "Chunk Size",
      "wiki.chunkOverlap": "Chunk Overlap",
      "wiki.rerankTopK": "Rerank TopK",
      "wiki.restartHint": "Files will be migrated on save",
      "wiki.import": "Import",
      "wiki.importing": "Importing\u2026",
      "wiki.importDone": "Import done",
      "wiki.folderName": "Folder name\u2026",
      "wiki.newFolder": "Dir",
      "wiki.folderCreated": "Folder created",
      "wiki.folderDeleted": "Folder deleted",
      "wiki.offline": "Offline / host disconnected",
      "wiki.restore": "Restore",
      "wiki.restored": "Snapshot restored",
      "wiki.snapshotCreated": "Snapshot created",
      "wiki.saved": "Saved",
      "wiki.deleted": "Deleted",
      "wiki.renamed": "Renamed",
      "wiki.accepted": "Update accepted",
      "wiki.changeConfirm": "Confirm changes",
      "wiki.reject": "Reject",
      "wiki.accept": "Accept",
      "wiki.autoIndexHint": "Vector index auto-refreshed after edit",
      "wiki.count": "{n} items"
    }
  }), "wiki: dictionaries");
  ctx.effect(() => {
    let disposed = false;
    let unsubPanel;
    let unsubMain;
    let timer;
    let attempts = 0;
    const PANEL_ID = "wiki-rag";
    const tryRegister = () => {
      if (disposed || unsubPanel || unsubMain) return;
      let panelDeclared, mainDeclared;
      try {
        panelDeclared = ctx.slots && typeof ctx.slots.spec === "function" ? ctx.slots.spec("sidebar.panellist") : void 0;
        mainDeclared = ctx.slots && typeof ctx.slots.spec === "function" ? ctx.slots.spec("main") : void 0;
      } catch {
        return;
      }
      if (!panelDeclared || !mainDeclared) return;
      try {
        unsubMain = ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ t: ctx.locale?.bind ? ctx.locale.bind(NS) : void 0 })
          },
          () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: "100%", maxWidth: "960px", margin: "0 auto", padding: "24px", height: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorBoundary, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikiSidebar, { wide: true }) }) })
        );
        unsubPanel = ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 100,
            label: () => ctx.locale ? ctx.locale.bind(NS)("wiki.title") : "Wiki",
            locale: NS,
            icon: () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikiIcon, { size: 18 })
          },
          () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikiIcon, { size: 18 })
        );
        if (timer) {
          clearInterval(timer);
          timer = void 0;
        }
      } catch (e) {
        console.warn("[dsh-wiki-rag] slots.register failed:", e);
      }
    };
    tryRegister();
    if (!unsubPanel || !unsubMain) {
      try {
        if (typeof ctx.slots?.subscribeDeclaration === "function") {
          ctx.slots.subscribeDeclaration("sidebar.panellist", tryRegister);
          ctx.slots.subscribeDeclaration("main", tryRegister);
        }
      } catch {
      }
      timer = setInterval(() => {
        if (++attempts > 15) {
          if (timer) clearInterval(timer);
          return;
        }
        tryRegister();
      }, 1e3);
    }
    return () => {
      disposed = true;
      unsubPanel?.();
      unsubMain?.();
      if (timer) clearInterval(timer);
    };
  }, "wiki: sidebar.panellist + main registration");
}
exports.inject = inject;exports.apply = apply;return module.exports;}});
//# sourceMappingURL=index.js.map
