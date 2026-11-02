import React from 'react';
import type { DiffResult } from '../../main/types';

interface Props {
  diff: DiffResult;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * 文件变更弹窗：展示 diff 的删除/新增行，接受/拒绝按钮。
 */
export default function DiffModal({ diff, onClose, onAccept, onReject }: Props) {
  const added = diff.diff.filter((d) => d.added).reduce((n, d) => n + d.value.length, 0);
  const removed = diff.diff.filter((d) => d.removed).reduce((n, d) => n + d.value.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex h-[70vh] w-2/3 flex-col rounded-lg border border-dsh-border bg-dsh-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-dsh-border px-4 py-3">
          <div>
            <span className="font-semibold">{diff.fileName}</span>
            <span className="ml-3 text-sm text-dsh-muted">
              <span className="text-green-400">+{added}</span> /{' '}
              <span className="text-red-400">-{removed}</span> 字符
            </span>
          </div>
          <button onClick={onClose} className="text-dsh-muted hover:text-dsh-text">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
          {diff.diff.map((d, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap px-2 ${
                d.added ? 'bg-green-900/30 text-green-300' : d.removed ? 'bg-red-900/30 text-red-300' : 'text-dsh-text'
              }`}
            >
              {d.added ? '+' : d.removed ? '-' : ' '} {d.value}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-dsh-border px-4 py-3">
          <button onClick={onReject} className="rounded-md border border-dsh-border px-4 py-2 text-sm text-dsh-muted hover:bg-dsh-border">
            拒绝更新
          </button>
          <button onClick={onAccept} className="rounded-md bg-dsh-accent px-4 py-2 text-sm text-white">
            接受更新
          </button>
        </div>
      </div>
    </div>
  );
}
