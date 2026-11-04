# 错误分支覆盖矩阵（2026-11-04 v0.0.13h）

| 请求点 | 失败处理 |
|---|---|
| list/tree | catch → toast error |
| trash list | catch → 空态 |
| restore/purge/empty | catch → toast error + loadTrash |
| export | catch → toast error |
| search (doSearch) | catch → toast + setSearchResults([]) |
| backlinks | catch → backlinksErr=true + 失败态文案 |
| import/upload | catch → skipCount 聚合 + toast |
| content save | catch → toast error |
| job 轮询 | done/error → clearInterval + toast |

- 共 26 处 catch+notify/状态回退，无未处理请求点。
- 结论：覆盖完整。
