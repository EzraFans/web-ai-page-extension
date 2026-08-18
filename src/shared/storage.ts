import { EMPTY_INDEX, INDEX_KEY, SYNC_SOFT_LIMIT_BYTES, promptKey } from './keys';
import type { Prompt, PromptInput, StorageIndex } from './types';


type Area = 'sync' | 'local';
void (undefined as Area | undefined);

/**
 * prompt 存储：sync 优先，配额超限自动降级 local。
 * 每条 prompt 独立 key（wpx:p:<id>），排序存于 wpx:index，避免单 item 8KB 限制。
 */
export class StorageService {
  private listeners = new Set<(prompts: Prompt[]) => void>();
  private started = false;

  /** 按索引顺序返回全部 prompt（local 中的降级条目一并合并） */
  async list(): Promise<Prompt[]> {
    const index = await this.readIndex();
    if (index.order.length === 0) return [];
    const keys = index.order.map(promptKey);
    const [syncItems, localItems] = await Promise.all([
      chrome.storage.sync.get(keys),
      chrome.storage.local.get(keys),
    ]);
    const merged: Prompt[] = [];
    for (const id of index.order) {
      const p = syncItems[promptKey(id)] ?? localItems[promptKey(id)];
      if (p) merged.push(p as Prompt);
    }
    return merged;
  }

  async get(id: string): Promise<Prompt | null> {
    const key = promptKey(id);
    const [s, l] = await Promise.all([
      chrome.storage.sync.get(key),
      chrome.storage.local.get(key),
    ]);
    return (s[key] ?? l[key] ?? null) as Prompt | null;
  }

  async create(input: PromptInput): Promise<Prompt> {
    const now = Date.now();
    const prompt: Prompt = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      content: input.content,
      position: input.position,
      createdAt: now,
      updatedAt: now,
    };
    await this.writePrompt(prompt, null);
    const index = await this.readIndex();
    index.order.push(prompt.id);
    await this.writeIndex(index);
    return prompt;
  }

  async update(id: string, patch: Partial<PromptInput>): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`prompt 不存在: ${id}`);
    const next: Prompt = {
      ...existing,
      ...('name' in patch ? { name: (patch.name ?? existing.name).trim() } : {}),
      ...('content' in patch ? { content: patch.content ?? existing.content } : {}),
      ...('position' in patch ? { position: patch.position ?? existing.position } : {}),
      updatedAt: Date.now(),
    };
    await this.writePrompt(next, existing);
  }

  async remove(id: string): Promise<void> {
    const key = promptKey(id);
    // 两个 area 都删，避免残留
    await Promise.all([chrome.storage.sync.remove(key), chrome.storage.local.remove(key)]);
    const index = await this.readIndex();
    const i = index.order.indexOf(id);
    if (i >= 0) {
      index.order.splice(i, 1);
      await this.writeIndex(index);
    }
  }

  /** 只写索引一次，不触碰明细，避免烧写配额 */
  async reorder(orderedIds: string[]): Promise<void> {
    const index = await this.readIndex();
    const known = new Set(index.order);
    const next = orderedIds.filter((id) => known.has(id));
    // 防御：把漏掉的 id 追加到尾部
    for (const id of index.order) if (!next.includes(id)) next.push(id);
    await this.writeIndex({ version: 1, order: next });
  }

  /** storage.onChanged 订阅，返回取消函数 */
  onChange(cb: (prompts: Prompt[]) => void): () => void {
    this.listeners.add(cb);
    this.ensureWatcher();
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    void this.list().then((ps) => {
      for (const cb of this.listeners) cb(ps);
    });
  }

  private ensureWatcher(): void {
    if (this.started) return;
    this.started = true;
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'sync' || area === 'local') this.notify();
    });
  }

  private async readIndex(): Promise<StorageIndex> {
    const r = await chrome.storage.sync.get(INDEX_KEY);
    const idx = r[INDEX_KEY] as StorageIndex | undefined;
    if (!idx || !Array.isArray(idx.order)) return { ...EMPTY_INDEX };
    return idx;
  }

  /** 索引很小（几十个 uuid < 2KB），永远存 sync */
  private async writeIndex(index: StorageIndex): Promise<void> {
    await chrome.storage.sync.set({ [INDEX_KEY]: index });
  }

  /**
   * 写入单条 prompt：优先 sync；原值在 local（曾降级）或 sync 空间不足时写 local。
   * 写 sync 失败（QUOTA_*）也降级 local，保证用户数据不丢。
   */
  private async writePrompt(prompt: Prompt, previous: Prompt | null): Promise<void> {
    const key = promptKey(prompt.id);
    const degraded = previous
      ? (await chrome.storage.local.get(key))[key] !== undefined
      : false;

    if (!degraded) {
      const bytes = await chrome.storage.sync.getBytesInUse().catch(() => 0);
      const payloadBytes = new Blob([JSON.stringify({ [key]: prompt })]).size;
      if (bytes + payloadBytes <= SYNC_SOFT_LIMIT_BYTES) {
        try {
          await chrome.storage.sync.set({ [key]: prompt });
          await chrome.storage.local.remove(key);
          return;
        } catch {
          // fallthrough 降级 local
        }
      }
    }
    await chrome.storage.local.set({ [key]: prompt });
  }

  /** 测试/调试用：清空全部数据 */
  async clearAll(): Promise<void> {
    const index = await this.readIndex();
    const keys = index.order.map(promptKey);
    await Promise.all([
      chrome.storage.sync.remove([...keys, INDEX_KEY]),
      chrome.storage.local.remove(keys),
    ]);
  }
}

export function lastErrorMessage(): string | null {
  return chrome.runtime.lastError?.message ?? null;
}

export function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /quota/i.test(msg);
}

/** 供 UI 使用的单例 */
export const storage = new StorageService();

declare global {
  interface Window {
    __wpxStorage?: StorageService;
  }
}
