/** prompt 插入到输入框已有内容的位置 */
export type InsertPosition = 'prepend' | 'append';

export interface Prompt {
  /** crypto.randomUUID() */
  id: string;
  /** 显示名，≤ 50 字符 */
  name: string;
  /** prompt 正文，≤ 6000 字符（保证 sync 单 item 8KB 配额内） */
  content: string;
  /** 插入位置：prepend = 已有内容之前，append = 之后 */
  position: InsertPosition;
  createdAt: number;
  updatedAt: number;
}

/** 索引 key 的值：记录排序，不冗余到每条 prompt（重排只写 1 次） */
export interface StorageIndex {
  version: 1;
  order: string[];
}

export interface PromptInput {
  name: string;
  content: string;
  position: InsertPosition;
}

/** 单条 prompt 校验上限 */
export const LIMITS = {
  nameMaxLength: 50,
  contentMaxLength: 6000,
} as const;

export function validatePromptInput(input: PromptInput): string | null {
  const name = input.name.trim();
  if (!name) return '名称不能为空';
  if (name.length > LIMITS.nameMaxLength) return `名称不能超过 ${LIMITS.nameMaxLength} 字符`;
  if (!input.content.trim()) return '内容不能为空';
  if (input.content.length > LIMITS.contentMaxLength) {
    return `内容不能超过 ${LIMITS.contentMaxLength} 字符`;
  }
  return null;
}

// ---------- 站点配置 ----------

/** 悬浮按钮锚定元素的确定方式 */
export type AnchorMode = 'auto' | 'selector';

export interface SiteConfig {
  /** builtin-<id> / site-<uuid> */
  id: string;
  /** 显示名 */
  name: string;
  /** 注入匹配模式（chrome match pattern），如 https://www.doubao.com/* */
  matchPatterns: string[];
  /** matchPatterns 对应 hostname，content script 按 location.hostname 命中 */
  hostnames: string[];
  /** 输入框候选选择器（有序，逐一探测）；全部失效时走通用启发式兜底 */
  inputSelectors: string[];
  /** auto = 启发式找输入框可视外壳；selector = 用 anchorSelector 指定依附元素 */
  anchorMode: AnchorMode;
  anchorSelector?: string;
  /** 悬浮按钮相对锚定元素右上角的偏移（right 负值 = 容器外侧右边） */
  buttonOffset: { right: number; down: number };
  /** 内置站点：随版本下发，管理页可见可编辑、不可删除 */
  builtin: boolean;
  enabled: boolean;
}

/** 管理页表单输入 → SiteConfig 的中间形态 */
export interface SiteInput {
  id?: string;
  builtin?: boolean;
  name: string;
  /** 用户填的网址（自动生成 matchPatterns/hostnames）；内置站点不可改 */
  url: string;
  inputSelectors: string[];
  anchorMode: AnchorMode;
  anchorSelector?: string;
  buttonOffset: { right: number; down: number };
  enabled: boolean;
}

export const SITE_LIMITS = {
  nameMaxLength: 30,
  maxSites: 20,
  maxSelectors: 12,
  selectorMaxLength: 200,
} as const;

/** 默认偏移：按钮左缘距输入框右边框线外 16px（32px 按钮 + 16px 间距） */
export const DEFAULT_BUTTON_OFFSET: { right: number; down: number } = { right: -48, down: -6 };

/** 网址 → 匹配模式 + hostname（www 前缀自动附带裸域变体）；非法网址返回 null */
export function urlToPatterns(
  url: string,
): { matchPatterns: string[]; hostnames: string[] } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!host) return null;
  const hosts = host.startsWith('www.') ? [host, host.slice(4)] : [host];
  return {
    matchPatterns: hosts.map((h) => `${u.protocol}//${h}/*`),
    hostnames: hosts,
  };
}

/** otherHosts：其余站点的 hostname 集合，用于冲突检测 */
export function validateSiteInput(input: SiteInput, otherHosts: string[]): string | null {
  const name = input.name.trim();
  if (!name) return '名称不能为空';
  if (name.length > SITE_LIMITS.nameMaxLength) {
    return `名称不能超过 ${SITE_LIMITS.nameMaxLength} 字符`;
  }
  if (!input.builtin) {
    const parsed = urlToPatterns(input.url);
    if (!parsed) return '网址无效（需以 http/https 开头，如 https://example.com）';
    const clash = parsed.hostnames.find((h) => otherHosts.includes(h));
    if (clash) return `站点「${clash}」已存在，同一网站只能配置一条`;
  }
  const sels = input.inputSelectors.map((s) => s.trim()).filter(Boolean);
  if (sels.length > SITE_LIMITS.maxSelectors) {
    return `候选选择器最多 ${SITE_LIMITS.maxSelectors} 条`;
  }
  if (sels.some((s) => s.length > SITE_LIMITS.selectorMaxLength)) {
    return `单个选择器不能超过 ${SITE_LIMITS.selectorMaxLength} 字符`;
  }
  if (input.anchorMode === 'selector') {
    const anchor = (input.anchorSelector ?? '').trim();
    if (!anchor) return '锚定模式为「自定义选择器」时必须填写锚定选择器';
    if (anchor.length > SITE_LIMITS.selectorMaxLength) return '锚定选择器过长';
  }
  if (
    !Number.isFinite(input.buttonOffset.right) ||
    !Number.isFinite(input.buttonOffset.down) ||
    Math.abs(input.buttonOffset.right) > 500 ||
    Math.abs(input.buttonOffset.down) > 500
  ) {
    return '按钮偏移数值无效';
  }
  return null;
}
