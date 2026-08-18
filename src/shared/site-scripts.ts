import type { SiteConfig } from './types';

/**
 * 用户自建站点的动态 content script 注册。
 * 内置站点（豆包/DeepSeek）走 manifest 静态匹配，不在此注册；
 * 自建站点由管理页保存时调用 syncSiteScripts 全量对齐（幂等，可重复调用）。
 * persistAcrossSessions: true 使注册在浏览器重启后保留，
 * background 的 onStartup/onInstalled 仍会重跑一次作为自愈。
 */

function scriptId(site: SiteConfig): string {
  return `wpx-site-${site.id}`;
}

export interface SyncResult {
  /** 注册失败（通常是对应域名的 host 权限未授予）的站点名 */
  failed: string[];
}

export async function syncSiteScripts(list: SiteConfig[]): Promise<SyncResult> {
  const failed: string[] = [];
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const staleIds = registered
    .map((s) => s.id)
    .filter((id): id is string => !!id && id.startsWith('wpx-site-'));
  // 先全部注销再重建：matches 可能变化，直接 register 会因 id 重复报错
  if (staleIds.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds }).catch(() => undefined);
  }

  for (const site of list) {
    if (site.builtin || !site.enabled || site.matchPatterns.length === 0) continue;
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: scriptId(site),
          matches: site.matchPatterns,
          js: ['content.js'],
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } catch {
      failed.push(site.name);
    }
  }
  return { failed };
}
