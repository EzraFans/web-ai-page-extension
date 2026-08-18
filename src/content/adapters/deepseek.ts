import { findEditableByCandidates, pickBottomMost } from './types';
import type { SiteAdapter } from './types';

/**
 * DeepSeek 输入框适配器。
 * 历史版本为 <textarea id="chat-input">（Illusion 等社区脚本长期使用）；
 * 2025-2026 改版后 id 可能变化，保留 id 锚点的同时加 class/placeholder 兜底，
 * 最后用「页面最底部的可见可编辑元素」通用兜底（聊天输入框总在底部）。
 */
const CANDIDATES = [
  'textarea#chat-input',
  '#chat-input', // id 存在但变体为 contenteditable 时
  '.chat-input textarea',
  'textarea.input-box',
  'textarea[placeholder*="DeepSeek"]',
  'textarea[placeholder*="发送"]',
  'div[contenteditable="true"]',
];

export const deepseekAdapter: SiteAdapter = {
  id: 'deepseek',
  hostnames: ['chat.deepseek.com'],
  buttonOffset: { right: 10, down: -6 },
  findInput() {
    const found = findEditableByCandidates(CANDIDATES);
    if (found) return found;
    // 通用兜底：优先 contenteditable，其次 textarea，取最靠下的可见者
    return pickBottomMost('[contenteditable="true"]') ?? pickBottomMost('textarea');
  },
};
