import { storage } from '../shared/storage';
import {
  LIMITS,
  validatePromptInput,
  type InsertPosition,
  type Prompt,
} from '../shared/types';
import { el } from './el';
import { initSites, renderSitesSection } from './sites';
import { exportAll, importFromFile } from './backup';

type Tab = 'prompts' | 'sites';
const TABS: Array<[Tab, string]> = [
  ['prompts', 'Prompt 管理'],
  ['sites', '站点管理'],
];

interface EditorState {
  /** null = 新建 */
  editingId: string | null;
  name: string;
  content: string;
  position: InsertPosition;
}

let prompts: Prompt[] = [];
let editor: EditorState = emptyEditor();
/** 保存防重入：避免连点 / 双事件触发造成重复创建 */
let saving = false;
let tab: Tab = 'prompts';

function emptyEditor(): EditorState {
  return { editingId: null, name: '', content: '', position: 'append' };
}

export function initApp(root: HTMLElement): void {
  render(root);
  initSites(() => render(root));

  storage.onChange((next) => {
    prompts = next;
    // 若正在编辑的条目被（其他页面）删除，退出编辑态
    if (editor.editingId && !prompts.some((p) => p.id === editor.editingId)) {
      editor = emptyEditor();
    }
    render(root);
  });

  void storage.list().then((next) => {
    prompts = next;
    render(root);
  });
}

// ---------- 渲染 ----------

function render(root: HTMLElement): void {
  root.replaceChildren();

  const shell = el('div', { class: 'shell' });
  const header = el('header', { class: 'header' });

  const headMain = el('div', {});
  headMain.append(
    el('h1', { class: 'title', textContent: 'AI Prompt 快速插入' }),
    el('p', {
      class: 'subtitle',
      textContent: '在豆包 / DeepSeek 输入框旁的悬浮按钮中选择 prompt，仅填入不自动发送。',
    }),
  );

  // 备份：导出 / 导入
  const actions = el('div', { class: 'header-actions' });
  const expBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', textContent: '导出配置' });
  expBtn.onclick = () => void exportAll();
  const fileInput = el('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = ''; // 允许重复选择同一文件
    if (f) void importFromFile(f);
  });
  const impBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', textContent: '导入配置' });
  impBtn.onclick = () => fileInput.click();
  actions.append(impBtn, expBtn, fileInput);

  header.append(headMain, actions);
  shell.append(header);

  // Tab 切换：Prompt 管理 / 站点管理
  const tabs = el('div', { class: 'tabs' });
  for (const [key, label] of TABS) {
    const btn = el('button', {
      class: `tab${tab === key ? ' active' : ''}`,
      type: 'button',
      textContent: label,
    });
    btn.onclick = () => {
      if (tab !== key) {
        tab = key;
        render(root);
      }
    };
    tabs.append(btn);
  }
  shell.append(tabs);

  if (tab === 'sites') {
    shell.append(renderSitesSection());
  } else {
    const layout = el('div', { class: 'layout' });
    layout.append(renderList(), renderEditor());
    shell.append(layout);
  }
  root.append(shell);
}

function renderList(): HTMLElement {
  const listWrap = el('section', { class: 'panel list-panel' });
  listWrap.append(el('h2', { class: 'panel-title', textContent: `我的 Prompt（${prompts.length}）` }));

  if (prompts.length === 0) {
    const empty = el('div', { class: 'empty' });
    empty.append(
      el('p', { textContent: '还没有 prompt，在右侧创建第一条吧。' }),
      el('p', { class: 'empty-hint', textContent: '创建后，打开豆包或 DeepSeek 的聊天页即可使用。' }),
    );
    listWrap.append(empty);
    return listWrap;
  }

  const ul = el('ul', { class: 'prompt-list' });
  prompts.forEach((p, i) => {
    ul.append(renderItem(p, i));
  });
  listWrap.append(ul);
  return listWrap;
}

function renderItem(p: Prompt, i: number): HTMLElement {
  const li = el('li', { class: 'prompt-item', dataset: { id: p.id } });

  const main = el('div', { class: 'item-main' });
  const nameRow = el('div', { class: 'item-name-row' });
  nameRow.append(el('span', { class: 'item-name', textContent: p.name }));
  const posTag = el('span', {
    class: `tag tag-${p.position}`,
    textContent: p.position === 'prepend' ? '插到最前' : '追加到最后',
  });
  nameRow.append(posTag);
  main.append(nameRow);
  main.append(
    el('pre', { class: 'item-content', textContent: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content }),
  );

  const actions = el('div', { class: 'item-actions' });
  const up = el('button', { class: 'btn btn-ghost btn-sm', textContent: '↑', title: '上移' });
  up.disabled = i === 0;
  up.onclick = () => void move(p.id, -1);
  const down = el('button', { class: 'btn btn-ghost btn-sm', textContent: '↓', title: '下移' });
  down.disabled = i === prompts.length - 1;
  down.onclick = () => void move(p.id, +1);
  const edit = el('button', { class: 'btn btn-ghost btn-sm', textContent: '编辑' });
  edit.onclick = () => startEdit(p.id);
  const del = el('button', { class: 'btn btn-danger btn-sm', textContent: '删除' });
  del.onclick = () => void remove(p.id);
  actions.append(up, down, edit, del);

  li.append(main, actions);
  return li;
}

function renderEditor(): HTMLElement {
  const panel = el('section', { class: 'panel editor-panel' });
  const isEditing = editor.editingId !== null;
  panel.append(
    el('h2', { class: 'panel-title', textContent: isEditing ? '编辑 Prompt' : '新建 Prompt' }),
  );

  const nameLabel = el('label', { class: 'field-label', textContent: `名称（≤ ${LIMITS.nameMaxLength} 字）` });
  const nameInput = el('input', {
    class: 'input',
    value: editor.name,
    placeholder: '例如：翻译成英文',
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => (editor.name = nameInput.value));

  const posLabel = el('div', { class: 'field-label', textContent: '插入位置（相对输入框已有内容）' });
  const posRow = el('div', { class: 'radio-row' });
  const radios = (['prepend', 'append'] as const).map((pos) => {
    const id = `pos-${pos}`;
    const radio = el('input', { type: 'radio', id, name: 'position', value: pos }) as HTMLInputElement;
    radio.checked = editor.position === pos;
    radio.addEventListener('change', () => {
      if (radio.checked) editor.position = pos;
    });
    const lab = el('label', { class: 'radio-label', for: id, textContent: pos === 'prepend' ? '插到最前' : '追加到最后' });
    lab.prepend(radio);
    return lab;
  });
  posRow.append(...radios);

  const contentLabel = el('label', {
    class: 'field-label',
    textContent: `内容（≤ ${LIMITS.contentMaxLength} 字）`,
  });
  const contentInput = el('textarea', {
    class: 'input textarea',
    placeholder: 'prompt 正文，支持多行…',
    rows: '10',
  }) as HTMLTextAreaElement;
  contentInput.value = editor.content;
  contentInput.addEventListener('input', () => (editor.content = contentInput.value));

  const err = el('div', { class: 'form-error', role: 'alert' });
  const btnRow = el('div', { class: 'btn-row' });
  // 显式 type="button"：防止 form 内默认 submit 行为导致 onclick + submit 双触发、重复创建
  const save = el('button', { class: 'btn btn-primary', type: 'button', textContent: isEditing ? '保存' : '创建' });
  save.onclick = () => void saveCurrent(err);
  btnRow.append(save);
  if (isEditing) {
    const cancel = el('button', { class: 'btn btn-ghost', type: 'button', textContent: '取消' });
    cancel.onclick = () => {
      editor = emptyEditor();
      render(document.getElementById('app')!);
    };
    btnRow.append(cancel);
  }

  const form = el('form', { class: 'form' });
  form.addEventListener('submit', (e) => {
    e.preventDefault(); // 兜底：Enter 提交场景
    void saveCurrent(err);
  });
  form.append(
    nameLabel,
    nameInput,
    posLabel,
    posRow,
    contentLabel,
    contentInput,
    el('div', {
      class: 'field-hint',
      textContent:
        '支持变量（插入时自动替换）：{{clipboard}} 剪贴板、{{selection}} 页面选中文本、{{date}} {{time}} {{datetime}} 日期时间、{{url}} {{title}} 页面信息',
    }),
    err,
    btnRow,
  );
  panel.append(form);
  return panel;
}

// ---------- 动作 ----------

function startEdit(id: string): void {
  const p = prompts.find((x) => x.id === id);
  if (!p) return;
  editor = { editingId: p.id, name: p.name, content: p.content, position: p.position };
  render(document.getElementById('app')!);
}

async function saveCurrent(errEl: HTMLElement): Promise<void> {
  if (saving) return; // 双事件/连点防重入
  const error = validatePromptInput({ name: editor.name, content: editor.content, position: editor.position });
  if (error) {
    errEl.textContent = error;
    return;
  }
  saving = true;
  try {
    if (editor.editingId) {
      await storage.update(editor.editingId, {
        name: editor.name,
        content: editor.content,
        position: editor.position,
      });
    } else {
      await storage.create({ name: editor.name, content: editor.content, position: editor.position });
    }
    editor = emptyEditor();
    render(document.getElementById('app')!);
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving = false;
  }
}

async function move(id: string, delta: number): Promise<void> {
  const ids = prompts.map((p) => p.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await storage.reorder(ids);
}

async function remove(id: string): Promise<void> {
  const p = prompts.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`确定删除「${p.name}」？`)) return;
  await storage.remove(id);
  if (editor.editingId === id) {
    editor = emptyEditor();
    render(document.getElementById('app')!);
  }
}
