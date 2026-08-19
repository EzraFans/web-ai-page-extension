import { storage } from '../shared/storage';
import {
  LIMITS,
  validatePromptInput,
  type InsertPosition,
  type Prompt,
} from '../shared/types';
import { el } from './el';
import { initSites, renderSitesSection } from './sites';
import { exportData, importFromFile } from './backup';

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
/** 保存进行中的编辑器快照：防重入（连点/双事件）、未保存判断、保存后是否清空都以它为基准 */
let inFlightSave: EditorState | null = null;
/** 最近一次保存失败的提示：经下一次 render 呈现到表单、呈现即消费（errEl 闭包节点可能已随重建失效） */
let saveError: string | null = null;
let tab: Tab = 'prompts';

function emptyEditor(): EditorState {
  return { editingId: null, name: '', content: '', position: 'append' };
}

export function initApp(root: HTMLElement): void {
  render(root);
  initSites(rerenderOnStorageChange);

  storage.onChange((next) => {
    prompts = next;
    // 若正在编辑的条目被（其他页面）删除，退出编辑态
    if (editor.editingId && !prompts.some((p) => p.id === editor.editingId)) {
      editor = emptyEditor();
    }
    rerenderOnStorageChange();
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

  // 备份：按当前 Tab 区分范围（Prompt 管理页=导入导出 prompt，站点管理页=站点配置）
  const actions = el('div', { class: 'header-actions' });
  const expBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', textContent: '导出' });
  expBtn.onclick = () => void exportData(tab);
  const fileInput = el('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  fileInput.style.display = 'none';
  // 文件选择框打开期间 Tab 理论上可切换，以点击导入按钮那一刻的范围为准
  let importScope: 'prompts' | 'sites' = tab;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = ''; // 允许重复选择同一文件
    if (f) void importFromFile(f, importScope);
  });
  const impBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', textContent: '导入' });
  impBtn.onclick = () => {
    importScope = tab;
    fileInput.click();
  };
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

/**
 * 存储事件驱动的重渲染（prompt / 站点两个存储监听共用）：
 * 保存在途时跳过——saveCurrent 成功收尾或失败分支会统一 render，
 * 避免重建表单打断正在输入的焦点/输入法组合态。
 */
function rerenderOnStorageChange(): void {
  if (inFlightSave !== null) return;
  render(document.getElementById('app')!);
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
  const li = el('li', {
    class: `prompt-item${editor.editingId === p.id ? ' active' : ''}`,
    dataset: { id: p.id },
    title: '点击在右侧编辑',
    tabIndex: '0', // 键盘可达；camelCase 的 tabIndex 才是有效 DOM property，小写 tabindex 只是无效 expando
  });

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
  const del = el('button', { class: 'btn btn-danger btn-sm icon-btn', textContent: '✕', title: '删除' });
  del.onclick = () => void remove(p.id);
  actions.append(up, down, del);

  // 点击 / 聚焦后 Enter·空格 均可直接在右侧进入编辑（操作按钮自身的事件不拦截）；有未保存修改先确认
  const activate = (e: Event) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e instanceof KeyboardEvent) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); // 空格默认会滚动页面
    }
    if (confirmDiscard()) startEdit(p.id);
  };
  li.addEventListener('click', activate);
  li.addEventListener('keydown', activate);

  li.append(main, actions);
  return li;
}

function renderEditor(): HTMLElement {
  const panel = el('section', { class: 'panel editor-panel' });
  const isEditing = editor.editingId !== null;
  const titleRow = el('div', { class: 'panel-title-row' });
  titleRow.append(el('h2', { class: 'panel-title', textContent: isEditing ? '编辑 Prompt' : '新建 Prompt' }));
  const createNew = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', textContent: '＋ 新建' });
  createNew.onclick = () => {
    if (!confirmDiscard()) return;
    editor = emptyEditor();
    render(document.getElementById('app')!);
  };
  titleRow.append(createNew);
  panel.append(titleRow);

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

  // 上次保存失败的提示取自模块状态：保存期间表单可能已被重建（切换条目等），写旧节点用户看不到
  const err = el('div', { class: 'form-error', role: 'alert', textContent: saveError ?? '' });
  saveError = null; // 呈现即消费，显示生命周期与旧行为一致（到下次重渲染为止）
  const btnRow = el('div', { class: 'btn-row' });
  // 显式 type="button"：防止 form 内默认 submit 行为导致 onclick + submit 双触发、重复创建
  const save = el('button', { class: 'btn btn-primary', type: 'button', textContent: '保存' });
  save.onclick = () => void saveCurrent(err);
  btnRow.append(save);

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

/** 三项内容字段是否一致（EditorState 与 Prompt 通用） */
function sameContent(
  a: Pick<EditorState, 'name' | 'content' | 'position'>,
  b: Pick<EditorState, 'name' | 'content' | 'position'>,
): boolean {
  return a.name === b.name && a.content === b.content && a.position === b.position;
}

/** 编辑器是否有未保存的修改（保存进行中的内容以快照为基准，落库前不算丢失） */
function editorIsDirty(): boolean {
  // 新建且没输入过内容：没有可丢弃的修改
  if (editor.editingId === null && editor.name === '' && editor.content === '') return false;
  // 基准：对得上号的保存快照，否则已存储内容（新建 / 条目已不存在则视为空）
  const ref =
    inFlightSave !== null && inFlightSave.editingId === editor.editingId
      ? inFlightSave
      : prompts.find((p) => p.id === editor.editingId) ?? emptyEditor();
  return !sameContent(editor, ref);
}

/** 有未保存修改时先确认再放弃；返回 false 表示用户取消 */
function confirmDiscard(): boolean {
  return !editorIsDirty() || confirm('当前编辑内容尚未保存，确定放弃修改吗？');
}

function startEdit(id: string): void {
  if (inFlightSave !== null && inFlightSave.editingId === id) {
    // 该条正在保存中：以保存快照为准重载（此刻存储里可能还是旧值，按旧值重载会把显示回退）
    editor = { ...inFlightSave };
  } else {
    const p = prompts.find((x) => x.id === id);
    if (!p) return;
    editor = { editingId: p.id, name: p.name, content: p.content, position: p.position };
  }
  render(document.getElementById('app')!);
}

async function saveCurrent(errEl: HTMLElement): Promise<void> {
  if (inFlightSave !== null) {
    // 双事件/连点防重入：同一保存的重复触发静默忽略；
    // 保存期间已切到其他内容再点保存时，明确提示而非静默丢弃
    if (editor.editingId !== inFlightSave.editingId || !sameContent(editor, inFlightSave)) {
      errEl.textContent = '正在保存上一条，请稍候再试';
    }
    return;
  }
  saveError = null; // 新的保存尝试：清掉上一次的失败提示
  const error = validatePromptInput({ name: editor.name, content: editor.content, position: editor.position });
  if (error) {
    errEl.textContent = error;
    return;
  }
  editor.name = editor.name.trim(); // 与 storage 端写入时的 trim 对齐，避免保存后被误判"有未保存修改"
  const snapshot: EditorState = { ...editor }; // await 前固定本次要保存的值
  inFlightSave = snapshot;
  try {
    if (snapshot.editingId) {
      await storage.update(snapshot.editingId, {
        name: snapshot.name,
        content: snapshot.content,
        position: snapshot.position,
      });
      // 编辑保存后停留在该条，右侧展示已保存内容、左侧保持高亮
    } else {
      await storage.create({ name: snapshot.name, content: snapshot.content, position: snapshot.position });
      // 仅当保存期间用户未切换条目、未继续输入时才清空，避免覆盖刚点开的条目
      if (editor.editingId === snapshot.editingId && sameContent(editor, snapshot)) {
        editor = emptyEditor();
      }
    }
    render(document.getElementById('app')!);
  } catch (e) {
    // 失败提示写入模块状态并重渲染：errEl 可能已随保存期间的切换/重建而脱离文档；
    // 重渲染同时把 onChange 在途跳过的列表/表单变化一并呈现（editor 可能已被重置）
    saveError = e instanceof Error ? e.message : '保存失败';
    render(document.getElementById('app')!);
  } finally {
    inFlightSave = null;
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
