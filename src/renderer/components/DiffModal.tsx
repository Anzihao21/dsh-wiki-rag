import React from 'react';
import { t } from '../i18n';
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
      <Button variant="ghost" onClick={onReject}>{t('diff.reject')}</Button>
      <Button variant="primary" onClick={onAccept}>{t('diff.accept')}</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>{t('diff.gotIt')}</Button>
    </>
  );

  const subtitle = hasDiff ? (
    <span className="dsw-page-subtitle">
      <span className="dsw-diff-added">+{added}</span> / <span className="dsw-diff-removed">-{removed}</span> {t('diff.charsUnit')}
    </span>
  ) : undefined;

  return (
    <Modal open onClose={onClose} title={diff.fileName} footer={footer}>
      {subtitle && <div style={{ marginBottom: 8 }}>{subtitle}</div>}
      {hasDiff ? (
        <div className="dsw-code">
          {diff.diff!.map((d, i) => (
            <div
              key={i}
              className={`dsw-diff-line whitespace-pre-wrap ${
                d.added ? 'dsw-diff-added' : d.removed ? 'dsw-diff-removed' : 'dsw-diff-plain'
              }`}
            >
              {d.added ? '+' : d.removed ? '-' : ' '} {d.value}
            </div>
          ))}
        </div>
      ) : (
        <div className="dsw-text-sm flex items-center gap-2" style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          <IconWarningTriangleOutlineRegular size={16} className="shrink-0" />
          <span>{diff.message ?? t('diff.noChanges')}</span>
        </div>
      )}
    </Modal>
  );
}
