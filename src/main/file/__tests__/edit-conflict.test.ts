import { describe, it, expect } from 'vitest';
import { detectEditConflict } from '../edit-conflict';

describe('detectEditConflict', () => {
  it('baseline 为空（强制保存/旧客户端）不冲突', () => {
    expect(detectEditConflict('disk', 'new').conflict).toBe(false);
  });

  it('保存内容与磁盘一致（幂等）不冲突', () => {
    expect(detectEditConflict('same', 'same', 'same').conflict).toBe(false);
  });

  it('打开后无外部改动（磁盘=基线）不冲突', () => {
    const r = detectEditConflict('baseline-content', 'edited-by-user', 'baseline-content');
    expect(r.conflict).toBe(false);
  });

  it('磁盘被外部改动且用户基于旧版本编辑 → 冲突并返回磁盘内容', () => {
    const r = detectEditConflict('external-changed', 'user-edited', 'old-baseline');
    expect(r.conflict).toBe(true);
    expect(r.diskContent).toBe('external-changed');
  });

  it('磁盘被外部改动但用户内容与磁盘一致 → 不冲突（保存内容即磁盘）', () => {
    const r = detectEditConflict('external-changed', 'external-changed', 'old-baseline');
    expect(r.conflict).toBe(false);
  });
});
