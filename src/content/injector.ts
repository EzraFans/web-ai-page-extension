import { placeCaret, readValue } from './dom';
import type { InsertPosition } from '../shared/types';

/**
 * 插入策略链（每步后读回验证，失败降级下一策略）：
 * 1. textarea   → 原生 setter 整体重设值 + input 事件（React 受控组件标准做法）
 * 1'.contented  → focus + Range 光标定位 + execCommand('insertText')（触发真实 input 事件，可撤销）
 * 2. paste      → ClipboardEvent('paste') + DataTransfer text/plain
 * 3. direct     → 直接设 value/textContent + input 事件（破坏撤销栈，最后手段）
 * 结束：光标移到末尾，保持 focus，用户可继续输入或自行发送。
 */

const JOINER = '\n\n';
/** 超过此长度时 execCommand 性能差，切换整体重设 */
const LONG_TEXT_THRESHOLD = 2000;

export async function insertPrompt(
  el: HTMLElement,
  text: string,
  position: InsertPosition,
): Promise<boolean> {
  const before = readValue(el);
  // 读回验证用的探针：取文本首段非空行，避免超长 prompt 全量比对
  const probe = text.trim().slice(0, 60);

  const strategies: Array<() => boolean> = isTextField(el)
    ? [() => viaNativeSetter(el as HTMLTextAreaElement, before, text, position)]
    : [
        () => viaExecCommand(el, before, text, position),
        () => viaPaste(el, before, text, position),
        () => viaDirectSet(el, before, text, position),
      ];

  for (const attempt of strategies) {
    let ok = false;
    try {
      ok = attempt();
    } catch {
      ok = false;
    }
    if (ok && verify(el, probe)) {
      el.focus();
      if (!isTextField(el)) placeCaret(el, 'end');
      return true;
    }
    // 尝试恢复原值再走下一策略（best effort，失败也无妨）
    restoreBestEffort(el, before);
  }
  return false;
}

function verify(el: HTMLElement, probe: string): boolean {
  if (!probe) return true;
  return readValue(el).includes(probe);
}

function compose(before: string, text: string, position: InsertPosition): string {
  const b = before;
  if (!b.trim()) return text; // 空输入框直接填入，不加换行
  return position === 'prepend' ? `${text}${JOINER}${b}` : `${b}${JOINER}${text}`;
}

function isTextField(el: HTMLElement): boolean {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

// ---- 策略 1：textarea 原生 setter（React 感知标准方案） ----
function viaNativeSetter(
  el: HTMLTextAreaElement | HTMLInputElement,
  before: string,
  text: string,
  position: InsertPosition,
): boolean {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return false;
  setter.call(el, compose(before, text, position));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// ---- 策略 1'：contenteditable + execCommand ----
function viaExecCommand(el: HTMLElement, before: string, text: string, position: InsertPosition): boolean {
  if (text.length > LONG_TEXT_THRESHOLD) return false; // 超长走 direct
  el.focus();
  // 空输入框无需 caret 前置差异，直接插
  if (!before.trim()) {
    placeCaret(el, 'end');
    return document.execCommand('insertText', false, text);
  }
  placeCaret(el, position === 'prepend' ? 'start' : 'end');
  const insertee = position === 'prepend' ? `${text}${JOINER}` : `${JOINER}${text}`;
  return document.execCommand('insertText', false, insertee);
}

// ---- 策略 2：模拟 paste 事件 ----
function viaPaste(el: HTMLElement, before: string, text: string, position: InsertPosition): boolean {
  el.focus();
  if (!before.trim()) placeCaret(el, 'end');
  else placeCaret(el, position === 'prepend' ? 'start' : 'end');
  const dt = new DataTransfer();
  dt.setData('text/plain', compose(before, text, position));
  const evt = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });
  el.dispatchEvent(evt);
  // paste 由站点编辑器异步处理，同步读不回；交给外层 verify 延迟一拍
  return true;
}

// ---- 策略 3：直接设值（破坏撤销栈，最后手段） ----
function viaDirectSet(el: HTMLElement, before: string, text: string, position: InsertPosition): boolean {
  const next = compose(before, text, position);
  if (isTextField(el)) {
    (el as HTMLTextAreaElement).value = next;
  } else {
    el.textContent = next;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  return true;
}

function restoreBestEffort(el: HTMLElement, before: string): void {
  try {
    if (isTextField(el)) {
      const setter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(el, before);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.textContent !== before) {
      el.textContent = before;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  } catch {
    // 忽略：尽力恢复即可
  }
}
