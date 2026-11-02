/**
 * dsh-wiki-rag 客户端插件（DSH Web 浏览器侧）
 *
 * 形态：经 window.__ModuleLoader__.load 包裹后由 DSH 客户端 loader 加载，
 * 导出 cordis 插件契约 exports.apply / exports.inject。
 *
 * 落地槽位：sidebar.workspaces（single/root，owner props { wide, expandSidebar }），
 * 即左栏「侧栏浏览面板」。本组件接管该浏览区，渲染 wiki 知识库管理 UI。
 * 样式一律消费宿主已全局注入的 --dsw-* 设计令牌（明暗主题自动跟随）。
 *
 * 说明：本文件为普通 TS/TSX 源码，不 import cordis/slots 实体类型（用 any 最小类型），
 * esbuild 不做类型检查；React / jsx-runtime 由宿主外部化提供。
 */
import { useState } from "react";

/** cordis 插件依赖的服务名（运行时由客户端 runtime 注入到 ctx）。 */
export const inject = ["slots", "locale", "workspaces"];

const NS = "wiki";

/** 内置示例文档（真实数据后续经宿主 tool / 拉取接入）。 */
interface WikiDoc {
  id: string;
  title: string;
  type: string; // 文件类型徽章文案
  status: "ready" | "stale" | "error";
  summary: string;
}

const SAMPLE_DOCS: WikiDoc[] = [
  { id: "1", title: "项目总览", type: "MD", status: "ready", summary: "平台定位与整体架构" },
  { id: "2", title: "接入指南", type: "MD", status: "ready", summary: "三步完成首次接入" },
  { id: "3", title: "API 参考", type: "MD", status: "stale", summary: "接口字段与示例" },
  { id: "4", title: "部署手册", type: "PDF", status: "ready", summary: "生产环境部署清单" },
  { id: "5", title: "常见问题 FAQ", type: "MD", status: "error", summary: "最近一次同步失败" },
];

/** 示例 MD 内容（编辑器用）。 */
const SAMPLE_MD: Record<string, string> = {
  "1": "# 项目总览\n\n## 定位\n\nDeepSeek Harness 知识库插件，本地优先的 Wiki 风格 RAG 系统。\n\n## 核心能力\n\n- 多来源文档导入\n- 向量 + 关键词混合检索\n- MD 可视化编辑\n- 快照备份\n",
  "2": "# 接入指南\n\n## 第一步\n\n安装插件：\n\n```bash\ndsh plugin add dsh-wiki-rag\n```\n\n## 第二步\n\n重启 DSH，左侧栏出现「知识库」面板。\n",
  "3": "# API 参考\n\n### wiki_rag_search\n\n检索知识库，返回相关文档片段。\n\n| 参数 | 类型 | 说明 |\n|------|------|------|\n| query | string | 检索词 |\n| topK | number | 返回条数 |\n",
};

interface WikiSidebarProps {
  wide: boolean; // owner：侧栏是否展开（否则 56px 图标 rail）
  expandSidebar: () => void; // owner：收起态请求展开
  t?: (key: string, params?: Record<string, unknown>) => string; // locale 股
}

function statusStyle(status: WikiDoc["status"]): { label: string; color: string } {
  if (status === "error") {
    return { label: "异常", color: "var(--dsw-alias-state-error-primary)" };
  }
  if (status === "stale") {
    return { label: "待同步", color: "var(--dsw-alias-state-warn-primary)" };
  }
  return { label: "已索引", color: "var(--dsw-alias-state-success-primary)" };
}

function WikiSidebar(props: WikiSidebarProps) {
  const { wide, expandSidebar, t } = props;
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<WikiDoc[]>(SAMPLE_DOCS);
  const [activeId, setActiveId] = useState<string>("1");
  const [view, setView] = useState<"list" | "editor" | "settings">("list");
  const [editTab, setEditTab] = useState<"edit" | "preview">("edit");
  const [mdContent, setMdContent] = useState<string>(SAMPLE_MD["1"] ?? "");
  const [showImport, setShowImport] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "stale" | "error">("all");

  // 设置表单状态（从 localStorage 加载）
  const [embeddingProvider, setEmbeddingProvider] = useState<"local" | "openai" | "fallback">(() => {
    try { return (localStorage.getItem("wiki_embeddingProvider") as any) || "fallback"; } catch { return "fallback"; }
  });
  const [embeddingModelPath, setEmbeddingModelPath] = useState(() => {
    try { return localStorage.getItem("wiki_embeddingModelPath") || ""; } catch { return ""; }
  });
  const [embeddingOpenAIBaseURL, setEmbeddingOpenAIBaseURL] = useState(() => {
    try { return localStorage.getItem("wiki_embeddingOpenAIBaseURL") || "https://api.openai.com/v1"; } catch { return "https://api.openai.com/v1"; }
  });
  const [embeddingOpenAIAPIKey, setEmbeddingOpenAIAPIKey] = useState(() => {
    try { return localStorage.getItem("wiki_embeddingOpenAIAPIKey") || ""; } catch { return ""; }
  });
  const [embeddingOpenAIModel, setEmbeddingOpenAIModel] = useState(() => {
    try { return localStorage.getItem("wiki_embeddingOpenAIModel") || "text-embedding-3-small"; } catch { return "text-embedding-3-small"; }
  });
  const [rerankProvider, setRerankProvider] = useState<"local" | "openai" | "none">(() => {
    try { return (localStorage.getItem("wiki_rerankProvider") as any) || "none"; } catch { return "none"; }
  });
  const [rerankModelPath, setRerankModelPath] = useState(() => {
    try { return localStorage.getItem("wiki_rerankModelPath") || ""; } catch { return ""; }
  });
  const [rerankOpenAIBaseURL, setRerankOpenAIBaseURL] = useState(() => {
    try { return localStorage.getItem("wiki_rerankOpenAIBaseURL") || "https://api.openai.com/v1"; } catch { return "https://api.openai.com/v1"; }
  });
  const [rerankOpenAIAPIKey, setRerankOpenAIAPIKey] = useState(() => {
    try { return localStorage.getItem("wiki_rerankOpenAIAPIKey") || ""; } catch { return ""; }
  });
  const [rerankOpenAIModel, setRerankOpenAIModel] = useState(() => {
    try { return localStorage.getItem("wiki_rerankOpenAIModel") || "rerank-multilingual-v3"; } catch { return "rerank-multilingual-v3"; }
  });

  // 保存设置到 localStorage
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
    } catch { /* ignore */ }
    setView("list");
  };

  // 导入新文档
  const doImport = () => {
    if (!importPath.trim()) return;
    const newDoc: WikiDoc = {
      id: String(Date.now()),
      title: importPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "新文档",
      type: importPath.endsWith(".pdf") ? "PDF" : "MD",
      status: "ready",
      summary: "新导入",
    };
    setDocs([newDoc, ...docs]);
    setShowImport(false);
    setImportPath("");
  };

  // 删除文档
  const doDelete = (id: string) => {
    setDocs(docs.filter((d) => d.id !== id));
  };

  // 保存编辑内容
  const saveEdit = () => {
    setDocs(docs.map((d) =>
      d.id === activeId
        ? { ...d, summary: mdContent.split("\n").filter((l) => l.trim())[0]?.replace(/^#+\s*/, "").slice(0, 40) || d.summary }
        : d
    ));
    setView("list");
  };

  const title = t ? t("wiki.title") : "知识库";
  const placeholder = t ? t("wiki.search") : "搜索文档…";

  // 收起 rail：只渲染一个可点击的圆形图标按钮（与官方 SidebarRoot rail 行为一致）
  if (!wide) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          paddingTop: 8,
        }}
      >
        <button
          title={title}
          onClick={expandSidebar}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--dsw-alias-label-secondary)",
            fontSize: 16,
            fontWeight: 600,
            fontFamily: "var(--dsw-font-family-brand)",
          }}
        >
          W
        </button>
      </div>
    );
  }

  const filtered = docs.filter((d) => {
    const matchQ = d.title.toLowerCase().includes(q.trim().toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchQ && matchStatus;
  });
  const activeDoc = docs.find((d) => d.id === activeId);

  // ---------- 编辑器视图 ----------
  if (view === "editor" && activeDoc) {
    return (
      <div
        style={{
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "6px 10px",
          color: "var(--dsw-alias-label-primary)",
          fontSize: 14,
          fontFamily: "var(--dsw-font-family)",
        }}
      >
        {/* 头部：返回 + 标题 + 保存 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setView("list")}
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              color: "var(--dsw-alias-label-secondary)", fontSize: 16, padding: 2,
            }}
          >
            ←
          </button>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeDoc.title}
          </span>
          <button
            onClick={saveEdit}
            style={{
              height: 26, padding: "0 10px", borderRadius: "var(--dsw-radius-sm)",
              border: "none", background: "var(--dsw-alias-state-business-primary)",
              color: "#fff", fontSize: 12, cursor: "pointer",
            }}
          >
            保存
          </button>
        </div>

        {/* Tab 切换：编辑 / 预览 */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--dsw-alias-border-l1)" }}>
          {(["edit", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setEditTab(tab)}
              style={{
                padding: "6px 12px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: 12, color: editTab === tab
                  ? "var(--dsw-alias-state-business-primary)"
                  : "var(--dsw-alias-label-secondary)",
                borderBottom: editTab === tab ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                fontWeight: editTab === tab ? 600 : 400,
              }}
            >
              {tab === "edit" ? "编辑" : "预览"}
            </button>
          ))}
        </div>

        {/* 编辑区 */}
        {editTab === "edit" ? (
          <textarea
            value={mdContent}
            onChange={(e) => setMdContent(e.target.value)}
            style={{
              flex: 1, width: "100%", boxSizing: "border-box", resize: "none",
              padding: 10, borderRadius: "var(--dsw-radius-md)",
              border: "1px solid var(--dsw-alias-border-l4)",
              background: "var(--dsw-alias-bg-layer-1)",
              color: "var(--dsw-alias-label-primary)",
              fontFamily: "var(--dsw-font-family-mono, monospace)",
              fontSize: 12, lineHeight: 1.6, outline: "none",
            }}
          />
        ) : (
          <div
            style={{
              flex: 1, overflowY: "auto", padding: 10,
              borderRadius: "var(--dsw-radius-md)",
              background: "var(--dsw-alias-bg-layer-1)",
              fontSize: 13, lineHeight: 1.7,
            }}
            dangerouslySetInnerHTML={{
              __html: mdContent
                .replace(/^### (.*)$/gm, '<h4 style="margin:12px 0 4px;font-size:13px;font-weight:600">$1</h4>')
                .replace(/^## (.*)$/gm, '<h3 style="margin:14px 0 6px;font-size:14px;font-weight:600">$1</h3>')
                .replace(/^# (.*)$/gm, '<h2 style="margin:16px 0 8px;font-size:16px;font-weight:700">$1</h2>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code style="background:var(--dsw-alias-bg-module-platform);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
                .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--dsw-alias-bg-module-platform);padding:8px;border-radius:4px;overflow-x:auto;font-size:11px"><code>$2</code></pre>')
                .replace(/\| (.*?) \|/g, '<div style="padding:2px 0">$1</div>')
                .replace(/^- (.*)$/gm, '<div style="padding:1px 0">• $1</div>')
                .replace(/\n/g, '<br/>'),
            }}
          />
        )}

        {/* 底部提示 */}
        <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>
          编辑后自动刷新向量索引
        </div>
      </div>
    );
  }

  // ---------- 设置视图 ----------
  if (view === "settings") {
    const inputStyle: React.CSSProperties = {
      height: 30, padding: "0 8px", boxSizing: "border-box",
      borderRadius: "var(--dsw-radius-sm)",
      border: "1px solid var(--dsw-alias-border-l4)",
      background: "var(--dsw-alias-bg-layer-1)",
      color: "var(--dsw-alias-label-primary)",
      outline: "none", fontSize: 12, width: "100%",
    };
    const labelStyle: React.CSSProperties = {
      fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginBottom: 2, display: "block",
    };
    const sectionStyle: React.CSSProperties = {
      fontSize: 13, fontWeight: 600, margin: "8px 0 6px",
      color: "var(--dsw-alias-label-primary)",
      paddingBottom: 4, borderBottom: "1px solid var(--dsw-alias-border-l1)",
    };

    return (
      <div
        style={{
          height: "100%", boxSizing: "border-box", display: "flex",
          flexDirection: "column", gap: 8, padding: "6px 10px",
          color: "var(--dsw-alias-label-primary)", fontSize: 14,
          fontFamily: "var(--dsw-font-family)",
        }}
      >
        {/* 头部：返回 + 标题 + 保存 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setView("list")}
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              color: "var(--dsw-alias-label-secondary)", fontSize: 16, padding: 2,
            }}
          >
            ←
          </button>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>设置</span>
          <button
            onClick={saveSettings}
            style={{
              height: 26, padding: "0 10px", borderRadius: "var(--dsw-radius-sm)",
              border: "none", background: "var(--dsw-alias-state-business-primary)",
              color: "#fff", fontSize: 12, cursor: "pointer",
            }}
          >
            保存
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* ---- Embedding 配置 ---- */}
          <div style={sectionStyle}>Embedding 嵌入模型</div>

          <div>
            <label style={labelStyle}>Provider</label>
            <select
              value={embeddingProvider}
              onChange={(e) => setEmbeddingProvider(e.target.value as any)}
              style={inputStyle}
            >
              <option value="fallback">Fallback（哈希降级，默认）</option>
              <option value="local">Local（本地 ONNX 模型）</option>
              <option value="openai">OpenAI 兼容 API</option>
            </select>
          </div>

          {embeddingProvider === "local" && (
            <div>
              <label style={labelStyle}>本地模型目录路径</label>
              <input
                value={embeddingModelPath}
                onChange={(e) => setEmbeddingModelPath(e.target.value)}
                placeholder="/models/bge-small-zh-v1.5"
                style={inputStyle}
              />
            </div>
          )}

          {embeddingProvider === "openai" && (
            <>
              <div>
                <label style={labelStyle}>API Base URL</label>
                <input
                  value={embeddingOpenAIBaseURL}
                  onChange={(e) => setEmbeddingOpenAIBaseURL(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>API Key</label>
                <input
                  type="password"
                  value={embeddingOpenAIAPIKey}
                  onChange={(e) => setEmbeddingOpenAIAPIKey(e.target.value)}
                  placeholder="sk-..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>模型名</label>
                <input
                  value={embeddingOpenAIModel}
                  onChange={(e) => setEmbeddingOpenAIModel(e.target.value)}
                  placeholder="text-embedding-3-small"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* ---- Rerank 配置 ---- */}
          <div style={sectionStyle}>Rerank 重排模型</div>

          <div>
            <label style={labelStyle}>Provider</label>
            <select
              value={rerankProvider}
              onChange={(e) => setRerankProvider(e.target.value as any)}
              style={inputStyle}
            >
              <option value="none">None（不重排，默认）</option>
              <option value="local">Local（本地 cross-encoder）</option>
              <option value="openai">OpenAI 兼容 API</option>
            </select>
          </div>

          {rerankProvider === "local" && (
            <div>
              <label style={labelStyle}>本地模型目录路径</label>
              <input
                value={rerankModelPath}
                onChange={(e) => setRerankModelPath(e.target.value)}
                placeholder="/models/bge-reranker-v2-m3"
                style={inputStyle}
              />
            </div>
          )}

          {rerankProvider === "openai" && (
            <>
              <div>
                <label style={labelStyle}>API Base URL</label>
                <input
                  value={rerankOpenAIBaseURL}
                  onChange={(e) => setRerankOpenAIBaseURL(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>API Key</label>
                <input
                  type="password"
                  value={rerankOpenAIAPIKey}
                  onChange={(e) => setRerankOpenAIAPIKey(e.target.value)}
                  placeholder="sk-..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>模型名</label>
                <input
                  value={rerankOpenAIModel}
                  onChange={(e) => setRerankOpenAIModel(e.target.value)}
                  placeholder="rerank-multilingual-v3"
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>

        {/* 底部提示 */}
        <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>
          保存后需重启 DSH 生效
        </div>
      </div>
    );
  }

  // ---------- 列表视图 ----------

  return (
    <div
      style={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "6px 10px",
        color: "var(--dsw-alias-label-primary)",
        fontSize: 14,
        fontFamily: "var(--dsw-font-family)",
      }}
    >
      {/* 头部：标题 + 刷新按钮 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 2px 0",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            title="导入"
            onClick={() => setShowImport(!showImport)}
            style={{
              width: 24, height: 24, border: "none", borderRadius: 6,
              background: "transparent", cursor: "pointer",
              color: "var(--dsw-alias-label-secondary)", fontSize: 13,
            }}
          >
            +
          </button>
          <button
            title={t ? t("wiki.refresh") : "刷新"}
            onClick={() => {}}
            style={{
              width: 24, height: 24, border: "none", borderRadius: 6,
              background: "transparent", cursor: "pointer",
              color: "var(--dsw-alias-label-secondary)", fontSize: 13,
            }}
          >
            ⟳
          </button>
          <button
            title={t ? t("wiki.settings") : "设置"}
            onClick={() => setView("settings")}
            style={{
              width: 24, height: 24, border: "none", borderRadius: 6,
              background: "transparent", cursor: "pointer",
              color: "var(--dsw-alias-label-secondary)", fontSize: 13,
            }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 32,
          padding: "0 10px",
          boxSizing: "border-box",
          borderRadius: "var(--dsw-radius-md)",
          border: "1px solid var(--dsw-alias-border-l4)",
          background: "var(--dsw-alias-bg-layer-1)",
          color: "var(--dsw-alias-label-primary)",
          outline: "none",
          fontSize: 13,
        }}
      />

      {/* 导入输入框（点 + 展开） */}
      {showImport && (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="输入文件路径或 URL…"
            style={{
              flex: 1, height: 28, padding: "0 8px", boxSizing: "border-box",
              borderRadius: "var(--dsw-radius-sm)",
              border: "1px solid var(--dsw-alias-border-l4)",
              background: "var(--dsw-alias-bg-layer-1)",
              color: "var(--dsw-alias-label-primary)",
              outline: "none", fontSize: 12,
            }}
          />
          <button
            onClick={doImport}
            style={{
              height: 28, padding: "0 8px", borderRadius: "var(--dsw-radius-sm)",
              border: "none", background: "var(--dsw-alias-state-business-primary)",
              color: "#fff", fontSize: 11, cursor: "pointer",
            }}
          >
            导入
          </button>
        </div>
      )}

      {/* 状态筛选 tab */}
      <div style={{ display: "flex", gap: 2 }}>
        {([
          ["all", "全部"],
          ["ready", "已索引"],
          ["stale", "待同步"],
          ["error", "异常"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              flex: 1, padding: "3px 0", border: "none", cursor: "pointer",
              borderRadius: "var(--dsw-radius-sm)", fontSize: 11,
              background: statusFilter === key
                ? "var(--dsw-specific-sidebar-nav-item-active)"
                : "transparent",
              color: statusFilter === key
                ? "var(--dsw-alias-state-business-primary)"
                : "var(--dsw-alias-label-secondary)",
              fontWeight: statusFilter === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 文档列表 */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "24px 8px",
              textAlign: "center",
              color: "var(--dsw-alias-label-tertiary)",
              fontSize: 12,
            }}
          >
            {docs.length === 0 ? (
              <>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📚</div>
                <div>知识库为空</div>
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  点右上角 + 导入第一个文档
                </div>
              </>
            ) : (
              "无匹配文档"
            )}
          </div>
        ) : (
          filtered.map((d) => {
            const st = statusStyle(d.status);
            const active = d.id === activeId;
            return (
              <div
                key={d.id}
                onClick={() => {
                  setActiveId(d.id);
                  setMdContent(SAMPLE_MD[d.id] ?? "# " + d.title + "\n\n暂无内容\n");
                  setView("editor");
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--dsw-radius-md)",
                  cursor: "pointer",
                  background: active
                    ? "var(--dsw-specific-sidebar-nav-item-active)"
                    : "transparent",
                  borderLeft: active ? "2px solid var(--dsw-alias-state-business-primary)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active
                    ? "var(--dsw-specific-sidebar-nav-item-active)"
                    : "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: "var(--dsw-radius-sm)",
                      background: "var(--dsw-alias-bg-module-platform)",
                      color: "var(--dsw-alias-label-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    {d.type}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {d.title}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11,
                    color: "var(--dsw-alias-label-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.summary}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: st.color, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>● {st.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); doDelete(d.id); }}
                    style={{
                      border: "none", background: "transparent", cursor: "pointer",
                      color: "var(--dsw-alias-label-tertiary)", fontSize: 12, padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部统计 */}
      <div
        style={{
          padding: "6px 2px 0",
          borderTop: "1px solid var(--dsw-alias-border-l1)",
          fontSize: 11,
          color: "var(--dsw-alias-label-tertiary)",
        }}
      >
        共 {docs.length} 条 · 已索引 {docs.filter((d) => d.status === "ready").length}
      </div>
    </div>
  );
}

/** cordis 插件入口：注册文案命名空间 + 占据 sidebar.workspaces 浏览槽。 */
function apply(ctx: any): void {
  // 1) 注册文案命名空间（声明后组件 props 带 t）
  ctx.effect(
    () => ctx.locale.register(NS, {
      zh: {
        "wiki.title": "知识库",
        "wiki.search": "搜索文档…",
        "wiki.refresh": "刷新",
        "wiki.settings": "设置",
      },
      en: {
        "wiki.title": "Wiki",
        "wiki.search": "Search docs…",
        "wiki.refresh": "Refresh",
        "wiki.settings": "Settings",
      },
    }),
    "wiki: dictionaries"
  );

  // 2) 注册槽位 —— 占据左栏浏览区 sidebar.workspaces（single/root，由 ui-sidebar 声明）。
  //    不重复声明其 kind/scope；注册动作包在 ctx.effect 里，fiber 卸载时级联注销。
  //
  // 时序：apply 可能在 ui-sidebar 声明 sidebar.workspaces 之前就进入某个上下文。
  // 直接注册会抛 "not declared"；直接 skip 又会永久错过（声明稍后才出现）。
  // 故未声明时不抛、不弃：订阅声明事件 + 轮询兜底，待本上下文声明了该槽再注册。
  // 真正无侧栏 UI 的上下文（永远不声明）在 15s 后静默放弃，不影响 boot。
  ctx.effect(
    () => {
      let disposed = false;
      let unsub: (() => void) | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let disposeRegister: (() => void) | undefined;
      let attempts = 0;

      const tryRegister = () => {
        if (disposed || disposeRegister) return;
        let declared: unknown;
        try {
          declared = ctx.slots && typeof ctx.slots.spec === "function"
            ? ctx.slots.spec("sidebar.workspaces") : undefined;
        } catch {
          return; // 探测本身失败，等下一轮
        }
        if (!declared) return; // 尚未声明，继续等

        try {
          unsub?.(); unsub = undefined;
          if (timer) { clearInterval(timer); timer = undefined; }
          disposeRegister = ctx.slots.register(
            {
              name: "sidebar.workspaces",
              locale: NS,
              registrant: "dsh-wiki-rag",
              // 内置 ui-workspace 已在 priority 0 占据本 single 槽；
              // single 槽按 priority 升序、"lowest renders"（最小 priority 实际渲染）。
              // 传 -1 与其错开避免同优先级冲突，并排在前成为实际渲染者，shadow 内置实现。
              priority: -1,
            },
            WikiSidebar
          );
        } catch (e) {
          console.warn("[dsh-wiki-rag] slots.register failed:", e);
        }
      };

      tryRegister();

      if (!disposeRegister) {
        // 订阅声明事件（子槽声明时同步回调）
        try {
          if (typeof ctx.slots?.subscribeDeclaration === "function") {
            unsub = ctx.slots.subscribeDeclaration("sidebar.workspaces", tryRegister);
          }
        } catch {
          /* 订阅不可用则仅靠轮询 */
        }
        // 轮询兜底，15s 仍未声明则放弃
        timer = setInterval(() => {
          attempts += 1;
          tryRegister();
          if (!disposeRegister && attempts > 150) { // 150 * 100ms = 15s
            if (timer) { clearInterval(timer); timer = undefined; }
            try { unsub?.(); } catch { /* noop */ }
            unsub = undefined;
          }
        }, 100);
      }

      return () => {
        disposed = true;
        try { unsub?.(); } catch { /* noop */ }
        if (timer) clearInterval(timer);
        try { disposeRegister?.(); } catch { /* noop */ }
      };
    },
    "wiki: sidebar.workspaces registration"
  );
}

export { apply, WikiSidebar };
