import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSearchHistory, saveSearchHistory, loadEditTimes, markEdited,
  KEY_SEARCH_HISTORY, KEY_EDIT_TIMES, KEY_RECENT,
} from "../logic";

beforeEach(() => localStorage.clear());

describe("localStorage 隔离", () => {
  it("editTimes 与 searchHistory 与 recent 三个 key 互不覆盖", () => {
    saveSearchHistory("alpha");
    markEdited({}, "doc-1", 111);
    localStorage.setItem(KEY_RECENT, JSON.stringify(["x"]));
    expect(JSON.parse(localStorage.getItem(KEY_SEARCH_HISTORY)!)).toEqual(["alpha"]);
    expect(JSON.parse(localStorage.getItem(KEY_EDIT_TIMES)!)).toEqual({ "doc-1": 111 });
    expect(JSON.parse(localStorage.getItem(KEY_RECENT)!)).toEqual(["x"]);
  });
});

describe("markEdited", () => {
  it("追加并保持时间戳，不影响其他文档", () => {
    let t = markEdited({}, "a", 100);
    t = markEdited(t, "b", 200);
    expect(t).toEqual({ a: 100, b: 200 });
    expect(loadEditTimes()).toEqual({ a: 100, b: 200 });
    // 覆盖同一文档用新时间
    t = markEdited(t, "a", 999);
    expect(t.a).toBe(999);
  });
});

describe("searchHistory", () => {
  it("追加并去重，新的在前", () => {
    saveSearchHistory("a");
    saveSearchHistory("b");
    saveSearchHistory("a"); // 重复，提到最前
    expect(loadSearchHistory()).toEqual(["a", "b"]);
  });
  it("最多 10 条", () => {
    for (let i = 0; i < 15; i++) saveSearchHistory(`q${i}`);
    expect(loadSearchHistory()).toHaveLength(10);
    expect(loadSearchHistory()[0]).toBe("q14"); // 最新在前
  });
  it("空串不写入", () => {
    saveSearchHistory("   ");
    expect(loadSearchHistory()).toEqual([]);
  });
});

describe("损坏 JSON 安全回退", () => {
  it("损坏 editTimes → 空对象", () => {
    localStorage.setItem(KEY_EDIT_TIMES, "{{{bad");
    expect(loadEditTimes()).toEqual({});
  });
  it("损坏 searchHistory → 空数组", () => {
    localStorage.setItem(KEY_SEARCH_HISTORY, "{{{bad");
    expect(loadSearchHistory()).toEqual([]);
  });
});
