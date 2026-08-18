import { makeAdapterFromConfig } from './adapters';
import { FloaterController } from './controller';
import { sites } from '../shared/storage';

/**
 * content script 入口。站点配置在 chrome.storage（管理页可改），
 * 启动时按当前 hostname 取启用的配置；无配置（未启用/非目标站）静默退出。
 * 配置热更新：管理页保存后本页自动销毁重建悬浮按钮，无需刷新页面。
 */
let controller: FloaterController | null = null;

async function boot(): Promise<void> {
  const cfg = await sites.getEnabledForHost(location.hostname);
  controller?.destroy();
  controller = null;
  if (!cfg) {
    console.log('[wpx] 当前站点未启用或无配置:', location.hostname);
    return;
  }
  controller = new FloaterController(makeAdapterFromConfig(cfg));
  void controller.start();
}

void boot();
sites.onChange(() => void boot());

// 快捷键（manifest commands → background → 消息转发）
chrome.runtime.onMessage.addListener((msg: unknown) => {
  if ((msg as { type?: string } | null)?.type === 'toggle-panel') controller?.togglePanel();
});
