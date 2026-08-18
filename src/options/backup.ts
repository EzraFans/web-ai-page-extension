import { sites, storage } from '../shared/storage';
import { syncSiteScripts } from '../shared/site-scripts';
import { validatePromptInput, type Prompt, type SiteConfig } from '../shared/types';

/**
 * 配置备份（按当前 Tab 区分范围）：
 * - prompts：仅导出/导入 prompt（同 id 覆盖、新 id 追加）
 * - sites：仅导出/导入站点配置——内置站点按 id 覆盖（保留用户改过的选择器），
 *   自建站点 id 相同覆盖、域名撞别的站点跳过，导入后重注册动态脚本
 */

export type BackupKind = 'prompts' | 'sites';

interface BackupFile {
  kind: 'wpx-backup';
  version: 1;
  scope: BackupKind;
  exportedAt: string;
  prompts: Prompt[];
  sites: SiteConfig[];
}

export async function exportData(scope: BackupKind): Promise<void> {
  const [prompts, siteList] = await Promise.all([storage.list(), sites.list()]);
  const data: BackupFile = {
    kind: 'wpx-backup',
    version: 1,
    scope,
    exportedAt: new Date().toISOString(),
    prompts: scope === 'prompts' ? prompts : [],
    sites: scope === 'sites' ? siteList : [],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wpx-${scope}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file: File, scope: BackupKind): Promise<void> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text()) as BackupFile;
  } catch {
    alert('文件不是有效的 JSON');
    return;
  }
  if (!data || data.kind !== 'wpx-backup') {
    alert('不是本扩展导出的备份文件（缺少 wpx-backup 标识）');
    return;
  }
  if (scope === 'prompts') await importPrompts(data);
  else await importSites(data);
}

// ---------- prompt ----------

async function importPrompts(data: BackupFile): Promise<void> {
  const items = Array.isArray(data.prompts) ? data.prompts : [];
  const valid: Prompt[] = [];
  let bad = 0;
  for (const p of items) {
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
      valid.push({ ...p, createdAt: p.createdAt || now, updatedAt: now });
    } else {
      bad++;
    }
  }
  if (valid.length === 0) {
    alert(bad ? `没有可导入的 prompt（${bad} 条无效）` : '文件里没有 prompt 数据');
    return;
  }
  if (
    !confirm(
      `确认导入 ${valid.length} 条 prompt？${bad ? `（另有 ${bad} 条无效将跳过）` : ''}\n同 id 的条目将被覆盖。`,
    )
  ) {
    return;
  }
  const { added, updated } = await storage.importAll(valid);
  alert(`导入完成：新增 ${added} 条，覆盖 ${updated} 条。`);
}

// ---------- 站点 ----------

async function importSites(data: BackupFile): Promise<void> {
  const items = Array.isArray(data.sites) ? data.sites : [];
  const existing = await sites.list();
  const byId = new Map(existing.map((s) => [s.id, s]));
  // hostname → 站点 id 映射，用于域名冲突检测
  const hostOwner = new Map<string, string>();
  for (const s of existing) for (const h of s.hostnames) hostOwner.set(h, s.id);

  const toSave: SiteConfig[] = [];
  let bad = 0;
  let clash = 0;
  let unknownBuiltin = 0;
  for (const s of items) {
    const shapeOk =
      !!s &&
      typeof s.id === 'string' &&
      s.id.length > 0 &&
      typeof s.name === 'string' &&
      Array.isArray(s.matchPatterns) &&
      s.matchPatterns.length > 0 &&
      Array.isArray(s.hostnames) &&
      s.hostnames.length > 0 &&
      Array.isArray(s.inputSelectors) &&
      (s.anchorMode === 'auto' || s.anchorMode === 'selector') &&
      typeof s.buttonOffset === 'object' && s.buttonOffset !== null;
    if (!shapeOk) {
      bad++;
      continue;
    }
    if (s.builtin) {
      // 内置站点：本机已有同 id 才覆盖（保留用户改过的选择器），未知内置忽略
      if (byId.has(s.id)) toSave.push(s);
      else unknownBuiltin++;
      continue;
    }
    // 自建站点：域名被「别的」站点占用则跳过
    const clashed = s.hostnames.some((h) => hostOwner.has(h) && hostOwner.get(h) !== s.id);
    if (clashed) {
      clash++;
      continue;
    }
    toSave.push(s);
  }

  if (toSave.length === 0) {
    alert(
      `没有可导入的站点${
        bad || clash || unknownBuiltin
          ? `（无效 ${bad}、域名冲突 ${clash}、未知内置 ${unknownBuiltin}）`
          : ''
      }，或文件里没有站点数据`,
    );
    return;
  }
  if (
    !confirm(
      `确认导入 ${toSave.length} 个站点？${clash ? `（${clash} 个域名冲突跳过）` : ''}\n同 id 的站点将被覆盖。`,
    )
  ) {
    return;
  }
  for (const s of toSave) await sites.save(s);
  const list = await sites.list();
  const result = await syncSiteScripts(list);
  const regFail = result.failed.length
    ? `\n注意：站点 ${result.failed.join('、')} 注册失败，请在站点管理里点「授权」`
    : '';
  alert(`导入完成：站点 ${toSave.length} 个。${regFail}`);
}
