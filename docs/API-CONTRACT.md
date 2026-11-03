# dsh-wiki-rag 宿主 HTTP API 契约（冻结版）

客户端 `bundle/src/client/index.tsx` 与宿主 `bundle/src/host/index.ts` 必须严格遵守本契约。
所有响应均为 JSON。错误统一为 `{ "error": "message" }`，HTTP 4xx/5xx。
基址：`http://localhost:3081`，统一前缀 `/api/wiki`。

## 补充契约（0.0.x 正式版）

> 在「既有端点」基础上补充的正式版端点与字段。路径前缀统一为 `/api/wiki`（与既有端点一致）。

### 1. 文件内容保存 + 编辑冲突

- `GET /files/:id/content`：读取 MD 内容（人工编辑链路）。
- `POST /files/:id/content`：保存内容。请求体可带可选 `baseline`（编辑起点内容）。
  - 冲突检测：若磁盘内容同时异于 `baseline` 与提交内容，返回 **`409`** `{ error: 'conflict', diskContent }`。
  - 客户端收到 409 后弹确认：强制覆盖（不带 baseline 重提）或加载磁盘版本放弃本地编辑。

### 2. 结构化日志（过滤 + level/meta）

- `GET /api/wiki/logs`，支持查询参数：
  - `action`：按动作过滤；`level`：按日志级别（info/warn/error 等）过滤；`limit`：条数上限（默认 200）。
  - 返回 `Array<{ time, action, detail, level, meta }>`，`meta` 为 JSON 对象。

### 3. 文件夹重选源

- `POST /folders/:id/rebind-source`：重新选择源文件夹（右键菜单），触发该文件夹重新同步。

### 4. 导入类型扩展

- 支持文件类型：`pdf` / `docx` / `md` / `txt` / `url` / `note` / `sheet`（`.xlsx/.xls/.csv`）/ `pptx`。
- `POST /api/wiki/import`：异步导入，返回 `job`，客户端以 `job.done/total/message` 轮询进度（`status: running | done | error`）。

## 既有端点（保持兼容，不得破坏）
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/list` | - | `Array<KnowledgeFile & {title, kind}>` |
| POST | `/import` | `{source, kind?, noteText?, intranet?, async?}` | 同步=`ImportSummary`；`async:true` 时=`{jobId:string}` |
| POST | `/search` | `{query, topK?}` | `Array<SearchHit>` |
| GET | `/logs` | - | `Array<{time,action,detail}>` |
| GET | `/pending-changes` | - | `Array<PendingChange>` |
| GET | `/stats` | - | `{byType,total,ready,stale}` |
| GET | `/snapshots` | - | `Array<{id,file,created_at,note}>` |
| POST | `/snapshots` | - | `{status:'created',path,list}` |
| POST | `/snapshots/:id/restore` | - | `{status:'restored',files}` |
| DELETE | `/:id` | - | `{status:'deleted',id}` |
| POST | `/:id/sync` | - | `SyncOutcome` |
| POST | `/:id/accept-update` | `{newText:string}` | `{status:'accepted',fileId}` |
| POST | `/:id/dismiss` | - | `{status:'dismissed',fileId}` |
| POST | `/:id/rename` | `{newName:string}` | `{status:'renamed',fileId,file_name,md_path}` |

## 新增端点（本轮必须实现，路径/字段名冻结）

### 1. 树形文件夹
DB：新增表 `folders(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL, parent_id INTEGER, create_time INTEGER)`；
`knowledge_files` 新增列 `folder_id INTEGER DEFAULT NULL`（用 `ALTER TABLE ... ADD COLUMN` 做幂等迁移）。

| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/tree` | - | `TreeNode[]`，见下 |
| POST | `/folders` | `{name:string, parentId?:number\|null}` | `{id:number,name,parentId}` |
| POST | `/folders/:id/rename` | `{name:string}` | `{id,name}` |
| POST | `/folders/:id/move` | `{parentId:number\|null}` | `{id,parentId}` |
| DELETE | `/folders/:id` | - | `{status:'deleted'}`（文件夹内文档/子文件夹移入根，不删除文档） |
| POST | `/files/:id/move` | `{folderId:number\|null}` | `{fileId,folderId}` |

`TreeNode` 形状（递归）：
```ts
type TreeNode =
  | { type:'folder'; id:number; name:string; children:TreeNode[] }
  | { type:'doc'; fileId:number; title:string; kind:string;
      status:'ready'|'stale'|'error'; folderId:number|null };
```

### 2. 设置 / 自定义数据目录
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/settings` | - | `Settings`（见下） |
| POST | `/settings` | `Partial<Settings>` | `{status:'saved', settings:Settings}` |

`Settings`：`{ mdStoragePath, zipStoragePath, snapshotStoragePath, chunkSize, chunkOverlap, webMode, webTimeout, autoSnapshot, embeddingProvider, rerankProvider, rerankTopK }`。
POST 修改存储路径时，把已有 md/zip 文件移动到新目录并更新 DB 路径字段。

### 3. 批量任务进度
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/jobs` | - | `Job[]`（最近，最新在前） |
| GET | `/jobs/:jobId` | - | `Job` |

`Job`：`{ jobId:string, phase:string, done:number, total:number, message:string, status:'running'|'done'|'error', result?:any, error?:string }`。
`POST /import` 带 `async:true` 时立刻返回 `{jobId}`，后台跑导入并实时更新进度（`done/total`）。

### 4. 检查更新
| 方法 | 路径 | 响应 |
|---|---|---|
| GET | `/update-check` | `{currentVersion:string, latestVersion:string, hasUpdate:boolean, packageUrl:string}` |
宿主请求 npm registry `https://registry.npmjs.org/dsh-wiki-rag/latest` 取最新版本号；失败时 `hasUpdate=false` 且不抛 5xx。

### 5. 检索溯源（在既有 /search 响应上补字段）
`SearchHit` 在既有 `{...r, title, content}` 基础上必须包含：
`fileId:number, fileName:string, sourcePath:string(md_path), score:number, chunkIndex:number`。

## 通用要求
- 所有 POST/PUT 入参做类型校验，非法返回 400 `{error}`，不得让服务崩。
- 宿主日志经 `writeLog` 记录关键操作。
- 不引入新的运行时依赖到 bundle（archiver/chokidar/diff/extract-zip/better-sqlite3 已在）。
