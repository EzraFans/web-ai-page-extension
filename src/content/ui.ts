/**
 * Trusted Types 安全的 DOM 构建工具。
 * 豆包启用了 Trusted Types CSP，content script（isolated world）同样受约束，
 * 因此全部用 createElement/textContent 构建 UI，绝不使用 innerHTML。
 */

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  style?: string;
  dataset?: Record<string, string>;
  [attr: string]: string | Record<string, string> | undefined;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, text, style, dataset, ...attrs } = props;
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (style != null) node.setAttribute('style', style);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

function append(parent: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    parent.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** 简单 SVG 图标（sendMessage/管理用），用 DOM API 构建 */
export function svgIcon(paths: string[], size = 16): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** 悬浮按钮图标：闪电/列表 */
export const ICONS = {
  bolt: [
    'M13 2 L3 14 h7 l-1 8 L19 10 h-7 z',
  ],
  chevronDown: ['M6 9 l6 6 6-6'],
  plus: ['M12 5 v14', 'M5 12 h14'],
  settings: [
    'M4 6 h16',
    'M4 12 h16',
    'M4 18 h16',
  ],
  check: ['M20 6 L9 17 l-5-5'],
} as const;
