export interface SiteAdapter {
  id: string;
  hostnames: string[];
  /** 找到当前页面的聊天输入框（textarea 或 contenteditable），找不到返回 null */
  findInput(): HTMLElement | null;
  /**
   * 悬浮按钮相对输入框容器右上角的偏移（站点布局差异微调用）。
   * right: 按钮右缘离容器右边缘的距离（负值 = 放到容器外侧右边，不遮挡输入区）；
   * down: 按钮顶缘离容器顶边的距离（负值 = 略高出容器顶边）。
   */
  buttonOffset?: { right: number; down: number };
}

/**
 * 从可编辑元素向上找输入框的「可视外壳」（带边框/圆角/阴影/底色的盒子）。
 * 用于把悬浮按钮锚定到输入框右边框线外侧。
 * 规则：向上收集所有带外壳特征、宽度在 [编辑元素, 1.35×编辑元素] 窗口内的祖先，
 * 取**最宽**的——内层圆角装饰比它窄会被淘汰，整个聊天列（超窗口）会被排除，
 * 留下的最宽者即使不是边框本尊，也是与输入框同宽的外层，右缘一致。
 * 窗口内一个都没有时退回第一个带外壳特征的宽祖先，最后退回编辑元素本身。
 */
export function findInputContainer(editEl: HTMLElement): HTMLElement {
  let node: HTMLElement | null = editEl;
  const editWidth = editEl.getBoundingClientRect().width;
  let fallback: HTMLElement | null = null;
  let best: HTMLElement | null = null;
  let bestW = 0;
  for (let i = 0; i < 12 && node && node.parentElement; i++) {
    node = node.parentElement;
    if (node.clientWidth < 120) continue; // 太窄，不是输入区
    const style = getComputedStyle(node);
    const hasChrome =
      style.borderStyle !== 'none' ||
      Number.parseFloat(style.borderRadius) > 0 ||
      style.boxShadow !== 'none' ||
      style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (!hasChrome) continue;
    const w = node.getBoundingClientRect().width;
    if (w < editWidth) continue; // 比编辑元素还窄，是内层装饰
    if (w <= editWidth * 1.35) {
      if (w > bestW) {
        best = node;
        bestW = w;
      }
    } else if (!fallback) {
      fallback = node; // 超窗口的宽容器（整个聊天列），仅兜底
    }
  }
  return best ?? fallback ?? editEl;
}

/** 从候选选择器中找第一个可见的可编辑元素；命中容器时向内探测 */
export function findEditableByCandidates(candidates: string[]): HTMLElement | null {
  for (const sel of candidates) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(sel);
    } catch {
      continue; // 非法选择器，跳过
    }
    // 遍历所有匹配：页面可能存在隐藏副本（移动端适配等），只取第一个可见的
    for (const node of nodes) {
      if (!isEditableNode(node)) continue;

      // 本身可见可编辑 → 直接用
      if (isVisibleNode(node)) return node as HTMLElement;

      // 不可见：若是容器，看看里面有没有可见的可编辑元素
      const inner = node.querySelector('textarea, [contenteditable="true"]');
      if (inner && isEditableNode(inner) && isVisibleNode(inner)) return inner as HTMLElement;
    }
  }
  return null;
}

/** 元素当前可见（有尺寸且未被 display:none 隐藏） */
function isVisibleNode(node: Element): boolean {
  if (!node.isConnected) return false;
  if ((node as HTMLElement).offsetParent === null && !(node instanceof HTMLBodyElement)) {
    // offsetParent 为 null：display:none 或 fixed。fixed 时 rect 仍有尺寸，再验证一次
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  return true;
}

/** 多个可编辑元素并存时，取最靠近视口底部的可见者（聊天输入框通常在底部） */
export function pickBottomMost(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll(selector));
  let best: HTMLElement | null = null;
  let bestTop = -Infinity;
  for (const n of nodes) {
    if (!isEditableNode(n)) continue;
    const rect = (n as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.top > bestTop) {
      bestTop = rect.top;
      best = n as HTMLElement;
    }
  }
  return best;
}

function isEditableNode(node: Element | null): boolean {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    return !node.disabled && !node.readOnly;
  }
  return (node as HTMLElement).isContentEditable;
}
