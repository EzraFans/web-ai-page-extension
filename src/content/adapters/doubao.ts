import { pickBottomMost } from './types';
import type { SiteAdapter } from './types';

/**
 * 豆包输入框适配器。
 * 页面 class 是 CSS Modules 哈希（不可依赖），稳定锚点是 data-testid；
 * 编辑器为字节自研 flow 富文本（大概率 contenteditable div，纯文本模式可能为 textarea）。
 * 候选按稳定性排序，逐一探测。
 */
const CANDIDATES = [
  // data-testid 官方测试锚点（可能是容器或输入框本身，两种都处理）
  '[data-testid="send_textarea"]',
  // flow 富文本编辑器变体
  'div[contenteditable="true"][class*="flow"]',
  // 通用 contenteditable / textarea 兜底
  'textarea[placeholder*="发消息"]',
  'textarea[placeholder*="发送"]',
  // Better_Doubao 生产验证过的输入区容器（tailwind 类名组合）
  '[class*="flex-col-reverse"][class*="items-end"]',
];

export const doubaoAdapter: SiteAdapter = {
  id: 'doubao',
  hostnames: ['www.doubao.com', 'doubao.com'],
  // 统一规格：按钮左缘距输入框右边框线外 16px（-48 = 32px 按钮 + 16px 间距）
  buttonOffset: { right: -48, down: -6 },
  findInput() {
    for (const sel of CANDIDATES) {
      let node: Element | null = null;
      try {
        node = document.querySelector(sel);
      } catch {
        continue;
      }
      if (!node) continue;

      if (isEditable(node)) return node as HTMLElement;

      // 容器：向内探测
      const inner = node.querySelector('textarea, [contenteditable="true"]');
      if (isEditable(inner)) return inner as HTMLElement;
    }
    // 最后兜底：取页面最底部的可见 contenteditable（聊天输入框位置）
    return pickBottomMost('[contenteditable="true"]');
  },
};

function isEditable(node: Element | null): boolean {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    return !node.disabled && !node.readOnly;
  }
  return (node as HTMLElement).isContentEditable;
}
