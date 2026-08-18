/** 等待元素出现（轮询），带超时；timeout 传 Infinity 表示永不放弃 */
export function waitForElement(
  selector: () => HTMLElement | null,
  opts: { timeout?: number; interval?: number } = {},
): Promise<HTMLElement | null> {
  const { timeout = 20000, interval = 300 } = opts;
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = selector();
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

export function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.disabled && !el.readOnly;
  return (el as HTMLElement).isContentEditable;
}

/** 读取输入框当前文本（textarea.value 或 contenteditable 文本） */
export function readValue(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText;
}

/** 把 contenteditable 的光标放到开头/结尾（Range API，最稳） */
export function placeCaret(el: HTMLElement, where: 'start' | 'end'): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(where === 'start');
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 元素可见（非 display:none / 零尺寸 / 被移除） */
export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * 监听 SPA 路由变化：Navigation API（Chrome 138 可用）+ pathname 轮询兜底。
 * 返回取消函数。
 */
export function observeRoute(cb: () => void): () => void {
  const nav = (window as Window & { navigation?: EventTarget }).navigation;
  if (nav) {
    const handler = () => cb();
    nav.addEventListener('navigate', handler);
    return () => nav.removeEventListener('navigate', handler);
  }
  let last = location.pathname;
  const timer = setInterval(() => {
    if (location.pathname !== last) {
      last = location.pathname;
      cb();
    }
  }, 500);
  return () => clearInterval(timer);
}

/** rAF 节流合并多次调度 */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let queued = false;
  let lastArgs: A;
  return (...args: A) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/** 防抖 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
