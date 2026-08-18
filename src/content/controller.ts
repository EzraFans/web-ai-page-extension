import type { Prompt } from '../shared/types';
import type { SiteAdapter } from './adapters';
import { findInputContainer } from './adapters/types';
import { debounce, observeRoute, rafThrottle, waitForElement } from './dom';
import { insertPrompt } from './injector';
import { Panel } from './panel';
import { FLOATER_STYLES } from './styles';
import { el, svgIcon, ICONS } from './ui';

/** 诊断日志（带前缀，方便用户在控制台过滤 wpx 排查问题） */
function log(...args: unknown[]): void {
  console.log('[wpx]', ...args);
}

/**
 * 悬浮按钮 + 下拉面板的控制器。
 * host 挂 document.body（React 不 reconcile body 直接子节点），
 * position: fixed 定位（祖先 transform 陷阱被 body 直挂规避），
 * 输入框 rect 变化时重定位，SPA 路由切换后重探测。
 */
export class FloaterController {
  private host: HTMLElement | null = null;
  private floater: HTMLElement | null = null;
  private toast: HTMLElement | null = null;
  private panel: Panel | null = null;
  private inputEl: HTMLElement | null = null;
  private disposers: Array<() => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(private adapter: SiteAdapter) {}

  destroy(): void {
    this.destroyed = true;
    for (const d of this.disposers) d();
    this.disposers = [];
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.host?.remove();
    this.host = null;
    this.floater = null;
    this.panel = null;
    this.inputEl = null;
  }

  async start(): Promise<void> {
    log('启动：站点', this.adapter.id, location.href);
    // 永不放弃：页面可能慢加载 / 用户先落在无输入框的路由再切到聊天页
    const input = await waitForElement(() => this.adapter.findInput(), {
      timeout: Infinity,
      interval: 500,
    });
    if (!input || this.destroyed) return;
    log(
      '找到输入框',
      input.tagName.toLowerCase() + (input.id ? '#' + input.id : ''),
      'class=', input.className.slice(0, 40),
    );
    this.inputEl = input;
    this.mount();
    this.watchReposition();
    this.watchRoute();
    this.startPoll();
  }

  // ---- 挂载 ----

  private mount(): void {
    if (this.host) return;
    log('挂载悬浮按钮');
    this.host = el('div', { id: 'wpx-root' });
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = FLOATER_STYLES;
    shadow.append(style);

    this.floater = el('div', { class: 'floater' });
    const launcher = el('button', {
      class: 'launcher',
      title: '插入 Prompt',
      'aria-label': '插入 Prompt',
    });
    launcher.append(svgIcon(Array.from(ICONS.bolt), 16));
    launcher.addEventListener('click', (e) => {
      e.stopPropagation();
      this.panel?.setOpen(!this.panel.isOpen());
      this.reposition(); // 打开时重算面板翻转
    });
    launcher.addEventListener('mousedown', (e) => e.preventDefault()); // 避免抢输入框焦点

    this.panel = new Panel((p) => void this.pick(p));

    this.toast = el('div', { class: 'toast ok', style: 'display:none' });

    this.floater.append(launcher, this.panel.root, this.toast);
    shadow.append(this.floater);
    document.body.append(this.host);
    this.reposition();
  }

  // ---- 定位 ----

  private reposition = (): void => {
    if (!this.floater || !this.inputEl) return;
    const input = this.adapter.findInput() ?? this.inputEl;
    this.inputEl = input;

    // 锚定输入框容器（而非编辑元素本身）的右上角，两站点统一观感
    const container = findInputContainer(input);
    const rect = container.getBoundingClientRect();

    const { right: offRight, down: offDown } = this.adapter.buttonOffset ?? {
      right: 8,
      down: -6,
    };
    const BTN = 32;

    // 右上角：按钮右缘与容器右缘对齐偏移，顶缘略高出容器顶边
    let left = rect.right - BTN - offRight;
    let top = rect.top + offDown;

    // 夹紧视口
    left = Math.max(Math.min(left, window.innerWidth - BTN - 4), 4);
    top = Math.max(Math.min(top, window.innerHeight - BTN - 4), 4);

    this.floater.style.left = `${Math.round(left)}px`;
    this.floater.style.top = `${Math.round(top)}px`;

    // 面板避让：右侧/底部放不下时向左/向上翻转
    this.flipPanelIfNeeded();
  };

  private flipPanelIfNeeded(): void {
    const panelEl = this.panel?.root;
    if (!panelEl) return;
    const btnRect = this.floater?.getBoundingClientRect();
    if (!btnRect) return;
    const PANEL_W = 320;
    const PANEL_MAX_H = 420;
    const MARGIN = 8;

    // 水平：默认右对齐展开；若左缘会超出视口 → 让面板右缘贴住按钮左缘向左展开
    const spaceLeft = btnRect.left - MARGIN;
    let panelLeft: number;
    if (spaceLeft >= PANEL_W) {
      panelLeft = btnRect.right - PANEL_W; // 常规：与按钮右对齐
    } else {
      panelLeft = Math.max(MARGIN, btnRect.left - PANEL_W); // 翻转：向左展开
    }

    // 垂直：按钮下方放不下 → 面板底缘对齐按钮顶缘向上展开
    let panelTop = btnRect.bottom + 6;
    const spaceBelow = window.innerHeight - btnRect.bottom - MARGIN;
    if (spaceBelow < Math.min(PANEL_MAX_H, 220)) {
      panelTop = btnRect.top - 6 - Math.min(PANEL_MAX_H, Math.max(btnRect.top - MARGIN, 200));
      panelTop = Math.max(MARGIN, panelTop);
    }

    panelEl.style.left = `${Math.round(panelLeft)}px`;
    panelEl.style.top = `${Math.round(panelTop)}px`;
    panelEl.style.right = 'auto';
  }

  private watchReposition(): void {
    const schedule = rafThrottle(() => this.reposition());
    const onResize = () => schedule();
    const onScroll = () => schedule();
    window.addEventListener('resize', onResize);
    // capture: 捕获内部滚动容器
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    // 输入框可能被 React 重建：MutationObserver 防抖监控 body 子树
    const mo = new MutationObserver(
      debounce(() => {
        const current = this.adapter.findInput();
        if (current && current !== this.inputEl) {
          this.inputEl = current;
        }
        this.reposition();
      }, 150),
    );
    mo.observe(document.body, { childList: true, subtree: true });

    this.disposers.push(
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('scroll', onScroll, { capture: true }),
      () => mo.disconnect(),
    );
  }

  // ---- SPA 路由 ----

  private watchRoute(): void {
    const stop = observeRoute(() => this.remountSoon());
    this.disposers.push(stop);
  }

  private remountSoon(): void {
    // 路由切换瞬间旧输入框可能还在 DOM，延迟等新页面渲染完
    setTimeout(() => void this.recheck(), 600);
    setTimeout(() => void this.recheck(), 1500);
  }

  private async recheck(): Promise<void> {
    if (!this.host) return;
    const input = this.adapter.findInput();
    if (input) {
      this.inputEl = input;
      this.reposition();
    } else {
      // 输入框消失（如进入了设置页）：隐藏，等待再次出现
      if (this.floater) this.floater.style.display = 'none';
      const found = await waitForElement(() => this.adapter.findInput(), {
        timeout: 10000,
        interval: 500,
      });
      if (found) {
        this.inputEl = found;
        if (this.floater) this.floater.style.display = '';
        this.reposition();
      }
    }
  }

  // ---- 兜底轮询：虚拟列表/动画等导致的 rect 漂移 ----

  private startPoll(): void {
    this.pollTimer = setInterval(() => this.reposition(), 800);
  }

  // ---- 选中 prompt ----

  private async pick(p: Prompt): Promise<void> {
    const input = this.adapter.findInput() ?? this.inputEl;
    if (!input) {
      this.showToast('未找到输入框', 'err');
      return;
    }
    this.inputEl = input;
    const ok = await insertPrompt(input, p.content, p.position);
    log('插入结果', ok ? '成功' : '失败', p.name);
    this.showToast(ok ? `已插入「${p.name}」` : '插入失败，请手动粘贴', ok ? 'ok' : 'err');
    if (ok) input.focus();
  }

  private showToast(text: string, kind: 'ok' | 'err'): void {
    if (!this.toast || !this.floater) return;
    this.toast.textContent = text;
    this.toast.className = `toast ${kind}`;
    // 挂在按钮正上方
    const r = this.floater.getBoundingClientRect();
    this.toast.style.left = `${Math.max(4, Math.round(r.right) - 120)}px`;
    this.toast.style.top = `${Math.max(4, Math.round(r.top) - 36)}px`;
    this.toast.style.display = '';
    setTimeout(() => {
      if (this.toast) this.toast.style.display = 'none';
    }, 1800);
  }
}
