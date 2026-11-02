import React, { useEffect, useState } from 'react';
import type { KnowledgeFile } from '../../main/types';
import { ipc } from '../ipc';
import { Button, IconButton, Tabs } from '../ui-kit';
import { IconCloseOutlineRegular, IconSaveOutlineRegular } from '../assets/icons/icons';

interface Props {
  file: KnowledgeFile;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Wiki MD 可视化编辑器。
 * 所见即所得（textarea 编辑） + 源码双视图切换（官方 Tabs）。
 * 保存后调用主进程重新切片、刷新向量。
 */
export default function WikiEditor({ file, onClose, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [view, setView] = useState<'wysiwyg' | 'source'>('wysiwyg');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc<string>('wiki:readMd', file.id)
      .then((t) => setContent(t ?? ''))
      .catch(() => setContent(''));
  }, [file.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc('wiki:editMd', file.id, content);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dsw-editor">
      <div className="dsw-page-header">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="dsw-page-title truncate">{file.file_name}</h1>
          <div className="dsw-page-subtitle">编辑仅修改 MD，不影响 Zip 归档原始文件</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tabs
            size="sm"
            activeId={view}
            onChange={(id) => setView(id as 'wysiwyg' | 'source')}
            items={[
              { id: 'wysiwyg', label: '可视化' },
              { id: 'source', label: '源码' }
            ]}
          />
          <Button variant="primary" size="sm" leadingIcon={<IconSaveOutlineRegular size={14} />} loading={saving} onClick={handleSave}>
            保存
          </Button>
          <IconButton label="关闭" variant="ghost" onClick={onClose}>
            <IconCloseOutlineRegular size={16} />
          </IconButton>
        </div>
      </div>

      <div className="dsw-editor-body">
        {view === 'wysiwyg' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="dsw-textarea"
          />
        ) : (
          <pre className="dsw-textarea" style={{ overflow: 'auto' }}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
