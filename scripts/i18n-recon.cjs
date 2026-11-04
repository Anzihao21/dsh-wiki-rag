#!/usr/bin/env node
/**
 * i18n 终检脚本（v0.0.14）
 * 用法：node scripts/i18n-recon.cjs
 * 输出：zh/en 对称性、使用键 vs 注册键缺口、死键清单归因。
 * 退出码：0=合规；1=zh/en 不对称或使用键缺失（违规，CI 可守）。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "bundle/src/client/index.tsx"), "utf8");
const logic = fs.readFileSync(path.join(root, "bundle/src/client/logic.ts"), "utf8");

// 静态 tt(t,"wiki.*") 引用
const used = new Set([...src.matchAll(/tt\(t,\s*"([^"]+)"/g)].map((m) => m[1]));
// 注册字典
const zhBlock = src.match(/zh:\s*\{([\s\S]*?)\},\s*en:/)[1];
const enBlock = src.split("en: {")[1].split("})")[0];
const zh = new Set([...zhBlock.matchAll(/"([^"]+)":/g)].map((m) => m[1]));
const en = new Set([...enBlock.matchAll(/"([^"]+)":/g)].map((m) => m[1]));
// LOCAL_FALLBACK
const fbMatch = logic.match(/const LOCAL_FALLBACK[^=]*=\s*\{([\s\S]*?)\};/);
const fb = new Set([...fbMatch[1].matchAll(/"([^"]+)":/g)].map((m) => m[1]));

const zhNotInEn = [...zh].filter((k) => !en.has(k));
const enNotInZh = [...en].filter((k) => !zh.has(k));
const usedNotInZh = [...used].filter((k) => !zh.has(k));
const deadKeys = [...zh].filter((k) => !used.has(k));

console.log(`i18n 对账：used=${used.size} zh=${zh.size} en=${en.size} fallback=${fb.size}`);
console.log(`zh/en 对称：${zhNotInEn.length + enNotInZh.length === 0 ? "OK" : "MISMATCH"}`);
if (zhNotInEn.length) console.log("  zh 有 en 缺：", zhNotInEn);
if (enNotInZh.length) console.log("  en 有 zh 缺：", enNotInZh);
console.log(`使用键缺口（used 不在 zh）：${usedNotInZh.length}`);
if (usedNotInZh.length) console.log("  ", usedNotInZh);
console.log(`死键（zh 注册但代码未静态引用，多为主机/动态渲染）：${deadKeys.length}`);
console.log("  ", deadKeys.join(", "));

if (zhNotInEn.length || enNotInZh.length || usedNotInZh.length) {
  process.exit(1);
}
process.exit(0);
