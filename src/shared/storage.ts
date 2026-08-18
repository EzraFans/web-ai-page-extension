import { EMPTY_INDEX, INDEX_KEY, SITES_KEY, SYNC_SOFT_LIMIT_BYTES, promptKey } from './keys';
import { DEFAULT_SITES } from './default-sites';
import type { Prompt, PromptInput, SiteConfig, StorageIndex } from './types';


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

  /**
   * 批量导入（备份恢复）：同 id 覆盖明细且保持原顺序位置，新 id 追加到尾部。
   * 返回 { added, updated } 供导入完成后汇报。
   */
  async importAll(items: Prompt[]): Promise<{ added: number; updated: number }> {
    const index = await this.readIndex();
    let added = 0;
    let updated = 0;
    for (const p of items) {
      if (index.order.includes(p.id)) {
        updated++;
        await this.writePrompt(p, await this.get(p.id));
      } else {
        index.order.push(p.id);
        await this.writePrompt(p, null);
        added++;
      }
    }
    await this.writeIndex(index);
    return { added, updated };
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

/**
 * 站点配置存储：单 key 整体读写（配置体量小，远低于 sync 单 item 8KB 限制）。
 * 首次读取惰性写入内置站点；之后每次读取补齐缺失的内置站点
 * （扩展升级新增内置站点 / 存储被清时不丢预置项），不触碰用户自建条目。
 */
export class SiteStorage {
  private listeners = new Set<(sites: SiteConfig[]) => void>();
  private started = false;

  async list(): Promise<SiteConfig[]> {
    const r = await chrome.storage.sync.get(SITES_KEY);
    const stored = r[SITES_KEY] as SiteConfig[] | undefined;
    let sites: SiteConfig[];
    let changed = false;
    if (!Array.isArray(stored) || stored.length === 0) {
      sites = structuredClone(DEFAULT_SITES);
      changed = true;
    } else {
      sites = [...stored];
      for (const def of DEFAULT_SITES) {
        if (!sites.some((s) => s.id === def.id)) {
          sites.push(structuredClone(def));
          changed = true;
        }
      }
    }
    if (changed) await chrome.storage.sync.set({ [SITES_KEY]: sites });
    return sites;
  }

  /** upsert：按 id 匹配，存在则整体替换，否则追加 */
  async save(site: SiteConfig): Promise<void> {
    const sites = await this.list();
    const i = sites.findIndex((s) => s.id === site.id);
    if (i >= 0) sites[i] = site;
    else sites.push(site);
    await chrome.storage.sync.set({ [SITES_KEY]: sites });
  }

  async remove(id: string): Promise<void> {
    const sites = await this.list();
    const target = sites.find((s) => s.id === id);
    if (!target) return;
    if (target.builtin) throw new Error('内置站点不可删除，可将其禁用');
    await chrome.storage.sync.set({ [SITES_KEY]: sites.filter((s) => s.id !== id) });
  }

  /** content script 入口：按当前页 hostname 找启用的配置 */
  async getEnabledForHost(hostname: string): Promise<SiteConfig | null> {
    const sites = await this.list();
    return sites.find((s) => s.enabled && s.hostnames.includes(hostname)) ?? null;
  }

  /** storage.onChanged 订阅，返回取消函数 */
  onChange(cb: (sites: SiteConfig[]) => void): () => void {
    this.listeners.add(cb);
    this.ensureWatcher();
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    void this.list().then((next) => {
      for (const cb of this.listeners) cb(next);
    });
  }

  private ensureWatcher(): void {
    if (this.started) return;
    this.started = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' || area === 'local') && changes[SITES_KEY]) this.notify();
    });
  }
}

export const sites = new SiteStorage();

declare global {
  interface Window {
    __wpxStorage?: StorageService;
  }
}
