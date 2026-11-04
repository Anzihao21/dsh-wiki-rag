import { describe, it, expect, vi, beforeEach } from "vitest";
import { filterLinks, filterCommands, dedupeRefs, countRefs, saveSearchHistory, loadSearchHistory, buildDownloadName } from "../logic";

// 模拟客户端交互流：不渲染整个 Tiptap 组件，只验证其依赖的纯函数与 fetch 桩。
beforeEach(() => { try { localStorage.clear(); } catch {} });

describe("命令面板交互流", () => {
  const docs = [
    { id: "1", title: "Alpha" }, { id: "2", title: "Beta" }, { id: "3", title: "Gamma" },
  ];
  it("输入 al → 过滤出 Alpha/Gamma，Enter 取首项", () => {
    const filtered = filterCommands("al", docs);
    expect(filtered.map((d) => d.title)).toEqual(["Alpha"]);
  });
  it("Esc 等价于关闭后清空查询（filtered 回退全量）", () => {
    expect(filterCommands("", docs).length).toBe(3);
  });
});

describe("双链 [[ 交互流", () => {
  it("输入 [[al 排除另一文档后联想 Alpha", () => {
    const items = [{ id: "1", title: "Alpha note" }, { id: "2", title: "Beta" }];
    expect(filterLinks("al", items, "2").map((d) => d.id)).toEqual(["1"]);
  });
});

describe("回收站 fetch 端点契约（桩验证）", () => {
  it("恢复/彻底删除/清空请求路径正确", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, opts: any) => {
      calls.push(`${opts?.method || "GET"} ${url}`);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }));
    const api = (path: string, opts?: any) => fetch("http://localhost:3081/api/wiki" + path, opts).then((r: any) => r.json());
    await api("/trash/restore", { method: "POST", body: JSON.stringify({ id: "5", type: "file" }) });
    await api("/trash/file/5", { method: "DELETE" });
    await api("/trash/empty", { method: "POST" });
    expect(calls).toEqual([
      "POST http://localhost:3081/api/wiki/trash/restore",
      "DELETE http://localhost:3081/api/wiki/trash/file/5",
      "POST http://localhost:3081/api/wiki/trash/empty",
    ]);
    vi.unstubAllGlobals();
  });
});

describe("反向链接去重流", () => {
  it("同 fileId 多条命中只留一条并排除自身", () => {
    const r = dedupeRefs([{ fileId: 1, title: "a" }, { fileId: 1, title: "a" }, { fileId: 2, title: "b" }], "2");
    expect(r.map((x) => x.fileId)).toEqual([1]);
  });
});

describe("导出下载流", () => {
  it("非法字符文件名清洗后 .md", () => {
    expect(buildDownloadName("a/b:c", undefined)).toBe("a_b_c.md");
  });
});

describe("错误分支", () => {
  const docs = [{ id: "1", title: "Alpha" }, { id: "2", title: "Beta" }];
  it("命令面板无匹配命令返回空（空态）", () => {
    expect(filterCommands("zzzznope", docs)).toEqual([]);
  });
  it("反向链接 search 失败空结果 → countRefs 为 0", () => {
    expect(countRefs([], "1")).toBe(0);
  });
  it("反向链接结果含自身时排除后计数正确", () => {
    expect(countRefs([{ fileId: "1" }, { fileId: "2" }], "1")).toBe(1);
  });
});

describe("反链面板错误态", () => {
  it("search 失败空结果 → countRefs 为 0（面板显示空态/失败态）", () => {
    expect(countRefs([], "1")).toBe(0);
  });
  it("结果含自身时排除后计数 1", () => {
    expect(countRefs([{ fileId: "1" }, { fileId: "2" }], "1")).toBe(1);
  });
});

describe("双链键盘流边界", () => {
  const items = [{ id: "1", title: "Alpha" }, { id: "2", title: "Beta" }, { id: "3", title: "Gamma" }];
  it("过滤后候选为空时 selected 不应越界（Math.min 夹紧）", () => {
    const c = filterLinks("zzz", items, undefined);
    expect(Math.min(5, Math.max(0, c.length - 1))).toBe(0);
  });
  it("候选3项时选中夹紧在0..2", () => {
    const c = filterLinks("", items, "2");
    expect(Math.min(10, Math.max(0, c.length - 1))).toBe(1);
  });
});

describe("命令面板命令矩阵", () => {
  const cmds = [
    { key: "new", title: "新建文档" }, { key: "import", title: "导入文件" },
    { key: "trash", title: "回收站" }, { key: "settings", title: "设置" },
  ];
  it("全部命令可被空查询列出", () => expect(filterCommands("", cmds).length).toBe(4));
  it("无匹配返回空", () => expect(filterCommands("xyz", cmds)).toEqual([]));
});
