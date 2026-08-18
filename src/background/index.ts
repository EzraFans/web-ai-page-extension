import { INDEX_KEY } from '../shared/keys';

// 极简 background：安装时若没有任何 prompt 则打开管理页引导用户添加
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.storage.sync.get(INDEX_KEY).then((r) => {
    const idx = r[INDEX_KEY] as { order?: string[] } | undefined;
    if (!idx || !idx.order || idx.order.length === 0) {
      void chrome.runtime.openOptionsPage();
    }
  });
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
