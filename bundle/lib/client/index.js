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
  const [docs] = (0, import_react.useState)(SAMPLE_DOCS);
  const [activeId, setActiveId] = (0, import_react.useState)("1");
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
  const filtered = docs.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()));
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
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  title: t ? t("wiki.refresh") : "\u5237\u65B0",
                  onClick: () => {
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
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            value: q,
            onChange: (e) => setQ(e.target.value),
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }, children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              padding: "16px 8px",
              textAlign: "center",
              color: "var(--dsw-alias-label-tertiary)",
              fontSize: 12
            },
            children: "\u65E0\u5339\u914D\u6587\u6863"
          }
        ) : filtered.map((d) => {
          const st = statusStyle(d.status);
          const active = d.id === activeId;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              onClick: () => setActiveId(d.id),
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
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 4, fontSize: 11, color: st.color }, children: [
                  "\u25CF ",
                  st.label
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
              docs.length,
              " \u6761 \xB7 \u5DF2\u7D22\u5F15 ",
              docs.filter((d) => d.status === "ready").length
            ]
          }
        )
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
        "wiki.refresh": "\u5237\u65B0"
      },
      en: {
        "wiki.title": "Wiki",
        "wiki.search": "Search docs\u2026",
        "wiki.refresh": "Refresh"
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
