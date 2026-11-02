import React, { useState } from 'react';
import type { KnowledgeFile } from '../../main/types';
import { ipc } from '../ipc';
import { IconButton, ConfirmModal } from '../ui-kit';
import { IconRefreshOutlineRegular, IconTrashOutlineRegular, IconDownloadOutlineRegular } from '../assets/icons/icons';

interface Props {
  files: KnowledgeFile[];
  onSelect: (f: KnowledgeFile) => void;
  onRefresh: () => void;
  onOpenDiff: (d: any) => void;
}

const TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  md: 'MD',
  txt: 'TXT',
  url: '网页',
  note: '笔记'
};

export default function FileList({ files, onSelect, onRefresh, onOpenDiff }: Props) {
  const [pendingDelete, setPendingDelete] = useState<KnowledgeFile | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await ipc('wiki:deleteFile', pendingDelete.id);
    setPendingDelete(null);
    onRefresh();
  };

  const handleSync = async (f: KnowledgeFile) => {
    const result = await ipc<any>('wiki:triggerSync', f.id, f.zip_archive_path, f.md_path);
    if (result.status === 'no-change') {
      onOpenDiff(null);
    } else if (result.status === 'needs-confirm' && result.diff) {
      onOpenDiff(result.diff);
    } else if (result.status === 'source-lost') {
      onOpenDiff({ fileName: f.file_name, message: `源文件丢失：${result.reason}`, lost: true });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="dsw-page-header">
        <div>
          <h1 className="dsw-page-title">知识库文件</h1>
          <div className="dsw-page-subtitle">管理已导入的知识条目，点击条目进入编辑器</div>
        </div>
        <IconButton label="刷新" variant="ghost" onClick={onRefresh}>
          <IconRefreshOutlineRegular size={16} />
        </IconButton>
      </div>

      <div className="dsw-scroll">
        {files.length === 0 ? (
          <div className="dsw-empty">暂无文件，请前往「导入」添加</div>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <div key={f.id} className="dsw-list-item" onClick={() => onSelect(f)}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dsw-tag">{TYPE_LABEL[f.file_type] || f.file_type}</span>
                  <span className="dsw-list-item-title truncate">{f.file_name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label="从源目录更新" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleSync(f); }}>
                    <IconDownloadOutlineRegular size={14} />
                  </IconButton>
                  <IconButton label="删除" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPendingDelete(f); }}>
                    <IconTrashOutlineRegular size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="删除知识条目"
        message={`确定删除「${pendingDelete?.file_name}」及其归档包吗？删除后不可恢复。`}
        confirmLabel="删除"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
