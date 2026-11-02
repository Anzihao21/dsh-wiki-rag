import React, { useEffect, useState } from 'react';
import type { PluginSettings } from '../../main/types';
import { ipc } from '../ipc';
import { Button, InputField, Switch, DropdownSelect } from '../ui-kit';
import { IconSaveOutlineRegular, IconArchiveOutlineRegular } from '../assets/icons/icons';

/** 设置面板：存储路径、网页模式、RAG 切片参数、快照开关（官方一致 UI） */
export default function SettingPanel() {
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);

  useEffect(() => {
    ipc<PluginSettings>('wiki:getSettings').then(setSettings);
  }, []);

  if (!settings) {
    return <div className="dsw-scroll">加载设置…</div>;
  }

  const set = (k: keyof PluginSettings, v: any) => {
    setSettings({ ...settings, [k]: v });
    setSaved(false);
  };

  const handleSave = async () => {
    await ipc('wiki:saveSettings', settings);
    setSaved(true);
  };

  const handleSnapshot = async () => {
    setSnapping(true);
    try {
      await ipc('wiki:createSnapshot');
      setSnapMsg('快照已创建');
    } catch (e) {
      setSnapMsg(`快照失败：${(e as Error).message}`);
    } finally {
      setSnapping(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="dsw-page-header">
        <div>
          <h1 className="dsw-page-title">设置</h1>
          <div className="dsw-page-subtitle">存储路径、网页抓取模式与 RAG 切片参数</div>
        </div>
      </div>

      <div className="dsw-scroll">
        <div className="flex flex-col gap-5" style={{ maxWidth: 480 }}>
          <Field label="MD 文件存储路径">
            <InputField value={settings.mdStoragePath} onChange={(e) => set('mdStoragePath', e.target.value)} />
          </Field>
          <Field label="Zip 归档存储路径">
            <InputField value={settings.zipStoragePath} onChange={(e) => set('zipStoragePath', e.target.value)} />
          </Field>

          <Field label="网页抓取模式">
            <DropdownSelect
              label=""
              value={settings.webMode}
              options={[
                { value: 'intranet', label: '内网模式' },
                { value: 'extranet', label: '外网模式' }
              ]}
              onChange={(v) => set('webMode', v)}
            />
          </Field>
          <Field label="网页超时（毫秒）">
            <InputField type="number" value={String(settings.webTimeout)} onChange={(e) => set('webTimeout', Number(e.target.value))} />
          </Field>

          <Field label="RAG 切片大小（字符）">
            <InputField type="number" value={String(settings.chunkSize)} onChange={(e) => set('chunkSize', Number(e.target.value))} />
          </Field>
          <Field label="切片重叠字符数">
            <InputField type="number" value={String(settings.chunkOverlap)} onChange={(e) => set('chunkOverlap', Number(e.target.value))} />
          </Field>

          <Field label="自动快照备份">
            <div className="flex items-center gap-3">
              <Switch checked={settings.autoSnapshot} onChange={(v) => set('autoSnapshot', v)} label="自动快照备份" />
              <span className="dsw-page-subtitle">关闭默认，手动开启</span>
            </div>
          </Field>

          <div className="dsw-toolbar">
            <Button variant="primary" leadingIcon={<IconSaveOutlineRegular size={14} />} onClick={handleSave}>
              保存设置
            </Button>
            <Button variant="secondary" leadingIcon={<IconArchiveOutlineRegular size={14} />} loading={snapping} onClick={handleSnapshot}>
              手动创建快照
            </Button>
            <span className="dsw-toolbar-spacer" />
            {saved && <span style={{ color: 'var(--dsw-alias-state-success-primary)', fontSize: 13 }}>已保存</span>}
            {snapMsg && <span style={{ color: 'var(--dsw-alias-state-warn-primary)', fontSize: 13 }}>{snapMsg}</span>}
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
