import { DEFAULT_BUTTON_OFFSET, type SiteConfig } from './types';

/**
 * 内置站点：随版本下发，管理页可见、可编辑（选择器/偏移/开关）、不可删除。
 * 候选选择器按稳定性排序：语义锚点（id/testid/placeholder）在前，
 * 全部失效时 content script 还有「页面最底部可见可编辑元素」通用兜底。
 */
export const DEFAULT_SITES: SiteConfig[] = [
  {
    id: 'builtin-deepseek',
    name: 'DeepSeek',
    matchPatterns: ['https://chat.deepseek.com/*'],
    hostnames: ['chat.deepseek.com'],
    inputSelectors: [
      'textarea#chat-input',
      '#chat-input', // id 存在但变体为 contenteditable 时
      '.chat-input textarea',
      'textarea.input-box',
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="Message"]', // 英文界面 "Message DeepSeek"
      'textarea[placeholder*="Ask"]',
      'div[contenteditable="true"]',
    ],
    anchorMode: 'auto',
    buttonOffset: { ...DEFAULT_BUTTON_OFFSET },
    builtin: true,
    enabled: true,
  },
  {
    id: 'builtin-doubao',
    name: '豆包',
    matchPatterns: ['https://www.doubao.com/*', 'https://doubao.com/*'],
    hostnames: ['www.doubao.com', 'doubao.com'],
    inputSelectors: [
      // data-testid 官方测试锚点（可能是容器或输入框本身，两种都处理）
      '[data-testid="send_textarea"]',
      // flow 富文本编辑器变体（class 为 CSS Modules 哈希，仅作低优候选）
      'div[contenteditable="true"][class*="flow"]',
      'textarea[placeholder*="发消息"]',
      'textarea[placeholder*="发送"]',
    ],
    anchorMode: 'auto',
    buttonOffset: { ...DEFAULT_BUTTON_OFFSET },
    builtin: true,
    enabled: true,
  },
];
