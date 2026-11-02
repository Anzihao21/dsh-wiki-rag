// 模块声明补充（第三方包缺少 TS 类型时使用）
declare module 'diff' {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }
  export function diffLines(oldStr: string, newStr: string, options?: any): Change[];
  export function diffWords(oldStr: string, newStr: string, options?: any): Change[];
  export function diffChars(oldStr: string, newStr: string, options?: any): Change[];
}
