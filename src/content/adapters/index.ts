import { isVisible } from '../dom';
import type { SiteConfig } from '../../shared/types';
import { findEditableByCandidates, findInputContainer, pickBottomMost } from './types';
import type { SiteAdapter } from './types';

export type { SiteAdapter } from './types';

/**
 * 由站点配置（chrome.storage，管理页可编辑）构造运行时适配器。
 *
 * 输入框查找策略（可靠性降级，网站改版时逐级兜底）：
 *   1. 配置的候选选择器按序探测（语义锚点：id / data-testid / placeholder）
 *   2. 页面最底部的可见 contenteditable（聊天输入框总在底部，改版存活率最高）
 *   3. 页面最底部的可见 textarea
 *
 * 锚定：配置了自定义锚定选择器且命中可见元素时用它，
 * 否则 findInputContainer 启发式（向上找输入框可视外壳）。
 */
export function makeAdapterFromConfig(cfg: SiteConfig): SiteAdapter {
  return {
    id: cfg.id,
    hostnames: cfg.hostnames,
    buttonOffset: cfg.buttonOffset,
    findInput() {
      return (
        findEditableByCandidates(cfg.inputSelectors) ??
        pickBottomMost('[contenteditable="true"]') ??
        pickBottomMost('textarea')
      );
    },
    findAnchor(editEl) {
      if (cfg.anchorMode === 'selector' && cfg.anchorSelector) {
        try {
          const anchor = document.querySelector(cfg.anchorSelector);
          if (anchor instanceof HTMLElement && isVisible(anchor)) return anchor;
        } catch {
          // 非法选择器 → 自动模式兜底
        }
      }
      return findInputContainer(editEl);
    },
  };
}
