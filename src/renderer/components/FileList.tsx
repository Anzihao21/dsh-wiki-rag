import React from 'react';
import type { KnowledgeFile } from '../../main/types';
import { ipc } from '../ipc';

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
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('确定删除该知识条目及其归档包吗？')) return;
    await ipc('wiki:deleteFile', id);
    onRefresh();
  };

  const handleSync = async (e: React.MouseEvent, f: KnowledgeFile) => {
    e.stopPropagation();
    const result = await ipc<any>('wiki:triggerSync', f.id, f.zip_archive_path, f.md_path);
    if (result.status === 'no-change') {
      alert(result.reason || '无改动');
    } else if (result.status === 'needs-confirm' && result.diff) {
      onOpenDiff(result.diff);
    } else if (result.status === 'source-lost') {
      alert(`源文件丢失：${result.reason}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-dsh-border px-6 py-3">
        <h1 className="text-lg font-semibold">知识库文件</h1>
        <button
          onClick={onRefresh}
          className="rounded-md border border-dsh-border px-3 py-1 text-sm text-dsh-muted hover:bg-dsh-panel"
        >
          刷新
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {files.length === 0 ? (
          <div className="mt-16 text-center text-dsh-muted">暂无文件，请前往「导入」添加</div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                onClick={() => onSelect(f)}
                className="group flex cursor-pointer items-center justify-between rounded-lg border border-dsh-border bg-dsh-panel px-4 py-3 transition hover:border-dsh-accent"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded bg-dsh-border px-2 py-0.5 text-xs text-dsh-muted">
                    {TYPE_LABEL[f.file_type] || f.file_type}
                  </span>
                  <span className="font-medium">{f.file_name}</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={(e) => handleSync(e, f)}
                    className="rounded px-2 py-1 text-xs text-dsh-accent hover:bg-dsh-border"
                    title="从源目录更新"
                  >
                    同步
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, f.id)}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-dsh-border"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
