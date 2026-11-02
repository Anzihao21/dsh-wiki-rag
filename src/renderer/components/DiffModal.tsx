import React from 'react';
import { Button, Modal } from '../ui-kit';
import { IconWarningTriangleOutlineRegular } from '../assets/icons/icons';

interface DiffLine {
  added?: boolean;
  removed?: boolean;
  value: string;
}

interface DiffData {
  fileId?: number;
  fileName: string;
  diff?: DiffLine[];
  newText?: string;
  /** 源文件丢失等非 diff 提示 */
  message?: string;
  lost?: boolean;
}

interface Props {
  diff: DiffData;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * 文件变更弹窗：展示 diff 删除/新增行（官方 code-diff 令牌），接受/拒绝更新。
 * 兼容「源文件丢失」提示模式（仅展示 message，无 diff 行）。
 */
export default function DiffModal({ diff, onClose, onAccept, onReject }: Props) {
  const hasDiff = !!diff.diff && diff.diff.length > 0 && !diff.lost;
  const added = (diff.diff ?? []).filter((d) => d.added).reduce((n, d) => n + d.value.length, 0);
  const removed = (diff.diff ?? []).filter((d) => d.removed).reduce((n, d) => n + d.value.length, 0);

  const footer = hasDiff ? (
    <>
      <Button variant="ghost" onClick={onReject}>拒绝更新</Button>
      <Button variant="primary" onClick={onAccept}>接受更新</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>知道了</Button>
    </>
  );

  const subtitle = hasDiff ? (
    <span className="dsw-page-subtitle">
      <span className="dsw-diff-added">+{added}</span> / <span className="dsw-diff-removed">-{removed}</span> 字符
    </span>
  ) : undefined;

  return (
    <Modal open onClose={onClose} title={diff.fileName} footer={footer}>
      {subtitle && <div style={{ marginBottom: 8 }}>{subtitle}</div>}
      {hasDiff ? (
        <div className="flex flex-col gap-0.5 font-mono text-[13px] leading-relaxed">
          {diff.diff!.map((d, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap rounded px-2 ${
                d.added ? 'dsw-diff-added' : d.removed ? 'dsw-diff-removed' : 'dsw-diff-plain'
              }`}
            >
              {d.added ? '+' : d.removed ? '-' : ' '} {d.value}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[14px] leading-6" style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          <IconWarningTriangleOutlineRegular size={16} className="shrink-0" />
          <span>{diff.message ?? '无可用变更'}</span>
        </div>
      )}
    </Modal>
  );
}
