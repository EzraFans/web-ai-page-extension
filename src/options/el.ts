/** options 页公共 DOM 构建器（createElement，Trusted Types 安全） */
export type ElProps = {
  class?: string;
  textContent?: string;
  dataset?: Record<string, string>;
} & Record<string, string | Record<string, string> | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, dataset, ...rest } = props;
  if (cls) node.className = cls;
  if (dataset) Object.assign(node.dataset, dataset);
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') {
      if (k === 'textContent') node.textContent = v;
      else (node as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return node;
}
