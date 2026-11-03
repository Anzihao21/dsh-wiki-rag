// 可选/惰性依赖 @xenova/transformers 的模块声明。
// 该包仅在 local embedding / rerank 模式下由代码动态 import 加载，
// 并非硬依赖，因此不纳入 package.json；这里仅声明其模块形状，
// 以满足 tsc 的类型解析（运行时通过 try/catch 优雅降级）。
declare module '@xenova/transformers';
