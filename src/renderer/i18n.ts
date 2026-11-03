/**
 * dsh-wiki-rag 渲染进程 i18n 字典。
 * 默认 locale = 'zh'，所有用户可见的硬编码中文统一经 t(key) 取值。
 * 带占位符的条目使用 {name} 形式，调用方通过 String.replace 注入参数。
 */

export type Locale = 'zh' | 'en';

export const defaultLocale: Locale = 'zh';

const messages: Record<Locale, Record<string, string>> = {
  zh: {
    // 顶部导航
    'nav.files': '知识库',
    'nav.import': '导入',
    'nav.settings': '设置',

    // App 全局
    'app.loadFilesFailed': '加载文件列表失败',

    // IPC 错误
    'ipc.unknownChannel': '未知 IPC channel: {channel}',
    'ipc.bridgeUnavailable': 'IPC 桥不可用：缺少 DSH 宿主或全局 handlers',

    // 通用 UI
    'common.search': '搜索',
    'common.close': '关闭',
    'common.confirm': '确定',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.save': '保存',
    'common.refresh': '刷新',

    // Diff 弹窗
    'diff.reject': '拒绝更新',
    'diff.accept': '接受更新',
    'diff.gotIt': '知道了',
    'diff.charsUnit': '字符',
    'diff.noChanges': '无可用变更',
    'diff.sourceLost': '源文件丢失：{reason}',

    // 文件列表
    'fileList.title': '知识库文件',
    'fileList.subtitle': '管理已导入的知识条目，点击条目进入编辑器',
    'fileList.type.url': '网页',
    'fileList.type.note': '笔记',
    'fileList.empty': '暂无文件，请前往「导入」添加',
    'fileList.syncFromSource': '从源目录更新',
    'fileList.deleteTitle': '删除知识条目',
    'fileList.deleteMessage': '确定删除「{name}」及其归档包吗？删除后不可恢复。',

    // 导入面板
    'import.title': '文件导入',
    'import.subtitle': '支持本地、文件夹批量、局域网、网页与笔记五种来源',
    'import.localFile': '本地单文件',
    'import.localFilePlaceholder': '输入源文件绝对路径，如 /data/docs/项目说明.docx',
    'import.localFileButton': '导入文件',
    'import.folder': '本地文件夹批量导入',
    'import.folderPlaceholder': '输入文件夹路径',
    'import.folderButton': '批量导入',
    'import.lanShare': '局域网共享路径',
    'import.lanSharePlaceholder': '\\\\192.168.x.x\\share\\doc 或本地目录',
    'import.lanShareButton': '从共享路径导入',
    'import.lanShareHint': '运行 DSH 的账号需已具备共享目录读写权限',
    'import.webUrl': '网页 URL 抓取',
    'import.webUrlButton': '抓取入库',
    'import.note': '笔记直接添加',
    'import.noteTitlePlaceholder': '笔记标题',
    'import.noteTextPlaceholder': '笔记正文（Markdown）',
    'import.noteButton': '新建知识库文档',
    'import.success': '导入成功',
    'import.skipped': '部分条目被跳过（同名冲突）',
    'import.failed': '导入失败：{msg}',

    // 设置面板
    'settings.title': '设置',
    'settings.subtitle': '存储路径、网页抓取模式与 RAG 切片参数',
    'settings.loading': '加载设置…',
    'settings.mdPath': 'MD 文件存储路径',
    'settings.zipPath': 'Zip 归档存储路径',
    'settings.webMode': '网页抓取模式',
    'settings.webModeIntranet': '内网模式',
    'settings.webModeExtranet': '外网模式',
    'settings.webTimeout': '网页超时（毫秒）',
    'settings.chunkSize': 'RAG 切片大小（字符）',
    'settings.chunkOverlap': '切片重叠字符数',
    'settings.autoSnapshot': '自动快照备份',
    'settings.autoSnapshotHint': '关闭默认，手动开启',
    'settings.saveButton': '保存设置',
    'settings.snapshotButton': '手动创建快照',
    'settings.saved': '已保存',
    'settings.snapshotCreated': '快照已创建',
    'settings.snapshotFailed': '快照失败：{msg}',

    // 编辑器
    'editor.subtitle': '编辑仅修改 MD，不影响 Zip 归档原始文件',
    'editor.wysiwyg': '可视化',
    'editor.source': '源码'
  },

  en: {
    // Navigation
    'nav.files': 'Knowledge Base',
    'nav.import': 'Import',
    'nav.settings': 'Settings',

    // App
    'app.loadFilesFailed': 'Failed to load file list',

    // IPC errors
    'ipc.unknownChannel': 'Unknown IPC channel: {channel}',
    'ipc.bridgeUnavailable': 'IPC bridge unavailable: missing DSH host or global handlers',

    // Common UI
    'common.search': 'Search',
    'common.close': 'Close',
    'common.confirm': 'OK',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.save': 'Save',
    'common.refresh': 'Refresh',

    // Diff modal
    'diff.reject': 'Reject update',
    'diff.accept': 'Accept update',
    'diff.gotIt': 'Got it',
    'diff.charsUnit': 'chars',
    'diff.noChanges': 'No changes available',
    'diff.sourceLost': 'Source file lost: {reason}',

    // File list
    'fileList.title': 'Knowledge Base Files',
    'fileList.subtitle': 'Manage imported entries; click an entry to open the editor',
    'fileList.type.url': 'Web',
    'fileList.type.note': 'Note',
    'fileList.empty': 'No files yet. Go to "Import" to add some.',
    'fileList.syncFromSource': 'Sync from source',
    'fileList.deleteTitle': 'Delete entry',
    'fileList.deleteMessage': 'Delete "{name}" and its archive? This cannot be undone.',

    // Import panel
    'import.title': 'Import Files',
    'import.subtitle': 'Local files, folder batch, LAN share, web URLs and notes',
    'import.localFile': 'Single local file',
    'import.localFilePlaceholder': 'Absolute source path, e.g. /data/docs/project.docx',
    'import.localFileButton': 'Import file',
    'import.folder': 'Batch folder import',
    'import.folderPlaceholder': 'Enter folder path',
    'import.folderButton': 'Batch import',
    'import.lanShare': 'LAN share path',
    'import.lanSharePlaceholder': '\\\\192.168.x.x\\share\\doc or a local directory',
    'import.lanShareButton': 'Import from share',
    'import.lanShareHint': 'The account running DSH needs read/write access to the share',
    'import.webUrl': 'Web URL fetch',
    'import.webUrlButton': 'Fetch into KB',
    'import.note': 'Add note directly',
    'import.noteTitlePlaceholder': 'Note title',
    'import.noteTextPlaceholder': 'Note body (Markdown)',
    'import.noteButton': 'New knowledge document',
    'import.success': 'Import succeeded',
    'import.skipped': 'Some entries skipped (name conflict)',
    'import.failed': 'Import failed: {msg}',

    // Settings panel
    'settings.title': 'Settings',
    'settings.subtitle': 'Storage paths, web fetch mode and RAG chunking parameters',
    'settings.loading': 'Loading settings…',
    'settings.mdPath': 'MD storage path',
    'settings.zipPath': 'Zip archive storage path',
    'settings.webMode': 'Web fetch mode',
    'settings.webModeIntranet': 'Intranet',
    'settings.webModeExtranet': 'Extranet',
    'settings.webTimeout': 'Web timeout (ms)',
    'settings.chunkSize': 'RAG chunk size (chars)',
    'settings.chunkOverlap': 'Chunk overlap (chars)',
    'settings.autoSnapshot': 'Auto snapshot backup',
    'settings.autoSnapshotHint': 'Off by default; enable manually',
    'settings.saveButton': 'Save settings',
    'settings.snapshotButton': 'Create snapshot',
    'settings.saved': 'Saved',
    'settings.snapshotCreated': 'Snapshot created',
    'settings.snapshotFailed': 'Snapshot failed: {msg}',

    // Editor
    'editor.subtitle': 'Editing only changes the MD; the Zip archive stays intact',
    'editor.wysiwyg': 'WYSIWYG',
    'editor.source': 'Source'
  }
};

export function t(key: string, locale?: Locale): string {
  const dict = messages[locale || defaultLocale];
  return dict[key] ?? key;
}
