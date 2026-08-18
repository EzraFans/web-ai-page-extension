import type { StorageIndex } from './types';

export const PREFIX = 'wpx';

/** 单条 prompt 的 key：wpx:p:<id>（per-item key，规避 sync 单 item 8KB 限制） */
export function promptKey(id: string): string {
  return `${PREFIX}:p:${id}`;
}

/** 索引 key：wpx:index */
export const INDEX_KEY = `${PREFIX}:index`;

/** 站点配置数组 key：wpx:sites（整体读写，体量小） */
export const SITES_KEY = `${PREFIX}:sites`;

export const EMPTY_INDEX: StorageIndex = { version: 1, order: [] };

/** sync 总量软上限（实际 102400 字节），超过后新写入降级 local */
export const SYNC_SOFT_LIMIT_BYTES = 92 * 1024;
