import React, { useEffect, useState, useCallback } from 'react';
import { ipc } from './ipc';
import { t } from './i18n';
import type { KnowledgeFile } from '../main/types';
import FileList from './components/FileList';
import WikiEditor from './components/WikiEditor';
import ImportPanel from './components/ImportPanel';
import SettingPanel from './components/SettingPanel';
import DiffModal from './components/DiffModal';
import { IconSprite } from './assets/icons/IconSprite';
import { ToastProvider, Tooltip } from './ui-kit';
import {
  IconListPenOutlineRegular,
  IconPlusOutlineRegular,
  IconSettingsOutlineRegular
} from './assets/icons/icons';

type View = 'files' | 'import' | 'settings';

const NAV_ITEMS: Array<{ view: View; label: string; icon: React.ReactNode }> = [
  { view: 'files', label: t('nav.files'), icon: <IconListPenOutlineRegular size={18} /> },
  { view: 'import', label: t('nav.import'), icon: <IconPlusOutlineRegular size={18} /> },
  { view: 'settings', label: t('nav.settings'), icon: <IconSettingsOutlineRegular size={18} /> }
];

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
      console.error(t('app.loadFilesFailed'), e);
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
    <ToastProvider>
      <div className="flex h-screen w-screen overflow-hidden">
      <IconSprite />
      {/* 左侧主导航 */}
      <nav className="dsw-sidebar">
        <Tooltip label="Wiki 知识库" side="right">
          <div className="dsw-sidebar-brand dsw-brand">W</div>
        </Tooltip>
        {NAV_ITEMS.map((it) => (
          <Tooltip key={it.view} label={it.label} side="right">
            <button
              className="dsw-nav-item"
              aria-current={view === it.view}
              onClick={() => setView(it.view)}
            >
              {it.icon}
            </button>
          </Tooltip>
        ))}
      </nav>

      {/* 内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'files' && (
          <FileList files={files} onSelect={setSelected} onRefresh={refresh} onOpenDiff={setDiff} />
        )}
        {view === 'import' && <ImportPanel onImported={handleImport} />}
        {view === 'settings' && <SettingPanel />}
      </main>

      {/* 编辑器抽屉 */}
      {selected && (
        <WikiEditor file={selected} onClose={() => setSelected(null)} onSaved={() => refresh()} />
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
    </ToastProvider>
  );
}
