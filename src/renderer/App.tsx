import React, { useEffect, useState, useCallback } from 'react';
import { ipc } from './ipc';
import type { KnowledgeFile } from '../main/types';
import FileList from './components/FileList';
import WikiEditor from './components/WikiEditor';
import ImportPanel from './components/ImportPanel';
import SettingPanel from './components/SettingPanel';
import DiffModal from './components/DiffModal';

type View = 'files' | 'import' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('files');
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [selected, setSelected] = useState<KnowledgeFile | null>(null);
  const [diff, setDiff] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await ipc<KnowledgeFile[]>('wiki:listFiles');
      setFiles(list);
    } catch (e) {
      console.error('加载文件列表失败', e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleImport = async () => {
    await refresh();
    setView('files');
  };

  return (
    <div className="flex h-screen w-screen">
      {/* 左侧主导航 */}
      <nav className="flex w-16 flex-col items-center border-r border-dsh-border bg-dsh-panel py-4">
        {(
          [
            ['files', '📚'],
            ['import', '➕'],
            ['settings', '⚙️']
          ] as Array<[View, string]>
        ).map(([v, icon]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-lg transition ${
              view === v ? 'bg-dsh-accent text-white' : 'text-dsh-muted hover:bg-dsh-border'
            }`}
            title={v}
          >
            {icon}
          </button>
        ))}
      </nav>

      {/* 内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'files' && (
          <FileList
            files={files}
            onSelect={setSelected}
            onRefresh={refresh}
            onOpenDiff={setDiff}
          />
        )}
        {view === 'import' && <ImportPanel onImported={handleImport} />}
        {view === 'settings' && <SettingPanel />}
      </main>

      {/* 编辑器抽屉 */}
      {selected && (
        <WikiEditor
          file={selected}
          onClose={() => setSelected(null)}
          onSaved={() => refresh()}
        />
      )}

      {/* Diff 弹窗 */}
      {diff && (
        <DiffModal
          diff={diff}
          onClose={() => setDiff(null)}
          onAccept={async () => {
            await ipc('wiki:applySync', diff.fileId, diff.newText);
            setDiff(null);
            await refresh();
          }}
          onReject={() => setDiff(null)}
        />
      )}
    </div>
  );
}
