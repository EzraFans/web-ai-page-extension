import { INDEX_KEY } from '../shared/keys';
import { sites } from '../shared/storage';
import { syncSiteScripts } from '../shared/site-scripts';

// 极简 background：安装时若没有任何 prompt 则打开管理页引导用户添加
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.get(INDEX_KEY).then((r) => {
      const idx = r[INDEX_KEY] as { order?: string[] } | undefined;
      if (!idx || !idx.order || idx.order.length === 0) {
        void chrome.runtime.openOptionsPage();
      }
    });
  }
  // 安装/更新后重同步自建站点注册（幂等自愈）
  void sites.list().then((list) => syncSiteScripts(list));
});

// 浏览器启动时自愈：动态注册正常会随 persistAcrossSessions 保留，
// 但被 Chrome 清理/扩展异常时由此补回
chrome.runtime.onStartup.addListener(() => {
  void sites.list().then((list) => syncSiteScripts(list));
});

// 点击工具栏图标 → 打开管理页
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

// content script 无法调用 openOptionsPage，经消息转发
chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'open-options'
  ) {
    void chrome.runtime.openOptionsPage();
  }
});

// 快捷键（默认 Alt+P）→ 当前标签页开关面板
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-panel') return;
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (tab?.id == null) return;
      // 站点未注入 content script 时会抛错，忽略即可
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => undefined);
    });
});
