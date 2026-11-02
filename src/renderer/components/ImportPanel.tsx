import React, { useState } from 'react';
import { ipc } from '../ipc';

interface Props {
  onImported: () => void;
}

/**
 * 文件导入面板：本地单文件 / 文件夹批量 / 局域网路径 / 网页URL / 笔记。
 */
export default function ImportPanel({ onImported }: Props) {
  const [localPath, setLocalPath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [url, setUrl] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (p: Promise<any>) => {
    setMsg('');
    try {
      const r = await p;
      setMsg(r?.skipped ? `跳过：${r.reason}` : '导入成功');
      onImported();
    } catch (e) {
      setMsg(`导入失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <h1 className="mb-6 text-lg font-semibold">文件导入</h1>

      <Section title="本地单文件">
        <input
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
          placeholder="输入源文件绝对路径，如 /data/docs/项目说明.docx"
          className="inp"
        />
        <Btn onClick={() => run(ipc('wiki:importFile', localPath))} disabled={!localPath}>
          导入文件
        </Btn>
      </Section>

      <Section title="本地文件夹批量导入">
        <input
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="输入文件夹路径"
          className="inp"
        />
        <Btn onClick={() => run(ipc('wiki:importFolder', folderPath))} disabled={!folderPath}>
          批量导入
        </Btn>
      </Section>

      <Section title="局域网共享路径">
        <input
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder='\\192.168.x.x\share\doc 或本地目录'
          className="inp"
        />
        <Btn onClick={() => run(ipc('wiki:importFolder', folderPath))} disabled={!folderPath}>
          从共享路径导入
        </Btn>
        <p className="mt-2 text-xs text-dsh-muted">
          运行 DSH 的账号需已具备共享目录读写权限
        </p>
      </Section>

      <Section title="网页 URL 抓取">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/page"
          className="inp"
        />
        <Btn onClick={() => run(ipc('wiki:importUrl', url))} disabled={!url}>
          抓取入库
        </Btn>
      </Section>

      <Section title="笔记直接添加">
        <input
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="笔记标题"
          className="inp"
        />
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="笔记正文（Markdown）"
          className="inp h-28 resize-y"
        />
        <Btn
          onClick={() => run(ipc('wiki:importNote', noteTitle, noteText))}
          disabled={!noteTitle}
        >
          新建知识库文档
        </Btn>
      </Section>

      {msg && <div className="mt-4 rounded-md bg-dsh-panel px-4 py-2 text-sm text-dsh-accent">{msg}</div>}

      <style>{`
        .inp { width: 100%; border-radius: .5rem; border: 1px solid #2a2f3a; background: #0f1115;
          padding: .5rem .75rem; font-size: .875rem; outline: none; margin-bottom: .5rem; color:#e6e9ef; }
        .inp:focus { border-color: #4c8dff; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-dsh-border bg-dsh-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-dsh-muted">{title}</h2>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-dsh-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
