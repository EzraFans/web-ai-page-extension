export interface SiteAdapter {
  id: string;
  hostnames: string[];
  /** 找到当前页面的聊天输入框（textarea 或 contenteditable），找不到返回 null */
  findInput(): HTMLElement | null;
  /**
   * 悬浮按钮相对输入框容器右上角的偏移（站点布局差异微调用）。
   * right: 向右离容器右边缘的距离；down: 向下离容器顶边的距离。
   */
  buttonOffset?: { right: number; down: number };
}

/**
 * 从可编辑元素向上找输入框容器：带可见边框/圆角且宽度明显大于编辑元素本身的祖先。
 * 用于把悬浮按钮锚定到输入框整体的右上角，而不是编辑元素本身的右上角。
 */
export function findInputContainer(editEl: HTMLElement): HTMLElement {
  let node: HTMLElement | null = editEl;
  const editWidth = editEl.getBoundingClientRect().width;
  for (let i = 0; i < 6 && node && node.parentElement; i++) {
    node = node.parentElement;
    if (node.clientWidth < 120) continue; // 太窄，不是输入区
    const style = getComputedStyle(node);
    const hasChrome =
      style.borderStyle !== 'none' ||
      Number.parseFloat(style.borderRadius) > 0 ||
      style.boxShadow !== 'none';
    if (hasChrome && node.getBoundingClientRect().width >= editWidth) {
      return node;
    }
  }
  return editEl; // 找不到就退回编辑元素本身
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
