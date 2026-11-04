import { describe, it, expect, beforeEach } from "vitest";
import {
  computeDiff, flattenTree, collectFolderIds, subtreeFolderIds, findDocFolderPath,
  toBase64, makeTranslator, shouldLeaveGuard, isJobTimedOut, loadSearchHistory,
  saveSearchHistory, loadEditTimes, markEdited, buildDownloadName, filterCommands,
  extractHeadings, findLineIndex, filterLinks, dedupeRefs, countRefs, normalizeSearchHits, filterActiveRefs, sortRefsByScore,
  type TreeNode,
} from "../logic";

beforeEach(() => {
  try { localStorage.clear(); } catch { /* node 无 localStorage */ }
});

// ---------------- computeDiff ----------------
describe("computeDiff", () => {
  it("增：old 为空 new 有内容 → 含 add 行", () => {
    const rows = computeDiff("", "a\nb");
    expect(rows.some((r) => r.type === "add")).toBe(true);
    expect(rows.some((r) => r.newText === "b")).toBe(true);
  });
  it("删：new 为空 → 含 del 行", () => {
    const rows = computeDiff("a\nb", "");
    expect(rows.some((r) => r.type === "del")).toBe(true);
  });
  it("改：对应行 old 有 new 无反向 → mod", () => {
    const rows = computeDiff("x", "y");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("mod");
    expect(rows[0].oldText).toBe("x");
    expect(rows[0].newText).toBe("y");
  });
  it("上下文混合：相同行 ctx + 前后增删", () => {
    const rows = computeDiff("head\nold\ntail", "head\nnew\ntail");
    expect(rows[0]).toMatchObject({ type: "ctx", oldText: "head" });
    expect(rows[1]).toMatchObject({ type: "mod", oldText: "old", newText: "new" });
    expect(rows[2]).toMatchObject({ type: "ctx", oldText: "tail" });
  });
  it("完全相同 → 全 ctx", () => {
    const rows = computeDiff("a\nb", "a\nb");
    expect(rows.every((r) => r.type === "ctx")).toBe(true);
  });
  it("空输入行为稳定（单行空 ctx，不抛）", () => {
    expect(() => computeDiff("", "")).not.toThrow();
    expect(() => computeDiff(undefined as any, undefined as any)).not.toThrow();
  });
});

// ---------------- flattenTree / 树 ----------------
const tree: TreeNode[] = [
  { type: "doc", fileId: 1, title: "root.md" },
  { type: "folder", id: 10, name: "A", children: [
    { type: "doc", fileId: 2, title: "a1.md" },
    { type: "folder", id: 11, name: "B", children: [
      { type: "doc", fileId: 3, title: "b1.md" },
    ]},
  ]},
];

describe("flattenTree", () => {
  it("未展开时只输出根级 doc + folder 头", () => {
    const out: any[] = [];
    flattenTree(tree, 0, new Set(), out);
    expect(out.map((r) => [r.rowType, r.id, r.depth])).toEqual([
      ["doc", 1, 0], ["folder", 10, 0],
    ]);
  });
  it("展开 A 输出嵌套 doc，展开 B 再深一层", () => {
    const out: any[] = [];
    flattenTree(tree, 0, new Set([10, 11]), out);
    expect(out.map((r) => [r.rowType, r.id, r.depth])).toEqual([
      ["doc", 1, 0],
      ["folder", 10, 0],
      ["doc", 2, 1],
      ["folder", 11, 1],
      ["doc", 3, 2],
    ]);
  });
  it("undefined 安全", () => {
    const out: any[] = [];
    flattenTree(undefined, 0, new Set(), out);
    expect(out).toEqual([]);
  });
});

describe("collectFolderIds", () => {
  it("收集全部子孙文件夹 id", () => {
    expect([...collectFolderIds(tree, new Set())].sort()).toEqual([10, 11]);
  });
});

describe("subtreeFolderIds", () => {
  it("某文件夹的子孙集", () => {
    expect([...subtreeFolderIds(tree, 10)].sort()).toEqual([11]);
  });
  it("不存在的 id 返回空集", () => {
    expect(subtreeFolderIds(tree, 999).size).toBe(0);
  });
});

describe("findDocFolderPath", () => {
  it("根级文档返回 []", () => {
    expect(findDocFolderPath(tree, 1)).toEqual([]);
  });
  it("嵌套文档返回祖先链", () => {
    expect(findDocFolderPath(tree, 3)).toEqual([10, 11]);
  });
  it("找不到返回 null", () => {
    expect(findDocFolderPath(tree, 42)).toBeNull();
  });
});

// ---------------- toBase64 ----------------
describe("toBase64", () => {
  it("ASCII 往返", () => {
    const buf = new TextEncoder().encode("hello");
    expect(Buffer.from(toBase64(buf), "base64").toString()).toBe("hello");
  });
  it("空输入", () => {
    expect(toBase64(new Uint8Array(0))).toBe("");
  });
});

// ---------------- makeTranslator / tt ----------------
describe("makeTranslator", () => {
  const t = makeTranslator({ "k1": "fallback1", "k2": "hi {n}" });
  it("缺失 key 返回 key 本身", () => {
    expect(t(undefined, "nope")).toBe("nope");
  });
  it("本地兜底命中", () => {
    expect(t(undefined, "k1")).toBe("fallback1");
  });
  it("{n} 插值", () => {
    expect(t(undefined, "k2", { n: 3 })).toBe("hi 3");
  });
  it("宿主值优先", () => {
    const host = (k: string) => (k === "k1" ? "host1" : k);
    expect(t(host, "k1")).toBe("host1");
  });
  it("宿主抛错回退本地", () => {
    const host = () => { throw new Error("x"); };
    expect(t(host, "k1")).toBe("fallback1");
  });
});

// ---------------- shouldLeaveGuard ----------------
describe("shouldLeaveGuard", () => {
  it("编辑器有改动 → true", () => {
    expect(shouldLeaveGuard("editor", "1", "changed", "saved")).toBe(true);
  });
  it("编辑器无改动 → false", () => {
    expect(shouldLeaveGuard("editor", "1", "same", "same")).toBe(false);
  });
  it("非编辑态 → false", () => {
    expect(shouldLeaveGuard("preview", "1", "changed", "saved")).toBe(false);
  });
  it("无 activeId → false", () => {
    expect(shouldLeaveGuard("editor", null, "changed", "saved")).toBe(false);
  });
});

// ---------------- isJobTimedOut ----------------
describe("isJobTimedOut", () => {
  it("恰 60000ms → false（不超时）", () => {
    expect(isJobTimedOut(0, 60000)).toBe(false);
  });
  it("60001ms → true", () => {
    expect(isJobTimedOut(0, 60001)).toBe(true);
  });
});

// ---------------- 搜索历史（node 无 localStorage → 回退） ----------------
describe("searchHistory", () => {
  it("node 无 localStorage 时安全返回空", () => {
    expect(loadSearchHistory()).toEqual([]);
  });
});

// ---------------- 树规模性能（宽松，防 flaky） ----------------
describe("flattenTree 规模", () => {
  it("5000 节点 flatten+展开 < 100ms", () => {
    // 构造 50 个文件夹 × 100 文档 = 5000 节点
    const big: TreeNode[] = [];
    for (let f = 0; f < 50; f++) {
      const folder: TreeNode = { type: "folder", id: f, name: `f${f}`, children: [] };
      for (let d = 0; d < 100; d++) folder.children!.push({ type: "doc", fileId: f * 1000 + d, title: `d${d}.md` });
      big.push(folder);
    }
    const t0 = Date.now();
    const out: any[] = [];
    flattenTree(big, 0, new Set([...Array(50).keys()]), out);
    const ms = Date.now() - t0;
    expect(out.length).toBe(50 * 101); // 50 folder 头 + 5000 doc
    expect(ms).toBeLessThan(100);
  });
});

// ---------------- buildDownloadName（轮5 真问题：文件名非法字符） ----------------
describe("buildDownloadName", () => {
  it("去除 .md/.txt 扩展名再加 .md", () => {
    expect(buildDownloadName("note.md", undefined)).toBe("note.md");
    expect(buildDownloadName(undefined, "note.txt")).toBe("note.md");
  });
  it("清洗 Windows 非法字符与路径分隔符", () => {
    expect(buildDownloadName("a/b\\c:d*e", undefined)).toBe("a_b_c_d_e.md");
  });
  it("空值兜底 document.md", () => {
    expect(buildDownloadName(undefined, undefined)).toBe("document.md");
    expect(buildDownloadName("   ", "  ")).toBe("document.md");
  });
});

// ---------------- 轮8 新纯函数 ----------------
describe("filterCommands", () => {
  const items = [{ title: "Alpha" }, { title: "Beta" }, { title: "Gamma" }];
  it("空查询返回全部", () => expect(filterCommands("  ", items).length).toBe(3));
  it("大小写不敏感包含匹配", () => expect(filterCommands("alp", items)).toEqual([{ title: "Alpha" }]));
});

describe("extractHeadings", () => {
  it("提取 #/##/### 与行号", () => {
    const h = extractHeadings("# 标题\n正文\n## 子\n### 孙");
    expect(h.map((x) => [x.level, x.text, x.line])).toEqual([[1, "标题", 0], [2, "子", 2], [3, "孙", 3]]);
  });
  it("空内容返回空", () => expect(extractHeadings("")).toEqual([]));
});

describe("findLineIndex", () => {
  it("命中行号", () => expect(findLineIndex("a\nbcd\ne", "bcd")).toBe(1));
  it("找不到返回 -1", () => expect(findLineIndex("a\nb", "zzz")).toBe(-1));
  it("空片段返回 -1", () => expect(findLineIndex("abc", "")).toBe(-1));
});

// ---------------- 轮1 双链 ----------------
describe("filterLinks", () => {
  const items = [{ id: "1", title: "Alpha" }, { id: "2", title: "Beta" }, { id: "3", title: "Alphabet" }];
  it("空 q 返回全部除自身", () => expect(filterLinks("", items, "1").map((x) => x.id)).toEqual(["2", "3"]));
  it("按标题过滤", () => expect(filterLinks("alp", items, undefined).map((x) => x.id)).toEqual(["1", "3"]));
  it("上限 8", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `doc${i}` }));
    expect(filterLinks("", many).length).toBe(8);
  });
});

describe("dedupeRefs", () => {
  it("按 fileId 去重并排除自身", () => {
    const r = dedupeRefs([{ fileId: 1 }, { fileId: 2 }, { fileId: 1 }, { fileId: 3 }], 2);
    expect(r.map((x) => x.fileId)).toEqual([1, 3]);
  });
});

describe("countRefs", () => {
  it("统计去重排除自身后的引用数", () => {
    expect(countRefs([{ fileId: 1 }, { fileId: 2 }, { fileId: 1 }, { fileId: 3 }], 2)).toBe(2);
  });
  it("空结果为 0", () => expect(countRefs([], 1)).toBe(0));
});

describe("normalizeSearchHits", () => {
  it("空数组返回空", () => expect(normalizeSearchHits([])).toEqual([]));
  it("标题缺失回退文件名/序号，content 截断 160", () => {
    const r = normalizeSearchHits([{ fileId: 5, content: "x".repeat(200) }]);
    expect(r[0].id).toBe("5");
    expect(r[0].title).toBe("结果 1");
    expect(r[0].summary.length).toBe(160);
  });
});

describe("filterActiveRefs", () => {
  it("剔除带 deleted/deletedAt 标记的软删引用", () => {
    const r = filterActiveRefs([{ fileId: 1 }, { fileId: 2, deleted: true }, { fileId: 3, deletedAt: "2026" }]);
    expect(r.map((x) => x.fileId)).toEqual([1]);
  });
  it("空数组返回空", () => expect(filterActiveRefs([])).toEqual([]));
});

describe("sortRefsByScore", () => {
  it("按 score 降序", () => {
    const r = sortRefsByScore([{ fileId: 1, score: 0.2 }, { fileId: 2, score: 0.9 }, { fileId: 3, score: 0.5 }]);
    expect(r.map((x) => x.fileId)).toEqual([2, 3, 1]);
  });
  it("无 score 排末尾且不变异原数组", () => {
    const arr = [{ fileId: 1 }, { fileId: 2, score: 0.8 }];
    const r = sortRefsByScore(arr);
    expect(r.map((x) => x.fileId)).toEqual([2, 1]);
    expect(arr[0].fileId).toBe(1);
  });
});
