import React, { useEffect, useState } from 'react';
import type { PluginSettings } from '../../main/types';
import { ipc } from '../ipc';
import { t } from '../i18n';
import { Button, InputField, Switch, DropdownSelect, useToast } from '../ui-kit';
import { IconSaveOutlineRegular, IconArchiveOutlineRegular } from '../assets/icons/icons';

/** 设置面板：存储路径、网页模式、RAG 切片参数、快照开关（官方一致 UI） */
export default function SettingPanel() {
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [snapping, setSnapping] = useState(false);
  const toast = useToast();

  useEffect(() => {
    ipc<PluginSettings>('wiki:getSettings').then(setSettings);
  }, []);

  if (!settings) {
    return <div className="dsw-scroll">{t('settings.loading')}</div>;
  }

  const set = (k: keyof PluginSettings, v: any) => {
    setSettings({ ...settings, [k]: v });
  };

  const handleSave = async () => {
    await ipc('wiki:saveSettings', settings);
    toast({ text: t('settings.saved'), tone: 'success' });
  };

  const handleSnapshot = async () => {
    setSnapping(true);
    try {
      await ipc('wiki:createSnapshot');
      toast({ text: t('settings.snapshotCreated') });
    } catch (e) {
      toast({ text: t('settings.snapshotFailed').replace('{msg}', (e as Error).message) });
    } finally {
      setSnapping(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="dsw-page-header">
        <div>
          <h1 className="dsw-page-title">{t('settings.title')}</h1>
          <div className="dsw-page-subtitle">{t('settings.subtitle')}</div>
        </div>
      </div>

      <div className="dsw-scroll">
        <div className="flex flex-col gap-5" style={{ maxWidth: 480 }}>
          <Field label={t('settings.mdPath')}>
            <InputField value={settings.mdStoragePath} onChange={(e) => set('mdStoragePath', e.target.value)} />
          </Field>
          <Field label={t('settings.zipPath')}>
            <InputField value={settings.zipStoragePath} onChange={(e) => set('zipStoragePath', e.target.value)} />
          </Field>

          <Field label={t('settings.webMode')}>
            <DropdownSelect
              label=""
              value={settings.webMode}
              options={[
                { value: 'intranet', label: t('settings.webModeIntranet') },
                { value: 'extranet', label: t('settings.webModeExtranet') }
              ]}
              onChange={(v) => set('webMode', v)}
            />
          </Field>
          <Field label={t('settings.webTimeout')}>
            <InputField type="number" value={String(settings.webTimeout)} onChange={(e) => set('webTimeout', Number(e.target.value))} />
          </Field>

          <Field label={t('settings.chunkSize')}>
            <InputField type="number" value={String(settings.chunkSize)} onChange={(e) => set('chunkSize', Number(e.target.value))} />
          </Field>
          <Field label={t('settings.chunkOverlap')}>
            <InputField type="number" value={String(settings.chunkOverlap)} onChange={(e) => set('chunkOverlap', Number(e.target.value))} />
          </Field>

          <Field label={t('settings.autoSnapshot')}>
            <div className="flex items-center gap-3">
              <Switch checked={settings.autoSnapshot} onChange={(v) => set('autoSnapshot', v)} label={t('settings.autoSnapshot')} />
              <span className="dsw-page-subtitle">{t('settings.autoSnapshotHint')}</span>
            </div>
          </Field>

          <div className="dsw-toolbar">
            <Button variant="primary" leadingIcon={<IconSaveOutlineRegular size={14} />} onClick={handleSave}>
              {t('settings.saveButton')}
            </Button>
            <Button variant="secondary" leadingIcon={<IconArchiveOutlineRegular size={14} />} loading={snapping} onClick={handleSnapshot}>
              {t('settings.snapshotButton')}
            </Button>
            <span className="dsw-toolbar-spacer" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="dsw-field-label">{label}</span>
      {children}
    </div>
  );
}
