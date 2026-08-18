import { storage } from '../shared/storage';
import { validatePromptInput, type InsertPosition, type Prompt } from '../shared/types';
import { el, svgIcon, ICONS } from './ui';

/**
 * 下拉面板：prompt 列表 + 快捷新增表单 + 「管理全部」入口。
 * 全部节点在 shadow root 内，用 createElement 构建（Trusted Types 安全）。
 */
export class Panel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private quickWrap: HTMLElement;
  private quickToggleBtn: HTMLElement;
  private errEl: HTMLElement = el('div', { class: 'quick-error' });
  private prompts: Prompt[] = [];
  private onPick: (p: Prompt) => void;
  private open = false;

  constructor(onPick: (p: Prompt) => void) {
    this.onPick = onPick;

    this.root = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'prompt 选择面板' });

    // 头部：标题 + 管理全部
    const head = el('div', { class: 'panel-head' });
    head.append(el('span', { class: 'panel-title', text: '选择 Prompt' }));
    const manage = el('button', { class: 'manage-link', text: '管理全部 →' });
    manage.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'open-options' });
      this.setOpen(false);
    });
    head.append(manage);

    this.listEl = el('ul', { class: 'list' });

    // 快捷新增（默认收起）
    this.quickToggleBtn = el('button', { class: 'quick-toggle', text: '+ 快捷新增' });
    this.quickWrap = el('div', { class: 'quick-form', style: 'display:none' });
    this.buildQuickForm();

    this.root.append(head, this.listEl, this.quickWrap, this.quickToggleBtn);

    void storage.list().then((ps) => {
      this.prompts = ps;
      this.renderList();
    });
    storage.onChange((ps) => {
      this.prompts = ps;
      this.renderList();
    });

    // 点击面板外部关闭。注意不能用 composedPath 判断「是否点在面板内」：
    // 面板在闭合 Shadow DOM 里，composedPath 对外不暴露内部节点，永远不含
    // panel.root —— 旧写法导致点面板内任何位置（如快捷新增）都被当成外部而关闭。
    // 正确判据：闭合 shadow 内部的点击 e.target 会被重定向到 host 元素。
    document.addEventListener('click', (e) => {
      if (!this.open) return;
      const root = this.root.getRootNode();
      const host = root instanceof ShadowRoot ? root.host : null;
      const t = e.target;
      if (host && t instanceof Node && host.contains(t)) return; // 扩展自己的 UI，不关
      this.setOpen(false);
    }, true);
    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') this.setOpen(false);
    }, true);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle('open', open);
  }

  isOpen(): boolean {
    return this.open;
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    if (this.prompts.length === 0) {
      this.listEl.append(
        el('li', { class: 'empty-tip', text: '还没有 prompt，点下方「快捷新增」创建一条' }),
      );
      return;
    }
    for (const p of this.prompts) {
      const li = el('li', { class: 'item' });
      const nameRow = el('span', { class: 'item-name' });
      nameRow.append(el('span', { text: p.name }));
      nameRow.append(
        el('span', {
          class: `item-pos ${p.position}`,
          text: p.position === 'prepend' ? '前插' : '后加',
        }),
      );
      li.append(nameRow);
      li.append(
        el('span', {
          class: 'item-preview',
          text: p.content.replace(/\s+/g, ' ').slice(0, 60),
        }),
      );
      li.addEventListener('click', () => {
        this.onPick(p);
        this.setOpen(false);
      });
      this.listEl.append(li);
    }
  }

  private buildQuickForm(): void {
    this.quickWrap.replaceChildren();
    this.errEl.replaceChildren();

    const nameRow = el('div', { class: 'quick-row' });
    const nameInput = el('input', {
      class: 'quick-input',
      placeholder: '名称',
      maxlength: '50',
    }) as HTMLInputElement;
    nameRow.append(nameInput);

    const contentInput = el('textarea', {
      class: 'quick-input quick-textarea',
      placeholder: 'prompt 内容…',
    }) as HTMLTextAreaElement;

    const posRow = el('div', { class: 'quick-row' });
    const selectPos = el('select', { class: 'quick-input' }) as HTMLSelectElement;
    const optPrepend = el('option', { value: 'prepend', text: '插入到最前' });
    const optAppend = el('option', { value: 'append', text: '追加到最后' }) as HTMLOptionElement;
    optAppend.selected = true;
    selectPos.append(optPrepend, optAppend);

    const addBtn = el('button', { class: 'quick-add-btn', text: '添加' });
    addBtn.addEventListener('click', () => void submit());
    posRow.append(selectPos, addBtn);

    const submit = async () => {
      const input = {
        name: nameInput.value,
        content: contentInput.value,
        position: selectPos.value as InsertPosition,
      };
      const error = validatePromptInput(input);
      if (error) {
        this.errEl.textContent = error;
        return;
      }
      try {
        await storage.create(input);
        nameInput.value = '';
        contentInput.value = '';
        this.errEl.textContent = '';
        this.quickWrap.style.display = 'none';
        this.quickToggleBtn.style.display = '';
      } catch (e) {
        this.errEl.textContent = e instanceof Error ? e.message : '保存失败';
      }
    };

    this.quickWrap.append(nameRow, contentInput, posRow, this.errEl);

    this.quickToggleBtn.replaceChildren(
      svgIcon(Array.from(ICONS.plus), 12),
      '快捷新增',
    );
    this.quickToggleBtn.addEventListener('click', () => {
      const hidden = this.quickWrap.style.display === 'none';
      this.quickWrap.style.display = hidden ? 'flex' : 'none';
      if (hidden) nameInput.focus();
    });
  }
}
