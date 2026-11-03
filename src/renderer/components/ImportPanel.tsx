import React, { useState } from 'react';
import { ipc } from '../ipc';
import { t } from '../i18n';
import { Button, InputField } from '../ui-kit';
import { IconPlusOutlineRegular, IconLinkOutlineRegular, IconListPenOutlineRegular, IconFolderOpenOutlineRegular, IconGlobeOutlineRegular } from '../assets/icons/icons';

interface Props {
  onImported: () => void;
}

/**
 * 文件导入面板：本地单文件 / 文件夹批量 / 局域网路径 / 网页URL / 笔记。
 * 官方一致 UI：官方 InputField / Button / 官方图标。
 */
export default function ImportPanel({ onImported }: Props) {
  const [localPath, setLocalPath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [url, setUrl] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (p: Promise<any>) => {
    setMsg(null);
    setBusy(true);
    try {
      const r = await p;
      const skipped = Array.isArray(r) ? r.some((x) => x.skipped) : r?.skipped;
      setMsg({ ok: true, text: skipped ? t('import.skipped') : t('import.success') });
      onImported();
    } catch (e) {
      setMsg({ ok: false, text: t('import.failed').replace('{msg}', (e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="dsw-page-header">
        <div>
          <h1 className="dsw-page-title">{t('import.title')}</h1>
          <div className="dsw-page-subtitle">{t('import.subtitle')}</div>
        </div>
      </div>

      <div className="dsw-scroll">
        <div className="flex flex-col gap-4" style={{ maxWidth: 560 }}>
          <Section title={t('import.localFile')} icon={<IconListPenOutlineRegular size={16} />}>
            <InputField
              placeholder={t('import.localFilePlaceholder')}
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
            <Button variant="primary" leadingIcon={<IconPlusOutlineRegular size={14} />} disabled={!localPath || busy} onClick={() => run(ipc('wiki:importFile', localPath))}>
              {t('import.localFileButton')}
            </Button>
          </Section>

          <Section title={t('import.folder')} icon={<IconFolderOpenOutlineRegular size={16} />}>
            <InputField placeholder={t('import.folderPlaceholder')} value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
            <Button variant="primary" leadingIcon={<IconPlusOutlineRegular size={14} />} disabled={!folderPath || busy} onClick={() => run(ipc('wiki:importFolder', folderPath))}>
              {t('import.folderButton')}
            </Button>
          </Section>

          <Section title={t('import.lanShare')} icon={<IconFolderOpenOutlineRegular size={16} />}>
            <InputField placeholder={t('import.lanSharePlaceholder')} value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
            <Button variant="primary" leadingIcon={<IconPlusOutlineRegular size={14} />} disabled={!folderPath || busy} onClick={() => run(ipc('wiki:importFolder', folderPath))}>
              {t('import.lanShareButton')}
            </Button>
            <div className="dsw-page-subtitle">{t('import.lanShareHint')}</div>
          </Section>

          <Section title={t('import.webUrl')} icon={<IconGlobeOutlineRegular size={16} />}>
            <InputField placeholder="https://example.com/page" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button variant="primary" leadingIcon={<IconLinkOutlineRegular size={14} />} disabled={!url || busy} onClick={() => run(ipc('wiki:importUrl', url))}>
              {t('import.webUrlButton')}
            </Button>
          </Section>

          <Section title={t('import.note')} icon={<IconListPenOutlineRegular size={16} />}>
            <InputField placeholder={t('import.noteTitlePlaceholder')} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            <label className="dsw-field">
              <textarea
                className="dsw-textarea"
                style={{ minHeight: 100 }}
                placeholder={t('import.noteTextPlaceholder')}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </label>
            <Button variant="primary" leadingIcon={<IconPlusOutlineRegular size={14} />} disabled={!noteTitle || busy} onClick={() => run(ipc('wiki:importNote', noteTitle, noteText))}>
              {t('import.noteButton')}
            </Button>
          </Section>

          {msg && (
            <div
              className="rounded-md px-4 py-2 text-sm"
              style={{
                background: msg.ok ? 'var(--dsw-alias-state-success-tertiary)' : 'var(--dsw-alias-state-error-secondary)',
                color: msg.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-primary-foreground)'
              }}
            >
              {msg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg p-4" style={{ border: '0.5px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)' }}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="dsw-list-item-title">{title}</span>
      </div>
      {children}
    </div>
  );
}
