import React, { useState } from 'react';
import type { KnowledgeFile } from '../../main/types';
import { ipc } from '../ipc';
import { t } from '../i18n';
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
  url: t('fileList.type.url'),
  note: t('fileList.type.note')
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
      onOpenDiff({
        fileName: f.file_name,
        message: t('diff.sourceLost').replace('{reason}', result.reason),
        lost: true
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="dsw-page-header">
        <div>
          <h1 className="dsw-page-title">{t('fileList.title')}</h1>
          <div className="dsw-page-subtitle">{t('fileList.subtitle')}</div>
        </div>
        <IconButton label={t('common.refresh')} variant="ghost" onClick={onRefresh}>
          <IconRefreshOutlineRegular size={16} />
        </IconButton>
      </div>

      <div className="dsw-scroll">
        {files.length === 0 ? (
          <div className="dsw-empty">{t('fileList.empty')}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <div key={f.id} className="dsw-list-item" onClick={() => onSelect(f)}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dsw-tag">{TYPE_LABEL[f.file_type] || f.file_type}</span>
                  <span className="dsw-list-item-title truncate">{f.file_name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={t('fileList.syncFromSource')} variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleSync(f); }}>
                    <IconDownloadOutlineRegular size={14} />
                  </IconButton>
                  <IconButton label={t('common.delete')} variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPendingDelete(f); }}>
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
        title={t('fileList.deleteTitle')}
        message={t('fileList.deleteMessage').replace('{name}', pendingDelete?.file_name ?? '')}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
