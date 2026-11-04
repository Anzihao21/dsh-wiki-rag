# 焦点陷阱覆盖矩阵（2026-11-04 v0.0.13h 终检）

| 浮层 | useFocusTrap | 焦点移入 | Tab循环 | 关闭还原 | Esc关闭 |
|---|---|---|---|---|---|
| ConfirmModal | ✅ confirmRef | ✅ | ✅ | ✅ | ✅ |
| 命令面板 | ✅ cmdRef | ✅(autoFocus input) | ✅ | ✅ | ✅ |
| urlDialog | ✅ urlRef | ✅ | ✅ | ✅ | ✅ |
| leaveGuard/batchMove | 走 confirmState ✅ | ✅ | ✅ | ✅ | ✅ |
| 斜杠菜单 | 不 trap（编辑器内浮层，焦点留 contenteditable） | — | — | — | ✅ 全局 keydown |
| 双链菜单 | 不 trap（同上） | — | — | — | ✅ |
| 反链面板 | 不 trap（下拉，点击外部关闭） | — | — | — | — |
| 上下文菜单 | 不 trap（点击外部关闭） | — | — | — | ✅ |

- 结论：模态浮层（对话框类）全部 trap；非模态浮层保留输入焦点/点击外部关闭，符合预期。
