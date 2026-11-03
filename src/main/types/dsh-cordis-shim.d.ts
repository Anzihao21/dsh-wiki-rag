/**
 * 宿主（DSH）运行时依赖的宽松类型声明。
 *
 * `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 在本地并未安装，运行时由
 * 加载本包的 DSH 宿主提供（见 `package.json` 的 peerDependencies）。这里仅给出
 * 本插件实际用到的形状的声明，使 `tsc` 能在本地完成类型检查，不引入对宿主内部
 * 类型的硬依赖。
 */

declare module '@deepseek-ai/dsh-tools' {
  /** 定义并校验一个工具，返回注册表可消费的definition。 */
  export function defineTool(options: any): any;
  /** 工具在调用卡片中展示用的视图形态（宽松声明）。 */
  export type GenericCallView = any;
}

declare module '@deepseek-ai/cordis' {
  /** cordis 上下文（宽松声明，仅用于本地类型检查）。 */
  export type Context = any;
}
