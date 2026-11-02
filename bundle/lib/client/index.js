window.__ModuleLoader__.load({id: "dsh-wiki-rag",factory: (require) => {var module = { exports: {} };var exports = module.exports;Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var inject = ["slots", "locale", "workspaces"];
var NS = "wiki";
var SAMPLE_DOCS = [
  { id: "1", title: "\u9879\u76EE\u603B\u89C8", type: "MD", status: "ready", summary: "\u5E73\u53F0\u5B9A\u4F4D\u4E0E\u6574\u4F53\u67B6\u6784" },
  { id: "2", title: "\u63A5\u5165\u6307\u5357", type: "MD", status: "ready", summary: "\u4E09\u6B65\u5B8C\u6210\u9996\u6B21\u63A5\u5165" },
  { id: "3", title: "API \u53C2\u8003", type: "MD", status: "stale", summary: "\u63A5\u53E3\u5B57\u6BB5\u4E0E\u793A\u4F8B" },
  { id: "4", title: "\u90E8\u7F72\u624B\u518C", type: "PDF", status: "ready", summary: "\u751F\u4EA7\u73AF\u5883\u90E8\u7F72\u6E05\u5355" },
  { id: "5", title: "\u5E38\u89C1\u95EE\u9898 FAQ", type: "MD", status: "error", summary: "\u6700\u8FD1\u4E00\u6B21\u540C\u6B65\u5931\u8D25" }
];
var SAMPLE_MD = {
  "1": "# \u9879\u76EE\u603B\u89C8\n\n## \u5B9A\u4F4D\n\nDeepSeek Harness \u77E5\u8BC6\u5E93\u63D2\u4EF6\uFF0C\u672C\u5730\u4F18\u5148\u7684 Wiki \u98CE\u683C RAG \u7CFB\u7EDF\u3002\n\n## \u6838\u5FC3\u80FD\u529B\n\n- \u591A\u6765\u6E90\u6587\u6863\u5BFC\u5165\n- \u5411\u91CF + \u5173\u952E\u8BCD\u6DF7\u5408\u68C0\u7D22\n- MD \u53EF\u89C6\u5316\u7F16\u8F91\n- \u5FEB\u7167\u5907\u4EFD\n",
  "2": "# \u63A5\u5165\u6307\u5357\n\n## \u7B2C\u4E00\u6B65\n\n\u5B89\u88C5\u63D2\u4EF6\uFF1A\n\n```bash\ndsh plugin add dsh-wiki-rag\n```\n\n## \u7B2C\u4E8C\u6B65\n\n\u91CD\u542F DSH\uFF0C\u5DE6\u4FA7\u680F\u51FA\u73B0\u300C\u77E5\u8BC6\u5E93\u300D\u9762\u677F\u3002\n",
  "3": "# API \u53C2\u8003\n\n### wiki_rag_search\n\n\u68C0\u7D22\u77E5\u8BC6\u5E93\uFF0C\u8FD4\u56DE\u76F8\u5173\u6587\u6863\u7247\u6BB5\u3002\n\n| \u53C2\u6570 | \u7C7B\u578B | \u8BF4\u660E |\n|------|------|------|\n| query | string | \u68C0\u7D22\u8BCD |\n| topK | number | \u8FD4\u56DE\u6761\u6570 |\n"
};
var API_BASE = "http://localhost:3081/api/wiki";
async function apiList() {
  try {
    const res = await fetch(`${API_BASE}/list`);
    if (!res.ok) throw new Error("list failed");
    const data = await res.json();
    return data.map((f) => ({
      id: String(f.id),
      title: f.title || f.source_path?.split("/").pop() || "\u672A\u547D\u540D",
      type: f.kind === "pdf" ? "PDF" : "MD",
      status: f.chunk_count > 0 ? "ready" : "stale",
      summary: f.source_path || ""
    }));
  } catch {
    return SAMPLE_DOCS;
  }
}
async function apiImport(source) {
  await fetch(`${API_BASE}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source })
  });
}
async function apiDelete(id) {
  await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
}
async function apiSearch(query) {
  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK: 10 })
    });
    if (!res.ok) throw new Error("search failed");
    const results = await res.json();
    return results.map((r, i) => ({
      id: String(i),
      title: r.title || `\u7ED3\u679C ${i + 1}`,
      type: "MD",
      status: "ready",
      summary: r.content?.slice(0, 60) || ""
    }));
  } catch {
    return [];
  }
}
function statusStyle(status) {
  if (status === "error") {
    return { label: "\u5F02\u5E38", color: "var(--dsw-alias-state-error-primary)" };
  }
  if (status === "stale") {
    return { label: "\u5F85\u540C\u6B65", color: "var(--dsw-alias-state-warn-primary)" };
  }
  return { label: "\u5DF2\u7D22\u5F15", color: "var(--dsw-alias-state-success-primary)" };
}
function WikiSidebar(props) {
  const { wide, expandSidebar, t } = props;
  const [q, setQ] = (0, import_react.useState)("");
  const [docs, setDocs] = (0, import_react.useState)(SAMPLE_DOCS);
  const [activeId, setActiveId] = (0, import_react.useState)("1");
  const [view, setView] = (0, import_react.useState)("list");
  const [editTab, setEditTab] = (0, import_react.useState)("edit");
  const [mdContent, setMdContent] = (0, import_react.useState)(SAMPLE_MD["1"] ?? "");
  const [showImport, setShowImport] = (0, import_react.useState)(false);
  const [importPath, setImportPath] = (0, import_react.useState)("");
  const [importType, setImportType] = (0, import_react.useState)("file");
  const [noteTitle, setNoteTitle] = (0, import_react.useState)("");
  const [noteContent, setNoteContent] = (0, import_react.useState)("");
  const [showNewMd, setShowNewMd] = (0, import_react.useState)(false);
  const [newMdTitle, setNewMdTitle] = (0, import_react.useState)("");
  const [contextMenu, setContextMenu] = (0, import_react.useState)(null);
  const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
  const [searchResults, setSearchResults] = (0, import_react.useState)(null);
  const [stats, setStats] = (0, import_react.useState)({ total: 0, ready: 0, stale: 0 });
  const [snapshots, setSnapshots] = (0, import_react.useState)([]);
  const [logs, setLogs] = (0, import_react.useState)([]);
  const [expandedFolders, setExpandedFolders] = (0, import_react.useState)(/* @__PURE__ */ new Set(["/"]));
  const [diffModal, setDiffModal] = (0, import_react.useState)(null);
  const [externalNetEnabled, setExternalNetEnabled] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_externalNet") === "true";
    } catch {
      return false;
    }
  });
  (0, import_react.useEffect)(() => {
    apiList().then(setDocs).catch(() => {
    });
    fetch(`${API_BASE}/stats`).then((r) => r.json()).then(setStats).catch(() => {
    });
    fetch(`${API_BASE}/snapshots`).then((r) => r.json()).then(setSnapshots).catch(() => {
    });
    fetch(`${API_BASE}/logs`).then((r) => r.json()).then(setLogs).catch(() => {
    });
  }, []);
  const [embeddingProvider, setEmbeddingProvider] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_embeddingProvider") || "fallback";
    } catch {
      return "fallback";
    }
  });
  const [embeddingModelPath, setEmbeddingModelPath] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_embeddingModelPath") || "";
    } catch {
      return "";
    }
  });
  const [embeddingOpenAIBaseURL, setEmbeddingOpenAIBaseURL] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_embeddingOpenAIBaseURL") || "https://api.openai.com/v1";
    } catch {
      return "https://api.openai.com/v1";
    }
  });
  const [embeddingOpenAIAPIKey, setEmbeddingOpenAIAPIKey] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_embeddingOpenAIAPIKey") || "";
    } catch {
      return "";
    }
  });
  const [embeddingOpenAIModel, setEmbeddingOpenAIModel] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_embeddingOpenAIModel") || "text-embedding-3-small";
    } catch {
      return "text-embedding-3-small";
    }
  });
  const [rerankProvider, setRerankProvider] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_rerankProvider") || "none";
    } catch {
      return "none";
    }
  });
  const [rerankModelPath, setRerankModelPath] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_rerankModelPath") || "";
    } catch {
      return "";
    }
  });
  const [rerankOpenAIBaseURL, setRerankOpenAIBaseURL] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_rerankOpenAIBaseURL") || "https://api.openai.com/v1";
    } catch {
      return "https://api.openai.com/v1";
    }
  });
  const [rerankOpenAIAPIKey, setRerankOpenAIAPIKey] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_rerankOpenAIAPIKey") || "";
    } catch {
      return "";
    }
  });
  const [rerankOpenAIModel, setRerankOpenAIModel] = (0, import_react.useState)(() => {
    try {
      return localStorage.getItem("wiki_rerankOpenAIModel") || "rerank-multilingual-v3";
    } catch {
      return "rerank-multilingual-v3";
    }
  });
  const saveSettings = () => {
    try {
      localStorage.setItem("wiki_embeddingProvider", embeddingProvider);
      localStorage.setItem("wiki_embeddingModelPath", embeddingModelPath);
      localStorage.setItem("wiki_embeddingOpenAIBaseURL", embeddingOpenAIBaseURL);
      localStorage.setItem("wiki_embeddingOpenAIAPIKey", embeddingOpenAIAPIKey);
      localStorage.setItem("wiki_embeddingOpenAIModel", embeddingOpenAIModel);
      localStorage.setItem("wiki_rerankProvider", rerankProvider);
      localStorage.setItem("wiki_rerankModelPath", rerankModelPath);
      localStorage.setItem("wiki_rerankOpenAIBaseURL", rerankOpenAIBaseURL);
      localStorage.setItem("wiki_rerankOpenAIAPIKey", rerankOpenAIAPIKey);
      localStorage.setItem("wiki_rerankOpenAIModel", rerankOpenAIModel);
    } catch {
    }
    setView("list");
  };
  const doImport = async () => {
    try {
      if (importType === "note") {
        if (!noteTitle.trim()) return;
        const newDoc = {
          id: String(Date.now()),
          title: noteTitle.trim(),
          type: "MD",
          status: "ready",
          summary: "\u624B\u52A8\u7B14\u8BB0"
        };
        setDocs([newDoc, ...docs]);
      } else {
        if (!importPath.trim()) return;
        await apiImport(importPath.trim());
        const list = await apiList();
        setDocs(list);
      }
      const s = await fetch(`${API_BASE}/stats`).then((r) => r.json());
      setStats(s);
    } catch {
    }
    setShowImport(false);
    setImportPath("");
    setNoteTitle("");
    setNoteContent("");
  };
  const doDelete = async (id) => {
    try {
      await apiDelete(id);
    } catch {
    }
    setDocs(docs.filter((d) => d.id !== id));
  };
  const doNewMd = () => {
    if (!newMdTitle.trim()) return;
    const newDoc = {
      id: String(Date.now()),
      title: newMdTitle.trim(),
      type: "MD",
      status: "ready",
      summary: "\u65B0\u5EFA\u7A7A\u767D\u6587\u6863"
    };
    setDocs([newDoc, ...docs]);
    setShowNewMd(false);
    setNewMdTitle("");
  };
  const saveEdit = () => {
    setDocs(docs.map(
      (d) => d.id === activeId ? { ...d, summary: mdContent.split("\n").filter((l) => l.trim())[0]?.replace(/^#+\s*/, "").slice(0, 40) || d.summary } : d
    ));
    setView("list");
  };
  const title = t ? t("wiki.title") : "\u77E5\u8BC6\u5E93";
  const placeholder = t ? t("wiki.search") : "\u641C\u7D22\u6587\u6863\u2026";
  if (!wide) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          paddingTop: 8
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "var(--dsw-font-family-brand)"
            },
            children: "W"
          }
        )
      }
    );
  }
  const filtered = searchResults ?? docs.filter((d) => {
    const matchQ = d.title.toLowerCase().includes(q.trim().toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchQ && matchStatus;
  });
  const activeDoc = docs.find((d) => d.id === activeId);
  if (view === "editor" && activeDoc) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "6px 10px",
          color: "var(--dsw-alias-label-primary)",
          fontSize: 14,
          fontFamily: "var(--dsw-font-family)"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: () => setView("list"),
                style: {
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--dsw-alias-label-secondary)",
                  fontSize: 16,
                  padding: 2
                },
                children: "\u2190"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: activeDoc.title }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 4,
              background: "var(--dsw-alias-bg-layer-2)",
              color: "var(--dsw-alias-label-secondary)"
            }, children: activeDoc.type }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
              fontSize: 10,
              color: activeDoc.status === "ready" ? "#22c55e" : activeDoc.status === "stale" ? "#eab308" : "#ef4444"
            }, children: "\u25CF" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: saveEdit,
                style: {
                  height: 26,
                  padding: "0 10px",
                  borderRadius: "var(--dsw-radius-sm)",
                  border: "none",
                  background: "var(--dsw-alias-state-business-primary)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer"
                },
                children: "\u4FDD\u5B58"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2, borderBottom: "1px solid var(--dsw-alias-border-l1)" }, children: ["edit", "preview"].map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              onClick: () => setEditTab(tab),
              style: {
                padding: "6px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                color: editTab === tab ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                borderBottom: editTab === tab ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                fontWeight: editTab === tab ? 600 : 400
              },
              children: tab === "edit" ? "\u7F16\u8F91" : "\u9884\u89C8"
            },
            tab
          )) }),
          editTab === "edit" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              value: mdContent,
              onChange: (e) => setMdContent(e.target.value),
              style: {
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
              }
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              style: {
                flex: 1,
                overflowY: "auto",
                padding: 10,
                borderRadius: "var(--dsw-radius-md)",
                background: "var(--dsw-alias-bg-layer-1)",
                fontSize: 13,
                lineHeight: 1.7
              },
              dangerouslySetInnerHTML: {
                __html: mdContent.replace(/^### (.*)$/gm, '<h4 style="margin:12px 0 4px;font-size:13px;font-weight:600">$1</h4>').replace(/^## (.*)$/gm, '<h3 style="margin:14px 0 6px;font-size:14px;font-weight:600">$1</h3>').replace(/^# (.*)$/gm, '<h2 style="margin:16px 0 8px;font-size:16px;font-weight:700">$1</h2>').replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, '<code style="background:var(--dsw-alias-bg-module-platform);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>').replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--dsw-alias-bg-module-platform);padding:8px;border-radius:4px;overflow-x:auto;font-size:11px"><code>$2</code></pre>').replace(/\| (.*?) \|/g, '<div style="padding:2px 0">$1</div>').replace(/^- (.*)$/gm, '<div style="padding:1px 0">\u2022 $1</div>').replace(/\n/g, "<br/>")
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: "\u7F16\u8F91\u540E\u81EA\u52A8\u5237\u65B0\u5411\u91CF\u7D22\u5F15" })
        ]
      }
    );
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
    const labelStyle = {
      fontSize: 11,
      color: "var(--dsw-alias-label-secondary)",
      marginBottom: 2,
      display: "block"
    };
    const sectionStyle = {
      fontSize: 13,
      fontWeight: 600,
      margin: "8px 0 6px",
      color: "var(--dsw-alias-label-primary)",
      paddingBottom: 4,
      borderBottom: "1px solid var(--dsw-alias-border-l1)"
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "6px 10px",
          color: "var(--dsw-alias-label-primary)",
          fontSize: 14,
          fontFamily: "var(--dsw-font-family)"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: () => setView("list"),
                style: {
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--dsw-alias-label-secondary)",
                  fontSize: 16,
                  padding: 2
                },
                children: "\u2190"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, fontWeight: 600, fontSize: 13 }, children: "\u8BBE\u7F6E" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: saveSettings,
                style: {
                  height: 26,
                  padding: "0 10px",
                  borderRadius: "var(--dsw-radius-sm)",
                  border: "none",
                  background: "var(--dsw-alias-state-business-primary)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer"
                },
                children: "\u4FDD\u5B58"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: sectionStyle, children: "Embedding \u5D4C\u5165\u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "Provider" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  value: embeddingProvider,
                  onChange: (e) => setEmbeddingProvider(e.target.value),
                  style: inputStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "fallback", children: "Fallback\uFF08\u54C8\u5E0C\u964D\u7EA7\uFF0C\u9ED8\u8BA4\uFF09" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "local", children: "Local\uFF08\u672C\u5730 ONNX \u6A21\u578B\uFF09" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "openai", children: "OpenAI \u517C\u5BB9 API" })
                  ]
                }
              )
            ] }),
            embeddingProvider === "local" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "\u672C\u5730\u6A21\u578B\u76EE\u5F55\u8DEF\u5F84" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  value: embeddingModelPath,
                  onChange: (e) => setEmbeddingModelPath(e.target.value),
                  placeholder: "/models/bge-small-zh-v1.5",
                  style: inputStyle
                }
              )
            ] }),
            embeddingProvider === "openai" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "API Base URL" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: embeddingOpenAIBaseURL,
                    onChange: (e) => setEmbeddingOpenAIBaseURL(e.target.value),
                    placeholder: "https://api.openai.com/v1",
                    style: inputStyle
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "API Key" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "password",
                    value: embeddingOpenAIAPIKey,
                    onChange: (e) => setEmbeddingOpenAIAPIKey(e.target.value),
                    placeholder: "sk-...",
                    style: inputStyle
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "\u6A21\u578B\u540D" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: embeddingOpenAIModel,
                    onChange: (e) => setEmbeddingOpenAIModel(e.target.value),
                    placeholder: "text-embedding-3-small",
                    style: inputStyle
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: sectionStyle, children: "Rerank \u91CD\u6392\u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "Provider" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  value: rerankProvider,
                  onChange: (e) => setRerankProvider(e.target.value),
                  style: inputStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "none", children: "None\uFF08\u4E0D\u91CD\u6392\uFF0C\u9ED8\u8BA4\uFF09" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "local", children: "Local\uFF08\u672C\u5730 cross-encoder\uFF09" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "openai", children: "OpenAI \u517C\u5BB9 API" })
                  ]
                }
              )
            ] }),
            rerankProvider === "local" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "\u672C\u5730\u6A21\u578B\u76EE\u5F55\u8DEF\u5F84" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  value: rerankModelPath,
                  onChange: (e) => setRerankModelPath(e.target.value),
                  placeholder: "/models/bge-reranker-v2-m3",
                  style: inputStyle
                }
              )
            ] }),
            rerankProvider === "openai" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "API Base URL" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: rerankOpenAIBaseURL,
                    onChange: (e) => setRerankOpenAIBaseURL(e.target.value),
                    placeholder: "https://api.openai.com/v1",
                    style: inputStyle
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "API Key" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "password",
                    value: rerankOpenAIAPIKey,
                    onChange: (e) => setRerankOpenAIAPIKey(e.target.value),
                    placeholder: "sk-...",
                    style: inputStyle
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: labelStyle, children: "\u6A21\u578B\u540D" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: rerankOpenAIModel,
                    onChange: (e) => setRerankOpenAIModel(e.target.value),
                    placeholder: "rerank-multilingual-v3",
                    style: inputStyle
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l4)" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, fontWeight: 500 }, children: "\u5916\u7F51\u7F51\u9875\u6293\u53D6" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }, children: "\u5141\u8BB8\u5BFC\u5165\u5916\u7F51 URL\uFF08\u5173\u95ED\u540E\u4EC5\u5141\u8BB8\u5185\u7F51\uFF09" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: () => {
                  const v = !externalNetEnabled;
                  setExternalNetEnabled(v);
                  try {
                    localStorage.setItem("wiki_externalNet", String(v));
                  } catch {
                  }
                },
                style: {
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  background: externalNetEnabled ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-bg-layer-2)",
                  position: "relative",
                  transition: "background 0.2s"
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: externalNetEnabled ? 18 : 2,
                  transition: "left 0.2s"
                } })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }, children: "\u4FDD\u5B58\u540E\u9700\u91CD\u542F DSH \u751F\u6548" })
        ]
      }
    );
  }
  if (view === "snapshots") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: fullRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: () => setView("list"),
            style: {
              height: 26,
              padding: "0 10px",
              borderRadius: "var(--dsw-radius-sm)",
              border: "1px solid var(--dsw-alias-border-l4)",
              background: "transparent",
              color: "var(--dsw-alias-label-primary)",
              fontSize: 12,
              cursor: "pointer"
            },
            children: "\u2190 \u8FD4\u56DE"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14 }, children: "\u5FEB\u7167\u7BA1\u7406" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: async () => {
              await fetch(`${API_BASE}/snapshots`, { method: "POST" });
              const snaps = await fetch(`${API_BASE}/snapshots`).then((r) => r.json());
              setSnapshots(snaps);
            },
            style: {
              height: 26,
              padding: "0 10px",
              borderRadius: "var(--dsw-radius-sm)",
              border: "none",
              background: "var(--dsw-alias-state-business-primary)",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer"
            },
            children: "+ \u65B0\u5EFA"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" }, children: snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "24px 8px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 24, marginBottom: 8 }, children: "\u{1F4F8}" }),
        "\u6682\u65E0\u5FEB\u7167"
      ] }) : snapshots.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "8px 10px", borderRadius: "var(--dsw-radius-md)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 13, fontWeight: 500 }, children: [
            "#",
            s.id,
            " ",
            s.note || "\u624B\u52A8\u5FEB\u7167"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 }, children: new Date(s.created_at).toLocaleString() })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: async () => {
              await fetch(`${API_BASE}/snapshots/${s.id}/restore`, { method: "POST" });
              const list = await apiList();
              setDocs(list);
            },
            style: {
              height: 24,
              padding: "0 8px",
              borderRadius: "var(--dsw-radius-sm)",
              border: "1px solid var(--dsw-alias-border-l4)",
              background: "transparent",
              color: "var(--dsw-alias-label-primary)",
              fontSize: 11,
              cursor: "pointer"
            },
            children: "\u6062\u590D"
          }
        )
      ] }) }, s.id)) })
    ] });
  }
  if (view === "logs") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: fullRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setView("list"), style: { height: 26, padding: "0 10px", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "transparent", color: "var(--dsw-alias-label-primary)", fontSize: 12, cursor: "pointer" }, children: "\u2190 \u8FD4\u56DE" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14 }, children: "\u5BA1\u8BA1\u65E5\u5FD7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 60 } })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" }, children: logs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "24px 8px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 24, marginBottom: 8 }, children: "\u{1F4CB}" }),
        "\u6682\u65E0\u65E5\u5FD7"
      ] }) : logs.map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "6px 10px", borderRadius: "var(--dsw-radius-sm)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l4)", fontSize: 11 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: l.time }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 2 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: l.action }),
          " \xB7 ",
          l.detail
        ] })
      ] }, i)) })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "6px 10px",
        color: "var(--dsw-alias-label-primary)",
        fontSize: 14,
        fontFamily: "var(--dsw-font-family)"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 2px 0"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14 }, children: title }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 2 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: "\u5BFC\u5165",
                    onClick: () => setShowImport(!showImport),
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "+"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: "\u65B0\u5EFA MD",
                    onClick: () => setShowNewMd(!showNewMd),
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "\u270F\uFE0F"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: t ? t("wiki.refresh") : "\u5237\u65B0",
                    onClick: async () => {
                      const list = await apiList();
                      setDocs(list);
                    },
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "\u27F3"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: "\u5FEB\u7167",
                    onClick: () => setView("snapshots"),
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "\u{1F4F8}"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: "\u65E5\u5FD7",
                    onClick: () => setView("logs"),
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "\u{1F4CB}"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    title: t ? t("wiki.settings") : "\u8BBE\u7F6E",
                    onClick: () => setView("settings"),
                    style: {
                      width: 24,
                      height: 24,
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: 13
                    },
                    children: "\u2699\uFE0F"
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            value: q,
            onChange: (e) => {
              setQ(e.target.value);
              if (!e.target.value.trim()) setSearchResults(null);
            },
            onKeyDown: async (e) => {
              if (e.key === "Enter" && q.trim()) {
                const results = await apiSearch(q.trim());
                setSearchResults(results);
              }
            },
            placeholder,
            style: {
              height: 32,
              padding: "0 10px",
              boxSizing: "border-box",
              borderRadius: "var(--dsw-radius-md)",
              border: "1px solid var(--dsw-alias-border-l4)",
              background: "var(--dsw-alias-bg-layer-1)",
              color: "var(--dsw-alias-label-primary)",
              outline: "none",
              fontSize: 13
            }
          }
        ),
        showNewMd && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: newMdTitle,
              onChange: (e) => setNewMdTitle(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && doNewMd(),
              placeholder: "\u8F93\u5165\u65B0\u6587\u6863\u6807\u9898\u2026",
              autoFocus: true,
              style: { flex: 1, height: 28, padding: "0 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 12 }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: doNewMd, style: { height: 28, padding: "0 8px", borderRadius: "var(--dsw-radius-sm)", border: "none", background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 11, cursor: "pointer" }, children: "\u65B0\u5EFA" })
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
          importType !== "note" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: importPath,
              onChange: (e) => setImportPath(e.target.value),
              placeholder: importType === "url" ? "https://example.com/article" : "\u8F93\u5165\u6587\u4EF6\u8DEF\u5F84\u2026",
              style: { height: 28, padding: "0 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-0)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 12 }
            }
          ),
          importType === "note" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                value: noteTitle,
                onChange: (e) => setNoteTitle(e.target.value),
                placeholder: "\u7B14\u8BB0\u6807\u9898\u2026",
                style: { height: 28, padding: "0 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-0)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 12 }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                value: noteContent,
                onChange: (e) => setNoteContent(e.target.value),
                placeholder: "\u7B14\u8BB0\u5185\u5BB9\u2026",
                rows: 3,
                style: { padding: "6px 8px", boxSizing: "border-box", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "var(--dsw-alias-bg-layer-0)", color: "var(--dsw-alias-label-primary)", outline: "none", fontSize: 12, resize: "vertical" }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: doImport, style: { height: 28, borderRadius: "var(--dsw-radius-sm)", border: "none", background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 11, cursor: "pointer" }, children: "\u5BFC\u5165" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 2 }, children: [
          ["all", "\u5168\u90E8"],
          ["ready", "\u5DF2\u7D22\u5F15"],
          ["stale", "\u5F85\u540C\u6B65"],
          ["error", "\u5F02\u5E38"]
        ].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            onClick: () => setStatusFilter(key),
            style: {
              flex: 1,
              padding: "3px 0",
              border: "none",
              cursor: "pointer",
              borderRadius: "var(--dsw-radius-sm)",
              fontSize: 11,
              background: statusFilter === key ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
              color: statusFilter === key ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
              fontWeight: statusFilter === key ? 600 : 400
            },
            children: label
          },
          key
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }, children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              padding: "24px 8px",
              textAlign: "center",
              color: "var(--dsw-alias-label-tertiary)",
              fontSize: 12
            },
            children: docs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 24, marginBottom: 8 }, children: "\u{1F4DA}" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "\u77E5\u8BC6\u5E93\u4E3A\u7A7A" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4, fontSize: 11 }, children: "\u70B9\u53F3\u4E0A\u89D2 + \u5BFC\u5165\u7B2C\u4E00\u4E2A\u6587\u6863" })
            ] }) : "\u65E0\u5339\u914D\u6587\u6863"
          }
        ) : filtered.map((d) => {
          const st = statusStyle(d.status);
          const active = d.id === activeId;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              onClick: () => {
                setActiveId(d.id);
                setMdContent(SAMPLE_MD[d.id] ?? "# " + d.title + "\n\n\u6682\u65E0\u5185\u5BB9\n");
                setView("editor");
              },
              onContextMenu: (e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, docId: d.id });
              },
              style: {
                padding: "8px 10px",
                borderRadius: "var(--dsw-radius-md)",
                cursor: "pointer",
                background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
                borderLeft: active ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent"
              },
              onMouseEnter: (e) => {
                if (!active) e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent";
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "span",
                    {
                      style: {
                        fontSize: 10,
                        padding: "1px 5px",
                        borderRadius: "var(--dsw-radius-sm)",
                        background: "var(--dsw-alias-bg-module-platform)",
                        color: "var(--dsw-alias-label-secondary)",
                        flexShrink: 0
                      },
                      children: d.type
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "span",
                    {
                      style: {
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                        fontWeight: active ? 600 : 500
                      },
                      children: d.title
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "div",
                  {
                    style: {
                      marginTop: 3,
                      fontSize: 11,
                      color: "var(--dsw-alias-label-tertiary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    },
                    children: d.summary
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 4, fontSize: 11, color: st.color, display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u25CF ",
                    st.label
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      onClick: (e) => {
                        e.stopPropagation();
                        doDelete(d.id);
                      },
                      style: {
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--dsw-alias-label-tertiary)",
                        fontSize: 12,
                        padding: 0
                      },
                      children: "\u2715"
                    }
                  )
                ] })
              ]
            },
            d.id
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "6px 2px 0",
              borderTop: "1px solid var(--dsw-alias-border-l1)",
              fontSize: 11,
              color: "var(--dsw-alias-label-tertiary)"
            },
            children: [
              "\u5171 ",
              stats.total || docs.length,
              " \u6761 \xB7 \u5DF2\u7D22\u5F15 ",
              stats.ready || docs.filter((d) => d.status === "ready").length
            ]
          }
        ),
        contextMenu && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            onClick: () => setContextMenu(null),
            onContextMenu: (e) => {
              e.preventDefault();
              setContextMenu(null);
            },
            style: { position: "fixed", inset: 0, zIndex: 998 },
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  position: "fixed",
                  left: contextMenu.x,
                  top: contextMenu.y,
                  background: "var(--dsw-alias-bg-layer-1)",
                  borderRadius: "var(--dsw-radius-md)",
                  border: "1px solid var(--dsw-alias-border-l4)",
                  padding: 4,
                  minWidth: 140,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "div",
                    {
                      onClick: async () => {
                        setDiffModal({ old: "\u65E7\u5185\u5BB9\u793A\u4F8B\n...", new: "\u65B0\u5185\u5BB9\u793A\u4F8B\n...", title: "\u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0" });
                        setContextMenu(null);
                      },
                      style: { padding: "6px 10px", fontSize: 12, cursor: "pointer", borderRadius: 4 },
                      onMouseEnter: (e) => e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)",
                      onMouseLeave: (e) => e.currentTarget.style.background = "transparent",
                      children: "\u{1F504} \u4ECE\u6E90\u76EE\u5F55\u66F4\u65B0"
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "div",
                    {
                      onClick: () => {
                        doDelete(contextMenu.docId);
                        setContextMenu(null);
                      },
                      style: { padding: "6px 10px", fontSize: 12, cursor: "pointer", borderRadius: 4, color: "#ef4444" },
                      onMouseEnter: (e) => e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)",
                      onMouseLeave: (e) => e.currentTarget.style.background = "transparent",
                      children: "\u{1F5D1} \u5220\u9664\u6587\u6863"
                    }
                  )
                ]
              }
            )
          }
        ),
        diffModal && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999
        }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
          width: "90%",
          maxWidth: 500,
          maxHeight: "80vh",
          background: "var(--dsw-alias-bg-layer-1)",
          borderRadius: "var(--dsw-radius-lg)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, fontSize: 14 }, children: [
            "\u53D8\u66F4\u786E\u8BA4\uFF1A",
            diffModal.title
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, overflow: "auto", fontSize: 12, fontFamily: "monospace" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ef4444", marginBottom: 4 }, children: "\u2212 \u65E7\u7248\u672C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: { margin: "0 0 12px 0", whiteSpace: "pre-wrap" }, children: diffModal.old }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#22c55e", marginBottom: 4 }, children: "+ \u65B0\u7248\u672C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: { margin: 0, whiteSpace: "pre-wrap" }, children: diffModal.new })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setDiffModal(null), style: { height: 28, padding: "0 12px", borderRadius: "var(--dsw-radius-sm)", border: "1px solid var(--dsw-alias-border-l4)", background: "transparent", color: "var(--dsw-alias-label-primary)", fontSize: 12, cursor: "pointer" }, children: "\u62D2\u7EDD" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => setDiffModal(null), style: { height: 28, padding: "0 12px", borderRadius: "var(--dsw-radius-sm)", border: "none", background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 12, cursor: "pointer" }, children: "\u63A5\u53D7" })
          ] })
        ] }) })
      ]
    }
  );
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(NS, {
      zh: {
        "wiki.title": "\u77E5\u8BC6\u5E93",
        "wiki.search": "\u641C\u7D22\u6587\u6863\u2026",
        "wiki.refresh": "\u5237\u65B0",
        "wiki.settings": "\u8BBE\u7F6E"
      },
      en: {
        "wiki.title": "Wiki",
        "wiki.search": "Search docs\u2026",
        "wiki.refresh": "Refresh",
        "wiki.settings": "Settings"
      }
    }),
    "wiki: dictionaries"
  );
  ctx.effect(
    () => {
      let disposed = false;
      let unsub;
      let timer;
      let disposeRegister;
      let attempts = 0;
      const tryRegister = () => {
        if (disposed || disposeRegister) return;
        let declared;
        try {
          declared = ctx.slots && typeof ctx.slots.spec === "function" ? ctx.slots.spec("sidebar.workspaces") : void 0;
        } catch {
          return;
        }
        if (!declared) return;
        try {
          unsub?.();
          unsub = void 0;
          if (timer) {
            clearInterval(timer);
            timer = void 0;
          }
          disposeRegister = ctx.slots.register(
            {
              name: "sidebar.workspaces",
              locale: NS,
              registrant: "dsh-wiki-rag",
              // 内置 ui-workspace 已在 priority 0 占据本 single 槽；
              // single 槽按 priority 升序、"lowest renders"（最小 priority 实际渲染）。
              // 传 -1 与其错开避免同优先级冲突，并排在前成为实际渲染者，shadow 内置实现。
              priority: -1
            },
            WikiSidebar
          );
        } catch (e) {
          console.warn("[dsh-wiki-rag] slots.register failed:", e);
        }
      };
      tryRegister();
      if (!disposeRegister) {
        try {
          if (typeof ctx.slots?.subscribeDeclaration === "function") {
            unsub = ctx.slots.subscribeDeclaration("sidebar.workspaces", tryRegister);
          }
        } catch {
        }
        timer = setInterval(() => {
          attempts += 1;
          tryRegister();
          if (!disposeRegister && attempts > 150) {
            if (timer) {
              clearInterval(timer);
              timer = void 0;
            }
            try {
              unsub?.();
            } catch {
            }
            unsub = void 0;
          }
        }, 100);
      }
      return () => {
        disposed = true;
        try {
          unsub?.();
        } catch {
        }
        if (timer) clearInterval(timer);
        try {
          disposeRegister?.();
        } catch {
        }
      };
    },
    "wiki: sidebar.workspaces registration"
  );
}
exports.inject = inject;exports.apply = apply;return module.exports;}});
//# sourceMappingURL=index.js.map
