import React, { useEffect, useState } from 'react';
import type { PluginSettings } from '../../main/types';
import { ipc } from '../ipc';

/**
 * 设置面板：存储路径、网页模式、RAG 切片参数、快照开关。
 */
export default function SettingPanel() {
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ipc<PluginSettings>('wiki:getSettings').then(setSettings);
  }, []);

  if (!settings) {
    return <div className="p-6 text-dsh-muted">加载设置…</div>;
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
    await ipc('wiki:createSnapshot');
    alert('快照已创建');
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <h1 className="mb-6 text-lg font-semibold">设置</h1>

      <Row label="MD 文件存储路径">
        <input className="inp" value={settings.mdStoragePath} onChange={(e) => set('mdStoragePath', e.target.value)} />
      </Row>
      <Row label="Zip 归档存储路径">
        <input className="inp" value={settings.zipStoragePath} onChange={(e) => set('zipStoragePath', e.target.value)} />
      </Row>

      <Row label="网页抓取模式">
        <select className="inp" value={settings.webMode} onChange={(e) => set('webMode', e.target.value)}>
          <option value="intranet">内网模式</option>
          <option value="extranet">外网模式</option>
        </select>
      </Row>
      <Row label="网页超时（毫秒）">
        <input
          className="inp"
          type="number"
          value={settings.webTimeout}
          onChange={(e) => set('webTimeout', Number(e.target.value))}
        />
      </Row>

      <Row label="RAG 切片大小（字符）">
        <input
          className="inp"
          type="number"
          value={settings.chunkSize}
          onChange={(e) => set('chunkSize', Number(e.target.value))}
        />
      </Row>
      <Row label="切片重叠字符数">
        <input
          className="inp"
          type="number"
          value={settings.chunkOverlap}
          onChange={(e) => set('chunkOverlap', Number(e.target.value))}
        />
      </Row>

      <Row label="自动快照备份">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.autoSnapshot}
            onChange={(e) => set('autoSnapshot', e.target.checked)}
          />
          <span className="text-sm text-dsh-muted">关闭默认，手动开启</span>
        </label>
      </Row>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={handleSave} className="rounded-md bg-dsh-accent px-4 py-2 text-sm text-white">
          保存设置
        </button>
        <button
          onClick={handleSnapshot}
          className="rounded-md border border-dsh-border px-4 py-2 text-sm text-dsh-muted hover:bg-dsh-panel"
        >
          手动创建快照
        </button>
        {saved && <span className="text-sm text-green-400">已保存</span>}
      </div>

      <style>{`
        .inp { width: 100%; border-radius: .5rem; border: 1px solid #2a2f3a; background: #0f1115;
          padding: .5rem .75rem; font-size: .875rem; outline: none; color:#e6e9ef; }
        .inp:focus { border-color: #4c8dff; }
      `}</style>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 max-w-md">
      <label className="mb-1 block text-sm text-dsh-muted">{label}</label>
      {children}
    </div>
  );
}
