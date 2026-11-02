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
  const [docs] = useState<WikiDoc[]>(SAMPLE_DOCS);
  const [activeId, setActiveId] = useState<string>("1");

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

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()));

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
        <button
          title={t ? t("wiki.refresh") : "刷新"}
          onClick={() => {}}
          style={{
            width: 24,
            height: 24,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            color: "var(--dsw-alias-label-secondary)",
            fontSize: 13,
          }}
        >
          ⟳
        </button>
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

      {/* 文档列表 */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "16px 8px",
              textAlign: "center",
              color: "var(--dsw-alias-label-tertiary)",
              fontSize: 12,
            }}
          >
            无匹配文档
          </div>
        ) : (
          filtered.map((d) => {
            const st = statusStyle(d.status);
            const active = d.id === activeId;
            return (
              <div
                key={d.id}
                onClick={() => setActiveId(d.id)}
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
                <div style={{ marginTop: 4, fontSize: 11, color: st.color }}>
                  ● {st.label}
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
      },
      en: {
        "wiki.title": "Wiki",
        "wiki.search": "Search docs…",
        "wiki.refresh": "Refresh",
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
