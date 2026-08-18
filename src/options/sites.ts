import { el } from './el';
import { sites } from '../shared/storage';
import { syncSiteScripts } from '../shared/site-scripts';
import {
  DEFAULT_BUTTON_OFFSET,
  validateSiteInput,
  urlToPatterns,
  type AnchorMode,
  type SiteConfig,
  type SiteInput,
} from '../shared/types';

/**
 * 站点管理板块：内置站点（豆包/DeepSeek，随版本下发，可编辑不可删）
 * + 用户自建站点（保存时申请域名授权并动态注册 content script）。
 */

interface SiteEditorState {
  /** null = 新建 */
  editingId: string | null;
  name: string;
  url: string;
  /** textarea 原文，每行一个选择器 */
  inputSelectors: string;
  anchorMode: AnchorMode;
  anchorSelector: string;
  offsetRight: string;
  offsetDown: string;
  enabled: boolean;
}

let siteList: SiteConfig[] = [];
let siteEditor: SiteEditorState | null = null;
let siteSaving = false;
/** 自建站点的域名授权状态（id → 是否已授权），用于卡片角标 */
const permOk: Record<string, boolean> = {};
let rerenderFn: () => void = () => {};

export function initSites(rerender: () => void): void {
  rerenderFn = rerender;
  sites.onChange((next) => void applyList(next));
  void refresh();
}

async function refresh(): Promise<void> {
  siteList = await sites.list();
  await refreshPerms();
  rerenderFn();
}

async function applyList(next: SiteConfig[]): Promise<void> {
  siteList = next;
  await refreshPerms();
  rerenderFn();
}

async function refreshPerms(): Promise<void> {
  for (const s of siteList) {
    if (s.builtin) continue;
    permOk[s.id] = await chrome.permissions.contains({ origins: s.matchPatterns });
  }
}

// ---------- 渲染 ----------

export function renderSitesSection(): HTMLElement {
  const panel = el('section', { class: 'panel' });
  panel.append(
    el('h2', { class: 'panel-title', textContent: `站点管理（${siteList.length}）` }),
    el('p', {
      class: 'site-hint',
      textContent:
        '内置站点随扩展提供、不可删除；自建站点保存时需授权对应域名。候选选择器全部失效时仍会自动兜底查找页面底部的输入框。',
    }),
  );

  const ul = el('ul', { class: 'site-list' });
  for (const s of siteList) ul.append(renderSiteCard(s));
  panel.append(ul);

  if (siteEditor) {
    panel.append(renderSiteEditor());
  } else {
    const add = el('button', { class: 'btn btn-primary', type: 'button', textContent: '+ 新增站点' });
    add.onclick = () => {
      siteEditor = emptySiteEditor();
      rerenderFn();
    };
    panel.append(add);
  }
  return panel;
}

function renderSiteCard(s: SiteConfig): HTMLElement {
  const li = el('li', { class: 'site-card' });

  const main = el('div', { class: 'item-main' });
  const nameRow = el('div', { class: 'item-name-row' });
  nameRow.append(el('span', { class: 'item-name', textContent: s.name }));
  nameRow.append(
    el('span', { class: `tag ${s.builtin ? 'tag-append' : 'tag-prepend'}`, textContent: s.builtin ? '内置' : '自建' }),
  );
  if (!s.enabled) {
    nameRow.append(el('span', { class: 'tag tag-prepend', textContent: '已禁用' }));
  } else if (!s.builtin) {
    nameRow.append(
      el('span', {
        class: `tag ${permOk[s.id] ? 'tag-append' : 'tag-prepend'}`,
        textContent: permOk[s.id] ? '已授权' : '未授权',
      }),
    );
  }
  main.append(nameRow);
  main.append(el('div', { class: 'site-hosts', textContent: s.hostnames.join('、') }));

  const actions = el('div', { class: 'item-actions' });
  const toggle = el('input', { type: 'checkbox' }) as HTMLInputElement;
  toggle.checked = s.enabled;
  toggle.addEventListener('change', () => void toggleSite(s, toggle.checked));
  const toggleLabel = el('label', { class: 'switch-label' });
  toggleLabel.append(toggle, ' 启用');
  actions.append(toggleLabel);

  const edit = el('button', { class: 'btn btn-ghost btn-sm', textContent: '编辑' });
  edit.onclick = () => startSiteEdit(s.id);
  actions.append(edit);

  if (!s.builtin) {
    if (s.enabled && !permOk[s.id]) {
      // 导入/授权被收回后补授权（权限请求需要点击手势）
      const auth = el('button', { class: 'btn btn-ghost btn-sm', textContent: '授权' });
      auth.onclick = () => void authorizeSite(s);
      actions.append(auth);
    }
    const del = el('button', { class: 'btn btn-danger btn-sm', textContent: '删除' });
    del.onclick = () => void removeSite(s);
    actions.append(del);
  }

  li.append(main, actions);
  return li;
}

function renderSiteEditor(): HTMLElement {
  const editing = siteEditor!.editingId
    ? siteList.find((s) => s.id === siteEditor!.editingId) ?? null
    : null;

  const form = el('form', { class: 'form' });
  form.addEventListener('submit', (e) => e.preventDefault());

  // 名称
  form.append(el('label', { class: 'field-label', textContent: '名称' }));
  const nameInput = el('input', {
    class: 'input',
    value: siteEditor!.name,
    placeholder: '例如：通义千问',
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => (siteEditor!.name = nameInput.value));
  form.append(nameInput);

  // 网址（内置不可改）
  form.append(
    el('label', {
      class: 'field-label',
      textContent: editing?.builtin ? '网址（内置站点固定）' : '网址',
    }),
  );
  const urlInput = el('input', {
    class: 'input',
    value: siteEditor!.url,
    placeholder: 'https://chat.example.com',
  }) as HTMLInputElement;
  urlInput.addEventListener('input', () => (siteEditor!.url = urlInput.value));
  if (editing?.builtin) urlInput.disabled = true;
  form.append(urlInput);

  // 输入框候选选择器
  form.append(
    el('label', { class: 'field-label', textContent: '输入框候选选择器（每行一个，按序探测）' }),
  );
  const selInput = el('textarea', {
    class: 'input textarea site-selectors',
    rows: '6',
    placeholder:
      '每行一个 CSS 选择器，例如：\ntextarea#chat-input\n[data-testid="send_textarea"]\ntextarea[placeholder*="发送"]',
  }) as HTMLTextAreaElement;
  selInput.value = siteEditor!.inputSelectors;
  selInput.addEventListener('input', () => (siteEditor!.inputSelectors = selInput.value));
  form.append(selInput);

  // 锚定模式
  form.append(el('div', { class: 'field-label', textContent: '图标锚定（悬浮按钮依附的元素）' }));
  const anchorRow = el('div', { class: 'radio-row' });
  for (const [mode, label] of [
    ['auto', '自动（输入框可视外壳）'],
    ['selector', '自定义选择器'],
  ] as Array<[AnchorMode, string]>) {
    const id = `anchor-${mode}`;
    const radio = el('input', { type: 'radio', id, name: 'anchor', value: mode }) as HTMLInputElement;
    radio.checked = siteEditor!.anchorMode === mode;
    radio.addEventListener('change', () => {
      if (radio.checked) siteEditor!.anchorMode = mode;
      anchorSel.disabled = siteEditor!.anchorMode !== 'selector';
    });
    const lab = el('label', { class: 'radio-label', for: id, textContent: label });
    lab.prepend(radio);
    anchorRow.append(lab);
  }
  form.append(anchorRow);
  const anchorSel = el('input', {
    class: 'input',
    value: siteEditor!.anchorSelector,
    placeholder: '锚定元素选择器（如 .chat-input-box）',
  }) as HTMLInputElement;
  anchorSel.disabled = siteEditor!.anchorMode !== 'selector';
  anchorSel.addEventListener('input', () => (siteEditor!.anchorSelector = anchorSel.value));
  form.append(anchorSel);

  // 偏移
  form.append(
    el('div', {
      class: 'field-label',
      textContent: '按钮偏移（默认 -48 / -6 = 输入框右边框线外 16px、略高出顶边）',
    }),
  );
  const offsetRow = el('div', { class: 'offset-row' });
  const rightInput = el('input', {
    class: 'input',
    type: 'number',
    value: siteEditor!.offsetRight,
  }) as HTMLInputElement;
  rightInput.addEventListener('input', () => (siteEditor!.offsetRight = rightInput.value));
  const downInput = el('input', {
    class: 'input',
    type: 'number',
    value: siteEditor!.offsetDown,
  }) as HTMLInputElement;
  downInput.addEventListener('input', () => (siteEditor!.offsetDown = downInput.value));
  offsetRow.append(rightInput, downInput);
  form.append(offsetRow);

  // 启用
  const enableLabel = el('label', { class: 'switch-label' });
  const enableCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
  enableCheck.checked = siteEditor!.enabled;
  enableCheck.addEventListener('change', () => (siteEditor!.enabled = enableCheck.checked));
  enableLabel.append(enableCheck, ' 启用该站点');
  form.append(enableLabel);

  // 错误与按钮
  const err = el('div', { class: 'form-error', role: 'alert' });
  const btnRow = el('div', { class: 'btn-row' });
  const save = el('button', { class: 'btn btn-primary', type: 'button', textContent: editing ? '保存' : '添加' });
  save.onclick = () => void saveSite(err);
  const cancel = el('button', { class: 'btn btn-ghost', type: 'button', textContent: '取消' });
  cancel.onclick = () => {
    siteEditor = null;
    rerenderFn();
  };
  btnRow.append(save, cancel);
  form.append(err, btnRow);

  return form;
}

// ---------- 动作 ----------

function emptySiteEditor(): SiteEditorState {
  return {
    editingId: null,
    name: '',
    url: '',
    inputSelectors: '',
    anchorMode: 'auto',
    anchorSelector: '',
    offsetRight: String(DEFAULT_BUTTON_OFFSET.right),
    offsetDown: String(DEFAULT_BUTTON_OFFSET.down),
    enabled: true,
  };
}

function startSiteEdit(id: string): void {
  const s = siteList.find((x) => x.id === id);
  if (!s) return;
  siteEditor = {
    editingId: s.id,
    name: s.name,
    url: s.matchPatterns[0]?.replace(/\/\*$/, '') ?? '',
    inputSelectors: s.inputSelectors.join('\n'),
    anchorMode: s.anchorMode,
    anchorSelector: s.anchorSelector ?? '',
    offsetRight: String(s.buttonOffset.right),
    offsetDown: String(s.buttonOffset.down),
    enabled: s.enabled,
  };
  rerenderFn();
}

/** 除当前编辑对象外其他站点的 hostname（冲突检测用） */
function otherHosts(): string[] {
  return siteList
    .filter((s) => s.id !== siteEditor?.editingId)
    .flatMap((s) => s.hostnames);
}

function isValidSelector(sel: string): boolean {
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

function num(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function saveSite(errEl: HTMLElement): Promise<void> {
  if (!siteEditor || siteSaving) return;
  const editing = siteEditor.editingId
    ? siteList.find((s) => s.id === siteEditor!.editingId) ?? null
    : null;

  const input: SiteInput = {
    id: editing?.id,
    builtin: editing?.builtin,
    name: siteEditor.name,
    url: siteEditor.url,
    inputSelectors: siteEditor.inputSelectors
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    anchorMode: siteEditor.anchorMode,
    anchorSelector: siteEditor.anchorSelector.trim() || undefined,
    buttonOffset: {
      right: num(siteEditor.offsetRight, DEFAULT_BUTTON_OFFSET.right),
      down: num(siteEditor.offsetDown, DEFAULT_BUTTON_OFFSET.down),
    },
    enabled: siteEditor.enabled,
  };

  const error = validateSiteInput(input, otherHosts());
  if (error) {
    errEl.textContent = error;
    return;
  }
  // 选择器语法校验（options 页有 DOM 环境）
  const allSels = [...input.inputSelectors, ...(input.anchorSelector ? [input.anchorSelector] : [])];
  for (const sel of allSels) {
    if (!isValidSelector(sel)) {
      errEl.textContent = `选择器语法无效：${sel}`;
      return;
    }
  }
  if (siteList.length >= 20 && !editing) {
    errEl.textContent = '站点数量已达上限（20）';
    return;
  }

  siteSaving = true;
  try {
    let cfg: SiteConfig;
    if (editing) {
      cfg = {
        ...editing,
        name: input.name.trim(),
        inputSelectors: input.inputSelectors,
        anchorMode: input.anchorMode,
        anchorSelector: input.anchorSelector,
        buttonOffset: input.buttonOffset,
        enabled: input.enabled,
      };
    } else {
      const parsed = urlToPatterns(input.url)!; // 校验已通过
      // 域名授权必须紧跟用户手势调用，放在所有异步操作之前
      const granted = await chrome.permissions.request({ origins: parsed.matchPatterns });
      if (!granted) {
        errEl.textContent = '未授予站点访问权限，扩展无法在该网站注入';
        return;
      }
      cfg = {
        id: `site-${crypto.randomUUID()}`,
        name: input.name.trim(),
        matchPatterns: parsed.matchPatterns,
        hostnames: parsed.hostnames,
        inputSelectors: input.inputSelectors,
        anchorMode: input.anchorMode,
        anchorSelector: input.anchorSelector,
        buttonOffset: input.buttonOffset,
        builtin: false,
        enabled: input.enabled,
      };
    }

    await sites.save(cfg);
    siteList = await sites.list();
    const result = await syncSiteScripts(siteList);
    siteEditor = null;
    rerenderFn();
    if (result.failed.length) {
      alert(`已保存，但以下站点注册失败（域名可能未授权）：\n${result.failed.join('、')}`);
    }
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : '保存失败';
  } finally {
    siteSaving = false;
  }
}

async function toggleSite(s: SiteConfig, enabled: boolean): Promise<void> {
  await sites.save({ ...s, enabled });
  siteList = await sites.list();
  await syncSiteScripts(siteList);
  rerenderFn();
}

async function authorizeSite(s: SiteConfig): Promise<void> {
  const granted = await chrome.permissions.request({ origins: s.matchPatterns });
  if (!granted) {
    alert('未授权，扩展无法在该网站注入');
    return;
  }
  permOk[s.id] = true;
  siteList = await sites.list();
  await syncSiteScripts(siteList);
  rerenderFn();
}

async function removeSite(s: SiteConfig): Promise<void> {
  if (!confirm(`确定删除「${s.name}」？`)) return;
  await sites.remove(s.id);
  // 顺带收回域名授权，不留残留
  await chrome.permissions.remove({ origins: s.matchPatterns }).catch(() => undefined);
  siteList = await sites.list();
  await syncSiteScripts(siteList);
  if (siteEditor?.editingId === s.id) siteEditor = null;
  rerenderFn();
}
