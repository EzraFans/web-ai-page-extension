/**
 * prompt 变量占位符：插入前把 {{name}} 替换为运行时值。
 * 支持的变量（ SUPPORTED_VARS ）以外的 {{xxx}} 原样保留，不影响用户文本。
 * 解析失败的变量（如剪贴板无权限）同样保留字面量并计入 failed，由调用方提示。
 *
 * 本模块保持纯净（不依赖 chrome/DOM），便于 node --test 直接测试；
 * 页面侧由 content script 提供 VarContext 的实际取值函数。
 */

export const SUPPORTED_VARS = [
  'clipboard',
  'selection',
  'date',
  'time',
  'datetime',
  'url',
  'title',
] as const;

export type VarName = (typeof SUPPORTED_VARS)[number];

export interface VarContext {
  /** 剪贴板读取（可能因权限/焦点失败） */
  clipboard?: () => Promise<string>;
  /** 当前页面选中文本（可为空串） */
  selection?: () => string;
  url?: string;
  title?: string;
  /** 注入当前时间，测试用 */
  now?: Date;
}

export interface ResolveResult {
  text: string;
  /** 未能解析、已保留字面量的变量名 */
  failed: VarName[];
}

const PATTERN = () => /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 同步可解的静态变量；调用前已确认 name 在 SUPPORTED_VARS 内 */
function resolveStatic(name: VarName, ctx: VarContext): string {
  const now = ctx.now ?? new Date();
  switch (name) {
    case 'date':
      return fmtDate(now);
    case 'time':
      return fmtTime(now);
    case 'datetime':
      return `${fmtDate(now)} ${fmtTime(now)}`;
    case 'url':
      return ctx.url ?? '';
    case 'title':
      return ctx.title ?? '';
    default:
      return '';
  }
}

export async function resolveVariables(text: string, ctx: VarContext): Promise<ResolveResult> {
  const failed = new Set<VarName>();
  const matches = [...text.matchAll(PATTERN())];
  if (matches.length === 0) return { text, failed: [] };

  const supported = new Set<string>(SUPPORTED_VARS);
  let out = '';
  let last = 0;
  for (const m of matches) {
    const name = m[1];
    out += text.slice(last, m.index);
    last = m.index + m[0].length;

    if (!supported.has(name)) {
      out += m[0]; // 用户自己的 {{xxx}} 文本，不动
      continue;
    }
    // Set.has 不做类型收窄，这里已确认是受支持的变量名
    const varName = name as VarName;
    if (varName === 'clipboard') {
      if (!ctx.clipboard) {
        failed.add(varName);
        out += m[0];
      } else {
        try {
          out += await ctx.clipboard();
        } catch {
          failed.add(varName);
          out += m[0]; // 读取失败保留字面量，插入后用户可见并知道没替换
        }
      }
    } else if (varName === 'selection') {
      out += ctx.selection?.() ?? '';
    } else {
      out += resolveStatic(varName, ctx);
    }
  }
  out += text.slice(last);
  return { text: out, failed: [...failed] };
}

/** 文本中出现的已支持变量名（预览/提示用） */
export function usedVariables(text: string): VarName[] {
  const supported = new Set<string>(SUPPORTED_VARS);
  return [...text.matchAll(PATTERN())]
    .map((m) => m[1])
    .filter((n): n is VarName => supported.has(n));
}
