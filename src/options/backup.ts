import { sites, storage } from '../shared/storage';
import { syncSiteScripts } from '../shared/site-scripts';
import { validatePromptInput, type Prompt, type SiteConfig } from '../shared/types';

/**
 * 配置备份：导出全部 prompt + 站点为 JSON；导入时逐条校验、
 * prompt 同 id 覆盖、站点跳过内置与域名冲突项，导入后重注册动态脚本。
 */

interface BackupFile {
  kind: 'wpx-backup';
  version: 1;
  exportedAt: string;
  prompts: Prompt[];
  sites: SiteConfig[];
}

export async function exportAll(): Promise<void> {
  const [prompts, siteList] = await Promise.all([storage.list(), sites.list()]);
  const data: BackupFile = {
    kind: 'wpx-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    prompts,
    sites: siteList,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wpx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file: File): Promise<void> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text()) as BackupFile;
  } catch {
    alert('文件不是有效的 JSON');
    return;
  }
  if (!data || data.kind !== 'wpx-backup' || !Array.isArray(data.prompts)) {
    alert('不是本扩展导出的备份文件（缺少 wpx-backup 标识）');
    return;
  }

  // ---- prompt：结构 + 业务校验 ----
  const validPrompts: Prompt[] = [];
  let badPrompts = 0;
  for (const p of data.prompts) {
    const shapeOk =
      typeof p?.id === 'string' &&
      p.id.length > 0 &&
      typeof p.name === 'string' &&
      typeof p.content === 'string' &&
      (p.position === 'prepend' || p.position === 'append');
    if (
      shapeOk &&
      !validatePromptInput({ name: p.name, content: p.content, position: p.position })
    ) {
      const now = Date.now();
      validPrompts.push({ ...p, createdAt: p.createdAt || now, updatedAt: now });
    } else {
      badPrompts++;
    }
  }

  // ---- 站点：跳过内置 id 与域名冲突 ----
  const existing = await sites.list();
  const existingHosts = new Set(existing.flatMap((s) => s.hostnames));
  const validSites: SiteConfig[] = [];
  let badSites = 0;
  let clashSites = 0;
  const siteItems = Array.isArray(data.sites) ? data.sites : [];
  for (const s of siteItems) {
    const shapeOk =
      !!s &&
      typeof s.id === 'string' &&
      s.builtin === false &&
      Array.isArray(s.matchPatterns) &&
      s.matchPatterns.length > 0 &&
      Array.isArray(s.hostnames) &&
      s.hostnames.length > 0 &&
      Array.isArray(s.inputSelectors) &&
      (s.anchorMode === 'auto' || s.anchorMode === 'selector') &&
      typeof s.buttonOffset === 'object' && s.buttonOffset !== null;
    if (!shapeOk) {
      badSites++;
      continue;
    }
    if (s.hostnames.some((h) => existingHosts.has(h))) {
      clashSites++;
      continue;
    }
    for (const h of s.hostnames) existingHosts.add(h);
    validSites.push(s);
  }

  if (validPrompts.length === 0 && validSites.length === 0) {
    alert('没有可导入的内容（条目无效或全部冲突）');
    return;
  }

  const summary = [
    `prompt：导入 ${validPrompts.length} 条${badPrompts ? `，无效跳过 ${badPrompts} 条` : ''}`,
    validSites.length
      ? `站点：导入 ${validSites.length} 个${clashSites ? `，域名冲突跳过 ${clashSites} 个` : ''}${
          badSites ? `，无效跳过 ${badSites} 个` : ''
        }`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (!confirm(`确认导入？\n${summary}\n\n同 id 的条目将被覆盖（导入后导入文件里没有的条目不受影响）。`)) {
    return;
  }

  const { added, updated } = await storage.importAll(validPrompts);
  for (const s of validSites) await sites.save(s);
  const list = await sites.list();
  const result = await syncSiteScripts(list);
  const regFail = result.failed.length
    ? `\n注意：站点 ${result.failed.join('、')} 注册失败，请在站点管理里点「授权」`
    : '';
  alert(`导入完成：prompt 新增 ${added} 条、覆盖 ${updated} 条；站点 ${validSites.length} 个。${regFail}`);
}
