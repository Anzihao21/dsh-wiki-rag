/**
 * dsh-wiki-rag 客户端插件（DSH Web 浏览器侧）
 *
 * 目前为最小骨架：验证 dsh.client manifest + exports["./client"] 加载链路。
 * UI（文件列表/设置面板）将通过 ctx.slots 注入，后续迭代逐步接入。
 */
export function apply(ctx: unknown): void {
  // 客户端 Cordis 运行时 apply；后续用 ctx.slots.register 注入 UI
  void ctx;
}
