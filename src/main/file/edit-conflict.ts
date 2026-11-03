/**
 * 编辑冲突检测（纯函数，便于单测）。
 *
 * 思路：保存时，客户端带上「打开文档时的基线快照 baseline」。
 * 若打开后磁盘内容被外部改动（磁盘 ≠ 基线），且本次保存内容 ≠ 磁盘当前内容，
 * 说明用户基于旧版本编辑、可能覆盖外部修改 → 判定冲突。
 *
 * 判定表（baseline 为空 → 视为强制保存/旧客户端，不冲突）：
 *   - diskContent === content       → 无实际差异，幂等，不冲突
 *   - diskContent === baseline      → 打开后无外部改动，正常保存
 *   - 其余                              → 冲突（磁盘被外部改动）
 */
export interface EditConflictResult {
  conflict: boolean;
  diskContent?: string;
}

export function detectEditConflict(diskContent: string, content: string, baseline?: string): EditConflictResult {
  if (baseline === undefined) return { conflict: false };
  if (diskContent === content) return { conflict: false };
  if (diskContent === baseline) return { conflict: false };
  return { conflict: true, diskContent };
}
