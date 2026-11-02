import React, { useEffect, useState } from 'react';
import type { KnowledgeFile } from '../../main/types';
import { ipc } from '../ipc';

interface Props {
  file: KnowledgeFile;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Wiki MD 可视化编辑器。
 * 所见即所得（textarea 编辑） + 源码双视图切换。
 * 保存后调用主进程重新切片、刷新向量。
 */
export default function WikiEditor({ file, onClose, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [view, setView] = useState<'wysiwyg' | 'source'>('wysiwyg');

  useEffect(() => {
    // 渲染进程不直接读文件——经由主进程读取 md_path
    ipc<string>('wiki:readMd', file.id)
      .then((t) => setContent(t ?? ''))
      .catch(() => {
        // 无 readMd 通道时回退为空内容（宿主注入）
        setContent('');
      });
  }, [file.id]);

  const handleSave = async () => {
    await ipc('wiki:editMd', file.id, content);
    onSaved();
    onClose();
  };

  return (
    <div className="absolute inset-y-0 right-0 flex w-2/3 flex-col border-l border-dsh-border bg-dsh-panel shadow-xl">
      <div className="flex items-center justify-between border-b border-dsh-border px-4 py-3">
        <span className="font-semibold">{file.file_name}</span>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-dsh-border text-xs">
            {(['wysiwyg', 'source'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 ${
                  view === v ? 'bg-dsh-accent text-white' : 'text-dsh-muted hover:bg-dsh-border'
                }`}
              >
                {v === 'wysiwyg' ? '可视化' : '源码'}
              </button>
            ))}
          </div>
          <button onClick={handleSave} className="rounded bg-dsh-accent px-3 py-1 text-sm text-white">
            保存
          </button>
          <button onClick={onClose} className="rounded border border-dsh-border px-3 py-1 text-sm text-dsh-muted">
            关闭
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {view === 'wysiwyg' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-full w-full resize-none rounded-md border border-dsh-border bg-dsh-bg p-4 font-mono text-sm leading-relaxed outline-none focus:border-dsh-accent"
          />
        ) : (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap rounded-md border border-dsh-border bg-dsh-bg p-4 text-sm leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
